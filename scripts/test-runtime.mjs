// Dry-run tests for VF - Generation Worker v1 and VF - Provider Poll v1.
//
// Safety properties (asserted, not assumed):
//   - Everything runs inside ONE transaction that is always rolled back.
//   - Provider HTTP is mocked; global fetch is disabled; no provider request is sent.
//   - Aborts before touching anything if real PENDING / WAITING_PROVIDER jobs exist.
//   - Fixtures use a throwaway episode; the real Episode 2 run is never referenced.
//   - Optional --runtime-role=<role> runs every simulated workflow Postgres node
//     under SET LOCAL ROLE on the SAME admin transaction. Fixtures remain admin-owned,
//     so uncommitted fixtures are visible while RLS/grants are enforced for runtime SQL.
//
// It executes the BUILT workflow JSON (the artifact that is deployed) with a small
// n8n-compatible interpreter for the node types those workflows use.
import fs from 'node:fs';
import process from 'node:process';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });

const realFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Network disabled during dry-run tests'); };

const runtimeRoleArg = process.argv.find((a) => a.startsWith('--runtime-role='));
const RUNTIME_DB_ROLE = runtimeRoleArg ? runtimeRoleArg.slice('--runtime-role='.length) : null;
if (RUNTIME_DB_ROLE && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(RUNTIME_DB_ROLE)) {
  throw new Error('Invalid --runtime-role identifier');
}

const GEN = JSON.parse(fs.readFileSync('workflows/generation-worker.json', 'utf8'));
const POLL = JSON.parse(fs.readFileSync('workflows/provider-poll.json', 'utf8'));
const ARCHIVE = JSON.parse(fs.readFileSync('workflows/asset-archive.json', 'utf8'));
const LIB = ['contract.js', 'fal.js', 'kie.js', 'routing.js', 'storage.js', 'runtime.js'].map((f) => fs.readFileSync(`provider-adapters/${f}`, 'utf8')).join('\n');
const VF = new Function(`${LIB}\nreturn { vfSelectRoute, vfEstimateCost, VF_FAL_MAPPERS, VF_KIE_MAPPERS };`)();

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) console.log(`  FAIL ${name} ${detail}`);
}

