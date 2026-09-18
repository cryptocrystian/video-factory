// Video Factory normalized provider contract (v1).
//
// This file and the other provider-adapters/*.js files are plain scripts that
// share one scope. scripts/build-workflows.mjs inlines them into n8n Code
// nodes, and scripts/test-runtime.mjs loads the same text for dry-run tests.
// Do not use require/import here: n8n Code nodes cannot load local modules.
//
// Submit input : provider_model_slug, prompt, negative_prompt, parameters,
//                input_manifest, idempotency_key
// Submit output: accepted, provider_job_id, status, estimated_cost, raw_response
// Poll output  : status (PENDING|RUNNING|SUCCEEDED|FAILED|CANCELLED),
//                result_urls[], actual_cost, error, raw_response
//
// Credentials never appear in any of these objects. HTTP authentication is
// attached by n8n credentials on the HTTP Request nodes.

const VF_CONTRACT_VERSION = '1.0';
const VF_POLL_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];
const VF_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VF_ASSET_TYPE_BY_JOB_KIND = {
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  TTS: 'VOICE',
  MUSIC: 'MUSIC',
};

const VF_LINEAGE_BY_ROLE = {
  start_frame: 'START_FRAME',
  end_frame: 'END_FRAME',
  reference: 'REFERENCE',
  reference_image: 'REFERENCE',
  reference_video: 'REFERENCE',
  reference_audio: 'AUDIO_SOURCE',
  audio: 'AUDIO_SOURCE',
  edit_source: 'EDIT_SOURCE',
};

function vfIsUuid(value) {
  return typeof value === 'string' && VF_UUID_RE.test(value);
}

function vfRound6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function vfNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function vfTruncate(text, max) {
  const s = String(text == null ? '' : text);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Resolve input_manifest entries to { role, uri, asset_id } using the
// registered assets loaded from video_factory.assets when an entry only
// carries an asset_id.
function vfResolveInputs(job, inputAssets) {
  const byId = {};
  for (const a of inputAssets || []) byId[a.asset_id] = a;
  const manifest = Array.isArray(job.input_manifest) ? job.input_manifest : [];
  return manifest.map((entry) => {
    const role = String(entry.role || '').toLowerCase();
    const asset = vfIsUuid(entry.asset_id) ? byId[entry.asset_id] : undefined;
    return {
      role,
      uri: entry.uri || entry.url || (asset && asset.uri) || null,
      asset_id: asset ? asset.asset_id : null,
    };
  });
}

function vfInputsByRole(inputs, role) {
  return inputs.filter((i) => i.role === role && i.uri).map((i) => i.uri);
}

// Effective generation parameters: job.parameters win, then shot planning data.
function vfEffectiveParameters(job, shot) {
  const params = Object.assign({}, job.parameters || {});
  if (params.duration_seconds == null && shot && shot.target_duration_seconds != null) {
    params.duration_seconds = vfNum(shot.target_duration_seconds);
  }
  if (params.aspect_ratio == null && shot && shot.aspect_ratio) {
    params.aspect_ratio = shot.aspect_ratio;
  }
  return params;
}

function vfRequestedDuration(params) {
  const d = vfNum(params.duration_seconds != null ? params.duration_seconds : params.duration);
  return d == null ? 5 : d;
}

// Cost estimate from a verified offer. Unknown prices stay unknown: the
// router never invents a price, and an unknown price never beats a known one.
function vfEstimateCost(offer, job, params) {
  const price = vfNum(offer.unit_price);
  const currency = offer.currency || 'USD';
  if (price == null) {
    return { amount: null, units: null, unit: null, currency, status: 'UNKNOWN_PRICE', pricing_basis: offer.pricing_basis };
  }
  let units = null;
  let unit = null;
  switch (offer.pricing_basis) {
    case 'PER_SECOND':
      units = Math.ceil(vfRequestedDuration(params));
      unit = 'second';
      break;
    case 'PER_IMAGE':
      units = Math.max(1, Math.floor(vfNum(params.num_images) || 1));
      unit = 'image';
      break;
    case 'PER_CHARACTER':
      units = String(job.prompt || '').length;
      unit = 'character';
      break;
    case 'PER_REQUEST':
      units = 1;
      unit = 'request';
      break;
    default:
      return { amount: null, units: null, unit: null, currency, status: 'UNSUPPORTED_PRICING_BASIS', pricing_basis: offer.pricing_basis };
  }
  return { amount: vfRound6(price * units), units, unit, currency, status: 'ESTIMATED_FROM_OFFER', pricing_basis: offer.pricing_basis, unit_price: price };
}

function vfGuessMime(url, jobKind) {
  const u = String(url || '').split('?')[0].toLowerCase();
  if (u.endsWith('.mp4')) return 'video/mp4';
  if (u.endsWith('.mov')) return 'video/quicktime';
  if (u.endsWith('.webm')) return 'video/webm';
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.mp3')) return 'audio/mpeg';
  if (u.endsWith('.wav')) return 'audio/wav';
  return { VIDEO: 'video/mp4', IMAGE: 'image/png', TTS: 'audio/mpeg', AUDIO: 'audio/mpeg' }[jobKind] || null;
}

// Lineage rows for a completed job, derived from registered input assets only.
function vfLineageFor(inputs) {
  const seen = new Set();
  const rows = [];
  for (const i of inputs) {
    if (!i.asset_id) continue;
    const rel = VF_LINEAGE_BY_ROLE[i.role] || 'SOURCE';
    const key = i.asset_id + ':' + rel;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ asset_id: i.asset_id, relationship_type: rel });
  }
  return rows;
}

// Normalize an HTTP Request node result (fullResponse + neverError, or an
// error-output item) into { transport_ok, status_code, body, transport_error }.
function vfHttpResult(item) {
  const j = item || {};
  if (typeof j.statusCode === 'number') {
    // n8n puts a non-JSON response body under `data` when fullResponse is on.
    let body = j.body !== undefined ? j.body : j.data;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { /* keep text */ }
    }
    return { transport_ok: true, status_code: j.statusCode, body, headers: j.headers || {}, transport_error: null };
  }
  const message = (j.error && (j.error.message || j.error.description)) || j.message || 'HTTP request failed before a response was received';
  return { transport_ok: false, status_code: null, body: null, headers: {}, transport_error: vfTruncate(message, 500) };
}

// Strip anything that could carry authentication material before persisting a
// raw provider payload.
function vfSafeRaw(value) {
  const drop = /^(authorization|proxy-authorization|cookie|set-cookie|token|access_token|refresh_token)$/i;
  const walk = (v, depth) => {
    if (depth > 8 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => walk(x, depth + 1));
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (drop.test(k)) continue;
      out[k] = walk(x, depth + 1);
    }
    return out;
  };
  return walk(value, 0);
}