// ---------------------------------------------------------------------------
// Minimal n8n interpreter
// ---------------------------------------------------------------------------
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class Engine {
  constructor(workflow, { db, http }) {
    this.wf = workflow;
    this.db = db;
    this.http = http;
    this.byName = Object.fromEntries(workflow.nodes.map((n) => [n.name, n]));
    this.executionId = `dryrun-${Math.random().toString(36).slice(2, 10)}`;
  }

  ref(name) {
    const self = this;
    return {
      first() {
        if (!self.runData[name]) throw new Error(`Referenced node is unexecuted: ${name}`);
        return (self.runData[name][0] || [])[0];
      },
      all() {
        if (!self.runData[name]) throw new Error(`Referenced node is unexecuted: ${name}`);
        return self.runData[name][0] || [];
      },
    };
  }

  evalExpr(value, item) {
    if (typeof value !== 'string' || !value.startsWith('=')) return value;
    const text = value.slice(1);
    const $ = (n) => this.ref(n);
    const run = (code) => new Function('$json', '$', '$execution', `return (${code});`)(item ? item.json : {}, $, { id: this.executionId });
    const whole = /^\{\{([\s\S]*)\}\}$/.exec(text.trim());
    if (whole && !whole[1].includes('}}')) return run(whole[1]);
    return text.replace(/\{\{([\s\S]*?)\}\}/g, (_, code) => {
      const v = run(code);
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  }

  async run(startName) {
    this.runData = {};
    this.path = [];
    const queue = [{ name: startName, items: [{ json: {} }] }];
    while (queue.length) {
      const { name, items } = queue.shift();
      const node = this.byName[name];
      if (!node) throw new Error(`Unknown node ${name}`);
      this.path.push(name);
      const outputs = await this.execNode(node, items);
      this.runData[name] = outputs;
      const conns = (this.wf.connections[name] || {}).main || [];
      outputs.forEach((outItems, idx) => {
        if (!outItems || !outItems.length) return;
        for (const target of conns[idx] || []) queue.push({ name: target.node, items: outItems });
      });
    }
    return this;
  }

  async execNode(node, items) {
    const p = node.parameters;
    switch (node.type) {
      case 'n8n-nodes-base.manualTrigger':
        return [[{ json: {} }]];
      case 'n8n-nodes-base.noOp':
        return [items];
      case 'n8n-nodes-base.stopAndError':
        throw new StopError(this.evalExpr(p.errorMessage, items[0]));
      case 'n8n-nodes-base.code': {
        const $input = { first: () => items[0], all: () => items, item: items[0] };
        const fn = new AsyncFunction('$input', '$', '$execution', '$workflow', 'items', p.jsCode);
        const out = await fn($input, (n) => this.ref(n), { id: this.executionId }, { id: 'dryrun', name: this.wf.name }, items);
        return [JSON.parse(JSON.stringify(out))];
      }
      case 'n8n-nodes-base.if': {
        const ok = this.evalConditions(p.conditions, items[0]);
        return ok ? [items, []] : [[], items];
      }
      case 'n8n-nodes-base.switch': {
        const rules = p.rules.values;
        const outs = Array.from({ length: rules.length + 1 }, () => []);
        const idx = rules.findIndex((r) => this.evalConditions(r.conditions, items[0]));
        outs[idx === -1 ? rules.length : idx] = items;
        return outs;
      }
      case 'n8n-nodes-base.postgres': {
        const raw = this.evalExpr(p.options.queryReplacement, items[0]);
        const values = (Array.isArray(raw) ? raw : [raw]).filter((v) => v !== undefined).map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
        try {
          await this.db.query('savepoint vf_node');
          if (RUNTIME_DB_ROLE) await this.db.query(`set local role "${RUNTIME_DB_ROLE}"`);
          const r = await this.db.query(p.query, values);
          if (RUNTIME_DB_ROLE) await this.db.query('reset role');
          await this.db.query('release savepoint vf_node');
          const rows = JSON.parse(JSON.stringify(r.rows)).map((json) => ({ json }));
          if (!rows.length) return [node.alwaysOutputData ? [{ json: {} }] : [], []];
          return [rows, []];
        } catch (e) {
          await this.db.query('rollback to savepoint vf_node');
          if (node.onError === 'continueErrorOutput') return [[], [{ json: { message: e.message, error: { message: e.message } } }]];
          throw e;
        }
      }
      case 'n8n-nodes-base.httpRequest': {
        const url = this.evalExpr(p.url, items[0]);
        const body = p.sendBody && p.specifyBody === 'json' ? JSON.parse(this.evalExpr(p.jsonBody, items[0])) : undefined;
        const headers = p.sendHeaders ? JSON.parse(this.evalExpr(p.jsonHeaders, items[0])) : undefined;
        const binaryField = p.contentType === 'binaryData' ? p.inputDataFieldName : null;
        const binaryIn = binaryField ? ((items[0] || {}).binary || {})[binaryField] : undefined;
        const call = { node: node.name, method: p.method, url, body, headers, auth: p.genericAuthType, binaryIn };
        try {
          const res = await this.http(call);
          const respCfg = (p.options && p.options.response && p.options.response.response) || {};
          const json = { headers: res.headers || {}, statusCode: res.statusCode, statusMessage: '' };
          if (respCfg.responseFormat !== 'file') json.body = res.body;
          const item = { json };
          if (respCfg.responseFormat === 'file') {
            item.binary = { [respCfg.outputPropertyName || 'data']: res.binary || { mimeType: (res.headers || {})['content-type'], fileSize: (res.headers || {})['content-length'] } };
          }
          return [[item], []];
        } catch (e) {
          if (node.onError === 'continueErrorOutput') return [[], [{ json: { error: { message: e.message } } }]];
          throw e;
        }
      }
      default:
        throw new Error(`Interpreter does not support ${node.type}`);
    }
  }

  evalConditions(block, item) {
    const results = block.conditions.map((c) => {
      const left = this.evalExpr(c.leftValue, item);
      const op = c.operator;
      if (op.type === 'boolean' && op.operation === 'true') return left === true;
      if (op.type === 'string' && op.operation === 'equals') return String(left) === String(c.rightValue);
      throw new Error(`Unsupported operator ${JSON.stringify(op)}`);
    });
    return block.combinator === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
}

class StopError extends Error {}

// ---------------------------------------------------------------------------
// Mock providers
// ---------------------------------------------------------------------------
const ALLOWED_HOSTS = new Set(['queue.fal.run', 'api.kie.ai', 'v3b.fal.media', 'storage.invalid']);
function mockHttp(routes, calls) {
  return async (call) => {
    const host = new URL(call.url).host;
    if (!ALLOWED_HOSTS.has(host)) throw new Error(`Unexpected provider host ${host}`);
    calls.push(call);
    for (const [match, respond] of routes) {
      if (match(call)) return respond(call);
    }
    throw new Error(`No mock for ${call.method} ${call.url}`);
  };
}

// ---------------------------------------------------------------------------
async function main() {
  const db = new pg.Client({ connectionString: process.env.VIDEO_FACTORY_DB_URL });
  await db.connect();
  const q = async (text, values) => (await db.query(text, values)).rows;
  const secretValues = [process.env.FAL_KEY, process.env.KIE_API_KEY, process.env.N8N_API_KEY].filter((v) => v && v.length > 8);

  const snapshot = async () => (await q(`
    select (select count(*) from video_factory.generation_jobs)::int jobs,
           (select count(*) from video_factory.generation_attempts)::int attempts,
           (select count(*) from video_factory.assets)::int assets,
           (select count(*) from video_factory.asset_lineage)::int lineage,
           (select count(*) from video_factory.cost_ledger)::int cost,
           (select count(*) from video_factory.production_events)::int events,
           (select count(*) from video_factory.episodes)::int episodes,
           (select string_agg(p.slug || ':' || pa.is_active, ',' order by p.slug) from video_factory.provider_adapters pa join video_factory.providers p on p.id = pa.provider_id) adapters,
           (select string_agg(id::text || ':' || status || ':' || updated_at::text, ',') from video_factory.production_runs) runs,
           (select md5(coalesce(string_agg(to_jsonb(o)::text, ',' order by o.id), '')) from video_factory.provider_model_offers o) offers_md5,
           (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')::int public_tables`))[0];

  const kieCredits = async () => {
    const r = await realFetch('https://api.kie.ai/api/v1/chat/credit', { headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}` } });
    const j = await r.json();
    return j && j.data;
  };

  const before = await snapshot();
  const creditsBefore = await kieCredits();

  const live = (await q(`select count(*)::int n from video_factory.generation_jobs where status in ('PENDING','PROCESSING','WAITING_PROVIDER')`))[0].n;
  if (live > 0) {
    console.error(`ABORT: ${live} live generation job(s) exist; dry-run tests would contend with real work.`);
    process.exit(2);
  }

  await q('begin');
  try {
    await q(`set local statement_timeout = '30s'`);

    // Apply repo migrations production has not applied yet, inside this rolled-back
    // transaction, so pending DDL is exercised before the control plane applies it.
    const appliedVersions = new Set((await q('select version from supabase_migrations.schema_migrations')).map((r) => r.version));
    const pendingMigrations = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
      .filter((f) => !appliedVersions.has(f.split('_')[0]));
    for (const f of pendingMigrations) await q(fs.readFileSync(`supabase/migrations/${f}`, 'utf8'));
    check('pending migrations apply cleanly (rolled back)', true, pendingMigrations.length ? pendingMigrations.join(', ') : 'none pending');

    if (RUNTIME_DB_ROLE) {
      await q('savepoint vf_role_probe');
      await q(`set local role "${RUNTIME_DB_ROLE}"`);
      const roleProbe = (await q('select current_user as current_user'))[0];
      check('runtime-role harness executes workflow SQL as requested role', roleProbe.current_user === RUNTIME_DB_ROLE, roleProbe.current_user);
      await q('rollback to savepoint vf_role_probe');
    }

    // ---------------- Fixtures (rolled back) ----------------
    const brand = (await q(`select id from video_factory.brands where slug = 'synthetic-frontier'`))[0];
    const profile = (await q(`select id from video_factory.routing_profiles where slug = 'synthetic-frontier-v1'`))[0];
    const tag = `vf-dryrun-${Date.now()}`;
    const episode = (await q(`insert into video_factory.episodes (brand_id, slug, title, status) values ($1, $2, 'DRY RUN - rolled back', 'PLANNED') returning id`, [brand.id, tag]))[0];
    const scene = (await q(`insert into video_factory.scenes (episode_id, scene_number, title) values ($1, 1, 'dry run') returning id`, [episode.id]))[0];
    const shot = (await q(`insert into video_factory.shots (scene_id, shot_number, description, target_duration_seconds, routing_profile_id, routing_class, routing_requirements)
                           values ($1, 1, 'dry run shot', 5, $2, 'STANDARD_CINEMATIC_MOTION', '{"resolution":"1080p"}') returning id`, [scene.id, profile.id]))[0];
    const startAsset = (await q(`insert into video_factory.assets (brand_id, episode_id, shot_id, asset_type, uri, storage_provider, mime_type)
                                 values ($1, $2, $3, 'IMAGE', 'https://example.invalid/vf-dryrun/start.png', 'dryrun', 'image/png') returning id`, [brand.id, episode.id, shot.id]))[0];

    const newJob = async (over = {}) => (await q(`
      insert into video_factory.generation_jobs (episode_id, scene_id, shot_id, job_kind, prompt, parameters, input_manifest, max_attempts, status, attempts, worker_id, external_job_id, provider_model_offer_id, canonical_model_id, routing_decision)
      values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 'PENDING'), coalesce($10, 0), $11, $12, $13, $14, coalesce($15, '{}'::jsonb)) returning *`,
      [episode.id, scene.id, shot.id, over.job_kind || 'VIDEO', over.prompt || 'Slow dolly across a server hall at dawn',
        JSON.stringify(over.parameters || { duration_seconds: 5 }),
        JSON.stringify(over.input_manifest || [{ role: 'start_frame', asset_id: startAsset.id }]),
        over.max_attempts || 3, over.status || null, over.attempts ?? null, over.worker_id || null, over.external_job_id || null,
        over.offer_id || null, over.model_id || null, over.routing_decision ? JSON.stringify(over.routing_decision) : null]))[0];

    const setAdapters = (active) => q(`update video_factory.provider_adapters pa set is_active = $1 from video_factory.providers p where p.id = pa.provider_id and p.slug in ('fal','kie')`, [active]);
    const offerId = async (provider, key, resolution, audio) => (await q(`
      select o.id, o.canonical_model_id from video_factory.provider_model_offers o join video_factory.providers p on p.id = o.provider_id
      where p.slug = $1 and o.provider_model_key = $2 and o.resolution is not distinct from $3 and o.audio_included is not distinct from $4 and o.is_active`, [provider, key, resolution, audio]))[0];
    const jobRow = async (id) => (await q(`select * from video_factory.generation_jobs where id = $1`, [id]))[0];
    const attemptsOf = async (id) => q(`select * from video_factory.generation_attempts where generation_job_id = $1 order by attempt_number`, [id]);
    const eventsOf = async (id) => q(`select event_type, severity, message, data from video_factory.production_events where entity_id = $1 order by id`, [id]);
    const leakCheck = async (label, jobId) => {
      const blob = JSON.stringify(await q(`
        select (select jsonb_agg(to_jsonb(j)) from video_factory.generation_jobs j where j.id = $1) jobs,
               (select jsonb_agg(to_jsonb(a)) from video_factory.generation_attempts a where a.generation_job_id = $1) attempts,
               (select jsonb_agg(to_jsonb(e)) from video_factory.production_events e where e.entity_id = $1) events,
               (select jsonb_agg(to_jsonb(c)) from video_factory.cost_ledger c where c.generation_job_id = $1) cost,
               (select jsonb_agg(to_jsonb(s)) from video_factory.assets s where s.generation_job_id = $1) assets,
               (select jsonb_agg(p.config) from video_factory.providers p) providers,
               (select jsonb_agg(pa.config) from video_factory.provider_adapters pa) adapters`, [jobId]));
      check(`${label}: no credential material persisted`, !secretValues.some((s) => blob.includes(s)));
    };
    const scenario = async (name, fn) => {
      console.log(`- ${name}`);
      await q('savepoint scenario');
      try { await fn(); } catch (e) { check(`${name}: completed without exception`, false, e.stack); }
      await q('rollback to savepoint scenario');
    };

    // ---------------- 1. Resolver ordering (read-only) ----------------
    await scenario('resolver returns quality-first ordering', async () => {
      const rows = await q(`select rule_priority, canonical_model_slug, provider_slug, unit_price from video_factory.get_route_candidates('synthetic-frontier-v1','STANDARD_CINEMATIC_MOTION','1080p',false,false)`);
      const models = [...new Set(rows.map((r) => r.canonical_model_slug))];
      check('resolver model order H3 Max Turbo > H3 Max > Kling 3', JSON.stringify(models) === JSON.stringify(['minimax_h3_max_turbo', 'minimax_h3_max', 'kling_3']), JSON.stringify(models));
      const priorities = rows.map((r) => r.rule_priority);
      check('resolver priorities non-decreasing', priorities.every((v, i) => i === 0 || v >= priorities[i - 1]));

      // Price must never promote a lower-priority model.
      const cheapFallback = [
        { routing_rule_id: 'r1', rule_priority: 1, rule_role: 'PRIMARY', canonical_model_id: 'm1', canonical_model_slug: 'minimax_h3_max_turbo', quality_tier: 4, provider_offer_id: 'o1', provider_id: 'p', provider_slug: 'fal', provider_model_key: 'minimax/h3-max-turbo/image-to-video', pricing_basis: 'PER_SECOND', unit_price: '9.99', currency: 'USD', resolution: '1080p', audio_included: false, offer_capabilities: { mode: 'image_to_video' } },
        { routing_rule_id: 'r2', rule_priority: 2, rule_role: 'FALLBACK', canonical_model_id: 'm2', canonical_model_slug: 'minimax_h3_max', quality_tier: 4, provider_offer_id: 'o2', provider_id: 'p', provider_slug: 'fal', provider_model_key: 'minimax/h3-max/image-to-video', pricing_basis: 'PER_SECOND', unit_price: '0.01', currency: 'USD', resolution: '1080p', audio_included: false, offer_capabilities: { mode: 'image_to_video' } },
        { routing_rule_id: 'r1', rule_priority: 1, rule_role: 'PRIMARY', canonical_model_id: 'm1', canonical_model_slug: 'minimax_h3_max_turbo', quality_tier: 4, provider_offer_id: 'o3', provider_id: 'k', provider_slug: 'kie', provider_model_key: 'kling-3.0/video', pricing_basis: 'PER_SECOND', unit_price: '0.02', currency: 'USD', resolution: null, audio_included: false, offer_capabilities: { mode: 'video' } },
      ];
      const ctx = {
        worker_id: 't', job: { id: 'j', job_kind: 'VIDEO', prompt: 'x', parameters: { duration_seconds: 5 }, input_manifest: [{ role: 'start_frame', uri: 'https://example.invalid/a.png' }] },
        profile: { slug: 'synthetic-frontier-v1', minimum_quality_tier: 4, allow_model_fallback: true },
        requirements: { routing_class: 'STANDARD_CINEMATIC_MOTION', resolution: '1080p', audio_included: false },
        candidates: cheapFallback,
        adapters: { fal: { provider_active: true, adapter_active: true }, kie: { provider_active: true, adapter_active: true } },
      };
      const sel = VF.vfSelectRoute(ctx);
      check('cheaper lower-priority model is never selected over priority 1', sel.selected && sel.selected.canonical_model_slug === 'minimax_h3_max_turbo');
      check('within a model the cheaper capable offer wins (provider second)', sel.selected && sel.selected.provider_offer_id === 'o3', sel.selected && sel.selected.provider_offer_id);
      const ctx2 = JSON.parse(JSON.stringify(ctx));
      ctx2.candidates = ctx2.candidates.filter((c) => c.provider_offer_id !== 'o3');
      ctx2.failed_offer_ids = ['o1'];
      const sel2 = VF.vfSelectRoute(ctx2);
      check('model fallback only after the higher model has no capable offer', sel2.selected && sel2.selected.canonical_model_slug === 'minimax_h3_max' && sel2.decision.model_evaluation[0].reason === 'NO_CAPABLE_PROVIDER_OFFER');
    });

    // ---------------- 2. Claim no-op ----------------
    await scenario('Generation Worker: no job -> exits successfully', async () => {
      const calls = [];
      const e = await new Engine(GEN, { db, http: mockHttp([], calls) }).run('Manual Trigger');
      const s = await snapshot();
      check('no-op path ends at "No Job - Exit"', e.path.at(-1) === 'No Job - Exit', e.path.join(' > '));
      check('no-op makes no provider calls', calls.length === 0);
      check('no-op writes nothing', s.jobs === before.jobs + 0 && s.attempts === before.attempts && s.events === before.events && s.cost === before.cost);
    });

    // ---------------- 3. Global kill switch: adapters inactive ----------------
    await scenario('Generation Worker: all production adapters inactive -> job never claimed (kill switch)', async () => {
      const job = await newJob();
      const calls = [];
      const e = await new Engine(GEN, { db, http: mockHttp([], calls) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      check('kill switch: no provider call', calls.length === 0);
      check('kill switch: worker exits cleanly without claiming', e.path.at(-1) === 'No Job - Exit', e.path.join(' > '));
      check('kill switch: job untouched and still PENDING', j.status === 'PENDING' && j.attempts === 0 && j.worker_id === null && j.last_error === null, `${j.status} attempts=${j.attempts}`);
      check('kill switch: no attempt row, no cost, no events', (await attemptsOf(job.id)).length === 0 && (await eventsOf(job.id)).length === 0);
    });

    await scenario('Generation Worker: adapter active but no capable offer -> NO_ELIGIBLE_ROUTE, no provider call', async () => {
      // fal on, Kie off: a 1080p text-to-video shot has no capable fal offer.
      await q(`update video_factory.provider_adapters pa set is_active = true from video_factory.providers p where p.id = pa.provider_id and p.slug = 'fal'`);
      const job = await newJob({ input_manifest: [], parameters: { duration_seconds: 6 } });
      const calls = [];
      const e = await new Engine(GEN, { db, http: mockHttp([], calls) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const ev = await eventsOf(job.id);
      check('no capable offer: no provider call', calls.length === 0);
      check('no capable offer: job failed back to PENDING for retry', j.status === 'PENDING' && j.attempts === 1 && /NO_ELIGIBLE_ROUTE/.test(j.last_error || ''), `${j.status} ${j.last_error}`);
      check('no capable offer: ADAPTER_INACTIVE recorded for the Kie offer', JSON.stringify(ev).includes('ADAPTER_INACTIVE'));
      check('no capable offer: reached Fail Generation Job', e.path.includes('Fail Generation Job'));
    });

    await setAdapters(true);

    // ---------------- 4. fal async submit ----------------
    await scenario('Generation Worker: fal route -> submit accepted -> WAITING_PROVIDER', async () => {
      const job = await newJob();
      const calls = [];
      const http = mockHttp([[(c) => c.method === 'POST', () => ({ statusCode: 200, body: { status: 'IN_QUEUE', request_id: 'fal-req-123', status_url: 'https://queue.fal.run/fal-ai/minimax-h3-turbo/requests/fal-req-123/status', response_url: 'https://queue.fal.run/fal-ai/minimax-h3-turbo/requests/fal-req-123', cancel_url: 'https://queue.fal.run/fal-ai/minimax-h3-turbo/requests/fal-req-123/cancel' } })]], calls);
      const e = await new Engine(GEN, { db, http }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const [att] = await attemptsOf(job.id);
      const expectOffer = await offerId('fal', 'minimax/h3-max-turbo/image-to-video', '1080p', false);
      check('fal: exactly one (mocked) submit', calls.length === 1 && calls[0].auth === 'httpHeaderAuth');
      check('fal: queue path resolved from alias', calls[0] && calls[0].url === 'https://queue.fal.run/fal-ai/minimax-h3-turbo/max-turbo/image-to-video', calls[0] && calls[0].url);
      check('fal: request body normalized', calls[0] && calls[0].body.resolution === '1080P' && calls[0].body.image_url === 'https://example.invalid/vf-dryrun/start.png' && calls[0].body.duration === 5);
      check('fal: job WAITING_PROVIDER with provider job id', j.status === 'WAITING_PROVIDER' && j.external_job_id === 'fal-req-123' && j.worker_id === null, `${j.status}`);
      check('fal: canonical model persisted (H3 Max Turbo)', j.canonical_model_id === expectOffer.canonical_model_id);
      check('fal: provider offer persisted (1080p i2v, no audio)', j.provider_model_offer_id === expectOffer.id);
      check('fal: routing_decision persisted with rejected alternatives', j.routing_decision.outcome === 'ROUTED' && j.routing_decision.model_evaluation.length === 3 && j.routing_decision.model_evaluation[1].outcome === 'NOT_EVALUATED');
      check('fal: estimated cost 5s x $0.08', Number(j.estimated_cost) === 0.4, j.estimated_cost);
      check('fal: attempt WAITING_PROVIDER stores status/response urls', att && att.status === 'WAITING_PROVIDER' && att.external_job_id === 'fal-req-123' && att.response_payload.submit.poll.status_url.includes('/status'));
      const ev = (await eventsOf(job.id)).map((x) => x.event_type);
      check('fal: events routed + waiting', ev.join(',') === 'GENERATION_ROUTED,GENERATION_WAITING_PROVIDER', ev.join(','));
      check('fal: ESTIMATE cost row', (await q(`select count(*)::int n from video_factory.cost_ledger where generation_job_id = $1 and event_type = 'ESTIMATE' and amount = 0.4`, [job.id]))[0].n === 1);
      check('fal: workflow path ends at Mark Waiting Provider', e.path.at(-1) === 'Mark Waiting Provider', e.path.join(' > '));
      await leakCheck('fal submit', job.id);
    });

    // ---------------- 5. Kie route (capability-driven) ----------------
    await scenario('Generation Worker: text-to-video 1080p -> Kie Kling 3 -> WAITING_PROVIDER', async () => {
      const job = await newJob({ input_manifest: [], parameters: { duration_seconds: 6, aspect_ratio: '16:9' } });
      const calls = [];
      const http = mockHttp([[(c) => c.method === 'POST', () => ({ statusCode: 200, body: { code: 200, msg: 'success', data: { taskId: 'kie-task-777' } } })]], calls);
      await new Engine(GEN, { db, http }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const kieOffer = await offerId('kie', 'kling-3.0/video', null, false);
      const evals = j.routing_decision.model_evaluation || [];
      check('Kie: selected after higher models rejected for capability (no 1080p text-to-video)', evals[0] && evals[0].outcome === 'REJECTED' && evals[1] && evals[1].outcome === 'REJECTED' && evals[2] && evals[2].outcome === 'SELECTED', JSON.stringify(evals.map((x) => [x.canonical_model_slug, x.outcome, x.reason])));
      check('Kie: offer persisted', j.provider_model_offer_id === kieOffer.id);
      check('Kie: submit to createTask with model + sound=false', calls[0] && calls[0].url === 'https://api.kie.ai/api/v1/jobs/createTask' && calls[0].body.model === 'kling-3.0/video' && calls[0].body.input.sound === false && calls[0].body.input.duration === '6' && !calls[0].body.input.image_urls);
      check('Kie: job WAITING_PROVIDER with task id', j.status === 'WAITING_PROVIDER' && j.external_job_id === 'kie-task-777');
      check('Kie: unknown price stays null (no invented estimate)', j.estimated_cost === null);
      await leakCheck('Kie submit', job.id);
    });

    // ---------------- 6. Submit failure -> retry, and -> DEAD ----------------
    await scenario('Generation Worker: provider rejects submit -> fail_generation_job (retry)', async () => {
      const job = await newJob();
      const calls = [];
      const http = mockHttp([[(c) => c.method === 'POST', () => ({ statusCode: 422, body: { detail: [{ msg: 'image_url invalid' }] } })]], calls);
      await new Engine(GEN, { db, http }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const [att] = await attemptsOf(job.id);
      check('submit 422: job PENDING with backoff', j.status === 'PENDING' && j.attempts === 1 && new Date(j.run_after) > new Date(j.updated_at));
      check('submit 422: attempt FAILED with provider detail', att && att.status === 'FAILED' && /fal submit HTTP 422/.test(att.error_message), att && att.error_message);
      const ev = await eventsOf(job.id);
      check('submit 422: GENERATION_FAILED will_retry', ev.some((x) => x.event_type === 'GENERATION_FAILED' && x.data.will_retry === true));
      await leakCheck('submit failure', job.id);
    });

    await scenario('Generation Worker: transport error on final attempt -> DEAD', async () => {
      const job = await newJob({ max_attempts: 1 });
      const calls = [];
      const http = mockHttp([[() => true, () => { throw new Error('ECONNRESET'); }]], calls);
      await new Engine(GEN, { db, http }).run('Manual Trigger');
      const j = await jobRow(job.id);
      check('transport error at max_attempts: job DEAD', j.status === 'DEAD' && j.finished_at !== null, j.status);
      check('transport error: message recorded', /transport error: ECONNRESET/.test(j.last_error || ''), j.last_error);
    });

    await scenario('Generation Worker: retry excludes the failed offer (provider fallback, same model first)', async () => {
      const job = await newJob({ input_manifest: [], parameters: { duration_seconds: 6 } });
      const calls = [];
      const http = mockHttp([[(c) => c.method === 'POST', () => ({ statusCode: 200, body: { code: 402, msg: 'insufficient credits' } })]], calls);
      await new Engine(GEN, { db, http }).run('Manual Trigger');
      await q(`update video_factory.generation_jobs set run_after = now() - interval '1 second' where id = $1`, [job.id]);
      const calls2 = [];
      await new Engine(GEN, { db, http: mockHttp([], calls2) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      check('Kie 402 then retry: failed offer excluded, no other capable offer -> no second submit', calls.length === 1 && calls2.length === 0 && /NO_ELIGIBLE_ROUTE/.test(j.last_error || ''), j.last_error);
      const ev = await eventsOf(job.id);
      check('retry decision records PREVIOUS_ATTEMPT_FAILED', JSON.stringify(ev).includes('PREVIOUS_ATTEMPT_FAILED'));
    });

    // ---------------- Poll fixtures ----------------
    const falOffer = await offerId('fal', 'minimax/h3-max-turbo/image-to-video', '1080p', false);
    const kieOffer = await offerId('kie', 'kling-3.0/video', null, false);
    const waitingJob = async (provider, attemptStartedAgo = '2 minutes') => {
      const offer = provider === 'fal' ? falOffer : kieOffer;
      const externalId = provider === 'fal' ? 'fal-req-poll' : 'kie-task-poll';
      const decision = { outcome: 'ROUTED', cost_estimate: provider === 'fal' ? { amount: 0.4, units: 5, unit: 'second', currency: 'USD', status: 'ESTIMATED_FROM_OFFER' } : { amount: null, currency: 'USD', status: 'UNKNOWN_PRICE' } };
      const job = await newJob({ status: 'WAITING_PROVIDER', attempts: 1, external_job_id: externalId, offer_id: offer.id, model_id: offer.canonical_model_id, routing_decision: decision });
      // Inserted (not updated) so updated_at can sit in the past without disabling triggers.
      await q(`delete from video_factory.generation_jobs where id = $1`, [job.id]);
      await q(`insert into video_factory.generation_jobs select (jsonb_populate_record(null::video_factory.generation_jobs, to_jsonb($1::jsonb) || jsonb_build_object('updated_at', now() - interval '5 minutes'))).*`, [JSON.stringify(job)]);
      const submit = provider === 'fal'
        ? { poll: { status_url: 'https://queue.fal.run/fal-ai/minimax-h3-turbo/requests/fal-req-poll/status', response_url: 'https://queue.fal.run/fal-ai/minimax-h3-turbo/requests/fal-req-poll' } }
        : { poll: {} };
      await q(`insert into video_factory.generation_attempts (generation_job_id, attempt_number, status, external_job_id, request_payload, response_payload, started_at)
               values ($1, 1, 'WAITING_PROVIDER', $2, $3, $4, now() - $5::interval)`,
        [job.id, externalId, JSON.stringify({ provider_model_offer_id: offer.id }), JSON.stringify({ submit }), attemptStartedAgo]);
      return job;
    };

    await scenario('Provider Poll: nothing due -> exits successfully', async () => {
      const calls = [];
      const e = await new Engine(POLL, { db, http: mockHttp([], calls) }).run('Manual Trigger');
      check('poll no-op ends at "Nothing Due - Exit"', e.path.at(-1) === 'Nothing Due - Exit' && calls.length === 0, e.path.join(' > '));
    });

    await scenario('Provider Poll: fal IN_PROGRESS -> release lease, stay WAITING_PROVIDER', async () => {
      const job = await waitingJob('fal');
      const calls = [];
      const e = await new Engine(POLL, { db, http: mockHttp([[(c) => c.url.endsWith('/status'), () => ({ statusCode: 200, body: { status: 'IN_PROGRESS', request_id: 'fal-req-poll' } })]], calls) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const [att] = await attemptsOf(job.id);
      check('pending: one GET to status_url', calls.length === 1 && calls[0].method === 'GET' && calls[0].url.endsWith('/fal-req-poll/status'));
      check('pending: job still WAITING_PROVIDER, lease released', j.status === 'WAITING_PROVIDER' && j.worker_id === null);
      check('pending: attempt last_poll RUNNING recorded', att.response_payload.last_poll && att.response_payload.last_poll.status === 'RUNNING');
      check('pending: path ends at Release Poll Lease', e.path.at(-1) === 'Release Poll Lease', e.path.join(' > '));
    });

    await scenario('Provider Poll: fal 503 -> transient, warning event, stays WAITING_PROVIDER', async () => {
      const job = await waitingJob('fal');
      const calls = [];
      await new Engine(POLL, { db, http: mockHttp([[() => true, () => ({ statusCode: 503, body: 'upstream unavailable' })]], calls) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const ev = await eventsOf(job.id);
      check('transient: job not failed', j.status === 'WAITING_PROVIDER' && j.attempts === 1);
      check('transient: PROVIDER_POLL_WARNING event', ev.some((x) => x.event_type === 'PROVIDER_POLL_WARNING'));
    });

    await scenario('Provider Poll: fal COMPLETED -> result -> asset, lineage, cost, DONE', async () => {
      const job = await waitingJob('fal');
      const calls = [];
      const http = mockHttp([
        [(c) => c.url.endsWith('/status'), () => ({ statusCode: 200, body: { status: 'COMPLETED', request_id: 'fal-req-poll' } })],
        [(c) => c.url.endsWith('/fal-req-poll'), () => ({ statusCode: 200, body: { video: { url: 'https://v3.fal.media/files/dryrun/out.mp4', content_type: 'video/mp4', file_size: 1234567 }, expanded_prompt: 'x' } })],
      ], calls);
      const e = await new Engine(POLL, { db, http }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const [att] = await attemptsOf(job.id);
      const assets = await q(`select * from video_factory.assets where generation_job_id = $1`, [job.id]);
      const lineage = assets.length ? await q(`select * from video_factory.asset_lineage where child_asset_id = $1`, [assets[0].id]) : [];
      const cost = await q(`select * from video_factory.cost_ledger where generation_job_id = $1`, [job.id]);
      const ev = await eventsOf(job.id);
      check('success: status then result fetched', calls.length === 2);
      check('success: job DONE with actual_cost 0.40', j.status === 'DONE' && Number(j.actual_cost) === 0.4 && j.worker_id === null, `${j.status} ${j.actual_cost}`);
      check('success: attempt SUCCEEDED with raw result', att.status === 'SUCCEEDED' && att.response_payload.result.video.url.endsWith('out.mp4') && att.finished_at);
      check('success: VIDEO asset created (primary, provider-hosted)', assets.length === 1 && assets[0].asset_type === 'VIDEO' && assets[0].is_primary && assets[0].mime_type === 'video/mp4' && Number(assets[0].size_bytes) === 1234567 && assets[0].metadata.storage_state === 'PROVIDER_HOSTED_NOT_YET_ARCHIVED');
      check('success: START_FRAME lineage to input asset', lineage.length === 1 && lineage[0].parent_asset_id === startAsset.id && lineage[0].relationship_type === 'START_FRAME');
      check('success: CHARGE cost row labelled offer-rate', cost.length === 1 && cost[0].event_type === 'CHARGE' && Number(cost[0].amount) === 0.4 && cost[0].metadata.cost_status === 'OFFER_RATE_X_REQUESTED_UNITS');
      check('success: GENERATION_COMPLETED event', ev.some((x) => x.event_type === 'GENERATION_COMPLETED'));
      check('success: path ends at Persist Completion', e.path.at(-1) === 'Persist Completion', e.path.join(' > '));
      await leakCheck('fal completion', job.id);
    });

    await scenario('Provider Poll: Kie success -> asset + credits-only cost, DONE', async () => {
      const job = await waitingJob('kie');
      const calls = [];
      const http = mockHttp([[(c) => c.url.includes('/jobs/recordInfo?taskId=kie-task-poll'), () => ({ statusCode: 200, body: { code: 200, msg: 'success', data: { taskId: 'kie-task-poll', state: 'success', resultJson: '{"resultUrls":["https://tempfile.aiquickdraw.com/dryrun/out.mp4"]}', failCode: '', failMsg: '', creditsConsumed: 42 } } })]], calls);
      await new Engine(POLL, { db, http }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const cost = await q(`select * from video_factory.cost_ledger where generation_job_id = $1`, [job.id]);
      const assets = await q(`select * from video_factory.assets where generation_job_id = $1`, [job.id]);
      check('Kie success: job DONE, actual_cost unknown (null)', j.status === 'DONE' && j.actual_cost === null);
      check('Kie success: asset with guessed mime', assets.length === 1 && assets[0].mime_type === 'video/mp4' && assets[0].storage_provider === 'kie');
      check('Kie success: OTHER cost row amount 0 with credits', cost.length === 1 && cost[0].event_type === 'OTHER' && Number(cost[0].amount) === 0 && Number(cost[0].metadata.credits_consumed) === 42 && cost[0].metadata.cost_status === 'KIE_CREDITS_ONLY');
    });

    await scenario('Provider Poll: Kie fail -> fail_generation_job (retry)', async () => {
      const job = await waitingJob('kie');
      const calls = [];
      await new Engine(POLL, { db, http: mockHttp([[() => true, () => ({ statusCode: 200, body: { code: 200, data: { taskId: 'kie-task-poll', state: 'fail', failCode: 'GENERATION_FAILED', failMsg: 'The generation task failed.' } } })]], calls) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const [att] = await attemptsOf(job.id);
      check('Kie fail: job PENDING for retry', j.status === 'PENDING' && j.worker_id === null, j.status);
      check('Kie fail: attempt FAILED with raw response', att.status === 'FAILED' && /GENERATION_FAILED/.test(att.error_message) && att.response_payload.failure.raw_response.data.state === 'fail');
    });

    // Kie envelope codes are not authoritative: its own get-task-detail docs show
    // code 505 next to a completed task, so data.state must decide on HTTP 2xx.
    await scenario('Provider Poll: Kie HTTP 200 + code 505 + state success -> SUCCEEDED', async () => {
      const job = await waitingJob('kie');
      const calls = [];
      await new Engine(POLL, { db, http: mockHttp([[() => true, () => ({ statusCode: 200, body: { code: 505, msg: 'success', data: { taskId: 'kie-task-poll', state: 'success', resultJson: '{"resultUrls":["https://tempfile.aiquickdraw.com/dryrun/out505.mp4"]}', failCode: '', failMsg: '', creditsConsumed: 7 } } })]], calls) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const assets = await q(`select * from video_factory.assets where generation_job_id = $1`, [job.id]);
      const [att] = await attemptsOf(job.id);
      check('code 505 + success: job DONE (state wins over envelope code)', j.status === 'DONE', j.status);
      check('code 505 + success: asset created from resultUrls', assets.length === 1 && assets[0].uri.endsWith('out505.mp4'));
      check('code 505 + success: attempt SUCCEEDED', att.status === 'SUCCEEDED');
    });

    await scenario('Provider Poll: Kie HTTP 200 + code 505 + state waiting -> PENDING', async () => {
      const job = await waitingJob('kie');
      const calls = [];
      const e = await new Engine(POLL, { db, http: mockHttp([[() => true, () => ({ statusCode: 200, body: { code: 505, msg: 'queued', data: { taskId: 'kie-task-poll', state: 'waiting', resultJson: '', failCode: '', failMsg: '' } } })]], calls) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const [att] = await attemptsOf(job.id);
      check('code 505 + waiting: job stays WAITING_PROVIDER, lease released', j.status === 'WAITING_PROVIDER' && j.worker_id === null, j.status);
      check('code 505 + waiting: not failed and not completed', j.attempts === 1 && j.actual_cost === null && att.status === 'WAITING_PROVIDER');
      check('code 505 + waiting: last_poll PENDING recorded', att.response_payload.last_poll && att.response_payload.last_poll.status === 'PENDING', JSON.stringify(att.response_payload.last_poll));
      check('code 505 + waiting: path ends at Release Poll Lease', e.path.at(-1) === 'Release Poll Lease', e.path.join(' > '));
    });

    await scenario('Provider Poll: Kie HTTP 200 with no data -> failure, never completion', async () => {
      const job = await waitingJob('kie');
      await new Engine(POLL, { db, http: mockHttp([[() => true, () => ({ statusCode: 200, body: { code: 200, msg: 'ok' } })]], []) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      check('no data: job failed for retry, nothing completed', j.status === 'PENDING' && /no task state/.test(j.last_error || ''), `${j.status} ${j.last_error}`);
      check('no data: no asset created', (await q(`select count(*)::int n from video_factory.assets where generation_job_id = $1`, [job.id]))[0].n === 0);
    });

    await scenario('Provider Poll: Kie HTTP 200 with unrecognized state -> transient, keeps waiting', async () => {
      const job = await waitingJob('kie');
      await new Engine(POLL, { db, http: mockHttp([[() => true, () => ({ statusCode: 200, body: { code: 200, data: { taskId: 'kie-task-poll', state: 'reticulating' } } })]], []) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      const ev = await eventsOf(job.id);
      check('unknown state: stays WAITING_PROVIDER with warning', j.status === 'WAITING_PROVIDER' && ev.some((x) => x.event_type === 'PROVIDER_POLL_WARNING' && /reticulating/.test(x.message)), j.status);
      check('unknown state: no asset created', (await q(`select count(*)::int n from video_factory.assets where generation_job_id = $1`, [job.id]))[0].n === 0);
    });

    await scenario('Provider Poll: Kie HTTP 401 -> transient, task state untouched', async () => {
      const job = await waitingJob('kie');
      await new Engine(POLL, { db, http: mockHttp([[() => true, () => ({ statusCode: 401, body: { code: 401, msg: 'unauthorized' } })]], []) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      check('HTTP 401: job not failed, stays WAITING_PROVIDER', j.status === 'WAITING_PROVIDER' && j.attempts === 1, j.status);
    });

    await scenario('Provider Poll: Kie HTTP 429 -> transient, task state untouched', async () => {
      const job = await waitingJob('kie');
      await new Engine(POLL, { db, http: mockHttp([[() => true, () => ({ statusCode: 429, body: 'rate limited' })]], []) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      check('HTTP 429: job not failed, stays WAITING_PROVIDER', j.status === 'WAITING_PROVIDER', j.status);
    });

    await scenario('Provider Poll: poll timeout -> FAILED without calling provider', async () => {
      const job = await waitingJob('fal', '2 hours');
      const calls = [];
      await new Engine(POLL, { db, http: mockHttp([], calls) }).run('Manual Trigger');
      const j = await jobRow(job.id);
      check('timeout: no provider call', calls.length === 0);
      check('timeout: job failed with PROVIDER_POLL_TIMEOUT', j.status === 'PENDING' && /PROVIDER_POLL_TIMEOUT/.test(j.last_error || ''), j.last_error);
    });

    // ---------------- PROCESSING crash recovery ----------------
    const recoverSql = fs.readFileSync('runtime/sql/recover_stale_jobs.sql', 'utf8');
    const recover = (worker = 'recovery-test') => q(recoverSql, [JSON.stringify({ worker_id: worker })]);
    const staleJob = async (over = {}) => {
      const job = await newJob({ status: 'PROCESSING', attempts: over.attempts ?? 1, worker_id: 'dead-worker', max_attempts: over.max_attempts,
        external_job_id: over.external_job_id || null, offer_id: falOffer.id, model_id: falOffer.canonical_model_id });
      await q(`update video_factory.generation_jobs set lease_expires_at = $2, submission_state = $3 where id = $1`,
        [job.id, over.lease_expires_at || new Date(Date.now() - 60000), over.submission_state || 'NONE']);
      if (over.attempt) {
        await q(`insert into video_factory.generation_attempts (generation_job_id, attempt_number, status, external_job_id, request_payload, started_at)
                 values ($1, $2, $3, $4, '{}'::jsonb, now() - interval '20 minutes')`,
          [job.id, over.attempts ?? 1, over.attempt.status || 'STARTED', over.attempt.external_job_id || null]);
      }
      return job;
    };

    await scenario('Recovery: stale claim never submitted -> back to PENDING', async () => {
      const job = await staleJob({ attempt: { status: 'STARTED' } });
      const res = await recover();
      const j = await jobRow(job.id);
      const [att] = await attemptsOf(job.id);
      const ev = await eventsOf(job.id);
      check('stale claim: action RETURNED_TO_PENDING', res.length === 1 && res[0].action === 'RETURNED_TO_PENDING', JSON.stringify(res));
      check('stale claim: job PENDING, lease cleared, attempts preserved', j.status === 'PENDING' && j.lease_expires_at === null && j.worker_id === null && j.attempts === 1 && j.recovery_count === 1, `${j.status} attempts=${j.attempts}`);
      check('stale claim: open attempt cancelled', att.status === 'CANCELLED');
      check('stale claim: GENERATION_RECOVERED warning event', ev.some((x) => x.event_type === 'GENERATION_RECOVERED' && x.severity === 'WARNING'));
    });

    await scenario('Recovery: submitted job is never resubmitted (job external id) -> polling', async () => {
      const job = await staleJob({ external_job_id: 'fal-req-crash', submission_state: 'SUBMITTED', attempt: { status: 'STARTED', external_job_id: 'fal-req-crash' } });
      const res = await recover();
      const j = await jobRow(job.id);
      const [att] = await attemptsOf(job.id);
      check('submitted: action RECOVERED_TO_POLLING', res.length === 1 && res[0].action === 'RECOVERED_TO_POLLING' && res[0].external_job_id === 'fal-req-crash');
      check('submitted: job WAITING_PROVIDER (not PENDING, so never reclaimed for submission)', j.status === 'WAITING_PROVIDER' && j.submission_state === 'SUBMITTED' && j.worker_id === null, j.status);
      check('submitted: attempt handed to polling', att.status === 'WAITING_PROVIDER' && att.external_job_id === 'fal-req-crash');
      check('submitted: attempt count unchanged (no second attempt)', (await attemptsOf(job.id)).length === 1);
    });

    await scenario('Recovery: external id only on the attempt row -> polling', async () => {
      const job = await staleJob({ submission_state: 'SUBMITTING', attempt: { status: 'STARTED', external_job_id: 'fal-req-attempt-only' } });
      const res = await recover();
      const j = await jobRow(job.id);
      check('attempt-only external id: recovered to polling', res[0] && res[0].action === 'RECOVERED_TO_POLLING' && j.status === 'WAITING_PROVIDER' && j.external_job_id === 'fal-req-attempt-only', `${res[0] && res[0].action} ${j.status}`);
    });

    await scenario('Recovery: uncertain submission is quarantined, never resubmitted', async () => {
      const job = await staleJob({ submission_state: 'SUBMITTING', attempt: { status: 'STARTED' } });
      const res = await recover();
      const j = await jobRow(job.id);
      const [att] = await attemptsOf(job.id);
      const ev = await eventsOf(job.id);
      check('uncertain: action QUARANTINED_UNCERTAIN', res[0] && res[0].action === 'QUARANTINED_UNCERTAIN');
      check('uncertain: job FAILED (terminal) and flagged UNCERTAIN, never re-queued', j.status === 'FAILED' && j.submission_state === 'UNCERTAIN' && /REQUIRES_RECONCILIATION/.test(j.last_error || ''), `${j.status}/${j.submission_state}`);
      check('uncertain: attempt FAILED with reconciliation note', att.status === 'FAILED' && /REQUIRES_RECONCILIATION/.test(att.error_message || ''));
      check('uncertain: ERROR event requires_reconciliation', ev.some((x) => x.event_type === 'GENERATION_RECOVERED' && x.severity === 'ERROR' && x.data.requires_reconciliation === true));
    });

    await scenario('Recovery: non-stale PROCESSING job is untouched', async () => {
      const job = await staleJob({ lease_expires_at: new Date(Date.now() + 600000) });
      const res = await recover();
      const j = await jobRow(job.id);
      check('non-stale: nothing recovered', res.length === 0);
      check('non-stale: still PROCESSING with its lease and worker', j.status === 'PROCESSING' && j.worker_id === 'dead-worker' && j.recovery_count === 0);
    });

    await scenario('Recovery: concurrent runs recover a job exactly once', async () => {
      const job = await staleJob({ attempt: { status: 'STARTED' } });
      const [a, b] = [await recover('worker-a'), await recover('worker-b')];
      const j = await jobRow(job.id);
      const ev = (await eventsOf(job.id)).filter((x) => x.event_type === 'GENERATION_RECOVERED');
      check('concurrent: exactly one recovery transition', a.length === 1 && b.length === 0 && j.recovery_count === 1 && ev.length === 1, `a=${a.length} b=${b.length} count=${j.recovery_count}`);
    });

    await scenario('Recovery: max_attempts behaviour preserved after recovery', async () => {
      const job = await staleJob({ attempts: 1, max_attempts: 1, attempt: { status: 'STARTED' } });
      await recover();
      const claimed = await q(fs.readFileSync('runtime/sql/claim_generation_job.sql', 'utf8'), [JSON.stringify({ worker_id: 'w' })]);
      const failed = await q(fs.readFileSync('runtime/sql/fail_generation.sql', 'utf8'),
        [JSON.stringify({ job_id: job.id, worker_id: 'w', attempt_id: null, error: 'post-recovery failure', stage: 'test', raw_response: null, routing_decision: null })]);
      const j = await jobRow(job.id);
      check('max_attempts: recovered job re-claimed once then DEAD (no retry loop)', claimed.length === 1 && j.status === 'DEAD' && j.attempts === 2 && failed[0].job_status === 'DEAD', `${j.status} attempts=${j.attempts}`);
    });

    await scenario('Recovery: Generation Worker workflow runs recovery before claiming', async () => {
      const stale = await staleJob({ external_job_id: 'fal-req-e2e', submission_state: 'SUBMITTED', attempt: { status: 'STARTED', external_job_id: 'fal-req-e2e' } });
      const calls = [];
      const e = await new Engine(GEN, { db, http: mockHttp([], calls) }).run('Manual Trigger');
      const j = await jobRow(stale.id);
      check('e2e recovery: workflow executed Recover Stale Jobs', e.path.includes('Recover Stale Jobs'), e.path.slice(0, 5).join(' > '));
      check('e2e recovery: stale job handed to polling, no provider call', j.status === 'WAITING_PROVIDER' && calls.length === 0);
      check('e2e recovery: worker then found nothing to claim', e.path.at(-1) === 'No Job - Exit', e.path.at(-1));
    });

    // ---------------- Durable asset archival ----------------
    const enableStorage = () => q(`update video_factory.providers set is_active = true, base_url = 'https://storage.invalid' where slug = 'supabase_storage'`);
    const archivableAsset = async (over = {}) => {
      const job = await newJob({ status: 'DONE', attempts: 1 });
      const a = (await q(`insert into video_factory.assets (brand_id, episode_id, scene_id, shot_id, generation_job_id, asset_type, uri, storage_provider, storage_state, mime_type, is_primary)
        values ($1,$2,$3,$4,$5,'VIDEO',$6,'fal',$7,'video/mp4',true) returning *`,
        [brand.id, episode.id, scene.id, shot.id, job.id, over.uri || 'https://v3b.fal.media/files/dryrun/out.mp4', over.storage_state || 'ARCHIVE_PENDING']))[0];
      // Real assets awaiting archival would otherwise be claimed ahead of this fixture
      // (they are older). Defer them inside this rolled-back transaction so the
      // archive scenarios are deterministic.
      await q(`update video_factory.assets set archive_run_after = now() + interval '1 day' where id <> $1 and archive_uri is null`, [a.id]);
      return { job, asset: a };
    };
    const assetRow = async (id) => (await q('select * from video_factory.assets where id = $1', [id]))[0];
    const DOWNLOAD_OK = [(c) => c.node === 'Download Provider Asset', () => ({ statusCode: 200, headers: { 'content-type': 'video/mp4', 'content-length': '5060895' }, binary: { mimeType: 'video/mp4', fileSize: '5060895' } })];
    const UPLOAD_OK = [(c) => c.node === 'Upload To Durable Storage', () => ({ statusCode: 200, headers: { etag: '"d41d8cd98f00b204e9800998ecf8427e"' }, body: { Key: 'video-factory-assets/x' } })];

    await scenario('Archive: storage backend disabled -> worker idles, claims nothing', async () => {
      await archivableAsset();
      const calls = [];
      const e = await new Engine(ARCHIVE, { db, http: mockHttp([], calls) }).run('Manual Trigger');
      check('archive disabled: nothing claimed, no HTTP', e.path.at(-1) === 'Nothing To Archive - Exit' && calls.length === 0, e.path.join(' > '));
    });

    await scenario('Archive: successful archival records durable URI and preserves provider URI', async () => {
      await enableStorage();
      const { asset } = await archivableAsset();
      const calls = [];
      const e = await new Engine(ARCHIVE, { db, http: mockHttp([DOWNLOAD_OK, UPLOAD_OK], calls) }).run('Manual Trigger');
      const a = await assetRow(asset.id);
      const ev = await q(`select event_type, severity, data from video_factory.production_events where entity_id = $1`, [asset.id]);
      check('archive: downloaded then uploaded exactly once each', calls.length === 2 && calls[0].method === 'GET' && calls[1].method === 'POST', calls.map((c) => c.method).join(','));
      check('archive: upload sent binary with upsert + content type', Boolean(calls[1].binaryIn) && calls[1].headers['x-upsert'] === 'true' && calls[1].headers['content-type'] === 'video/mp4');
      check('archive: deterministic object key', a.archive_object_key === `episodes/${episode.id}/assets/${asset.id}.mp4`, a.archive_object_key);
      check('archive: state ARCHIVED with durable URI', a.storage_state === 'ARCHIVED' && a.archive_uri === `https://storage.invalid/storage/v1/object/video-factory-assets/${a.archive_object_key}` && a.archived_at, `${a.storage_state} ${a.archive_uri}`);
      check('archive: provider URI preserved', a.uri === 'https://v3b.fal.media/files/dryrun/out.mp4' && a.storage_provider === 'fal');
      check('archive: size and checksum recorded', Number(a.archive_size_bytes) === 5060895 && a.archive_checksum === 'd41d8cd98f00b204e9800998ecf8427e' && a.archive_checksum_algorithm === 'etag');
      check('archive: ASSET_ARCHIVED event', ev.some((x) => x.event_type === 'ASSET_ARCHIVED'));
      check('archive: path ends at Persist Archive', e.path.at(-1) === 'Persist Archive', e.path.at(-1));
    });

    await scenario('Archive: re-run is idempotent (no second object, no duplicate asset)', async () => {
      await enableStorage();
      const { asset } = await archivableAsset();
      const first = [];
      await new Engine(ARCHIVE, { db, http: mockHttp([DOWNLOAD_OK, UPLOAD_OK], first) }).run('Manual Trigger');
      const after1 = await assetRow(asset.id);
      const second = [];
      const e2 = await new Engine(ARCHIVE, { db, http: mockHttp([DOWNLOAD_OK, UPLOAD_OK], second) }).run('Manual Trigger');
      const after2 = await assetRow(asset.id);
      const count = (await q('select count(*)::int n from video_factory.assets where generation_job_id = $1', [after1.generation_job_id]))[0].n;
      check('idempotent: second run claims nothing and uploads nothing', second.length === 0 && e2.path.at(-1) === 'Nothing To Archive - Exit', e2.path.at(-1));
      check('idempotent: single asset row, unchanged archive fields', count === 1 && after2.archive_uri === after1.archive_uri && after2.archive_object_key === after1.archive_object_key);
    });

    await scenario('Archive: upload failure marks ARCHIVE_FAILED without touching the generation job', async () => {
      await enableStorage();
      const { job, asset } = await archivableAsset();
      const calls = [];
      await new Engine(ARCHIVE, { db, http: mockHttp([DOWNLOAD_OK, [(c) => c.node === 'Upload To Durable Storage', () => ({ statusCode: 500, body: 'storage unavailable' })]], calls) }).run('Manual Trigger');
      const a = await assetRow(asset.id);
      const j = await jobRow(job.id);
      check('upload failure: asset ARCHIVE_FAILED with backoff', a.storage_state === 'ARCHIVE_FAILED' && a.archive_uri === null && a.archive_attempts === 1 && new Date(a.archive_run_after) > new Date(), `${a.storage_state} attempts=${a.archive_attempts}`);
      check('upload failure: error recorded', /storage upload HTTP 500/.test(a.archive_last_error || ''), a.archive_last_error);
      check('upload failure: generation job untouched (no regeneration path)', j.status === 'DONE' && j.attempts === 1);
      check('upload failure: no duplicate asset rows', (await q('select count(*)::int n from video_factory.assets where generation_job_id = $1', [job.id]))[0].n === 1);
    });

    await scenario('Archive: retry after failure reuses the same object key', async () => {
      await enableStorage();
      const { asset } = await archivableAsset();
      await new Engine(ARCHIVE, { db, http: mockHttp([DOWNLOAD_OK, [(c) => c.node === 'Upload To Durable Storage', () => ({ statusCode: 500, body: 'boom' })]], []) }).run('Manual Trigger');
      await q(`update video_factory.assets set archive_run_after = now() - interval '1 minute' where id = $1`, [asset.id]);
      const calls = [];
      await new Engine(ARCHIVE, { db, http: mockHttp([DOWNLOAD_OK, UPLOAD_OK], calls) }).run('Manual Trigger');
      const a = await assetRow(asset.id);
      check('retry: archived on second pass, same deterministic key', a.storage_state === 'ARCHIVED' && a.archive_object_key === `episodes/${episode.id}/assets/${asset.id}.mp4` && a.archive_attempts === 2, `${a.storage_state} attempts=${a.archive_attempts}`);
      check('retry: upload targeted the same object path', calls[1] && calls[1].url.endsWith(a.archive_object_key));
    });

    await scenario('Archive: provider download failure is recorded and retried later', async () => {
      await enableStorage();
      const { asset } = await archivableAsset();
      const calls = [];
      await new Engine(ARCHIVE, { db, http: mockHttp([[(c) => c.node === 'Download Provider Asset', () => ({ statusCode: 404, body: 'gone' })]], calls) }).run('Manual Trigger');
      const a = await assetRow(asset.id);
      check('download failure: no upload attempted', calls.length === 1);
      check('download failure: ARCHIVE_FAILED with download stage error', a.storage_state === 'ARCHIVE_FAILED' && /download HTTP 404/.test(a.archive_last_error || ''), a.archive_last_error);
    });

    // Workflow JSON itself carries no credential values.
    const wfText = JSON.stringify(GEN) + JSON.stringify(POLL);
    check('workflow JSON contains no credential values', !secretValues.some((s) => wfText.includes(s)));
    check('workflow JSON binds no credentials', ![...GEN.nodes, ...POLL.nodes].some((n) => n.credentials));
  } finally {
    await q('rollback');
  }

  const after = await snapshot();
  const creditsAfter = await kieCredits();
  check('rollback: production row counts unchanged', ['jobs', 'attempts', 'assets', 'lineage', 'cost', 'events', 'episodes'].every((k) => after[k] === before[k]), JSON.stringify({ before, after }));
  check('rollback: provider adapters still inactive', after.adapters === before.adapters && !/true/.test(after.adapters), after.adapters);
  check('rollback: production runs (Episode 2) untouched', after.runs === before.runs);
  check('rollback: provider offers untouched', after.offers_md5 === before.offers_md5);
  check('public base tables still 10', after.public_tables === 10);
  check('Kie credits unchanged (no paid request)', creditsBefore === creditsAfter, `${creditsBefore} -> ${creditsAfter}`);
  await db.end();

  const failed = results.filter((r) => !r.ok);
  if (RUNTIME_DB_ROLE) console.log(`Runtime Postgres nodes executed under role: ${RUNTIME_DB_ROLE}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    for (const f of failed) console.log(`FAILED: ${f.name} ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
