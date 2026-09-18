// Builds the runtime workflow JSON from repo sources:
//   provider-adapters/*.js  -> inlined into n8n Code nodes
//   runtime/sql/*.sql       -> Postgres node queries
// Output: workflows/generation-worker.json, workflows/provider-poll.json
//
// Credentials are intentionally not bound in the JSON. Bind these n8n
// credentials after they are created (names match provider_adapters.auth_secret_ref):
//   VIDEO_FACTORY_POSTGRES (Postgres), VIDEO_FACTORY_FAL / VIDEO_FACTORY_KIE (Header Auth)
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const ADAPTER_FILES = ['contract.js', 'fal.js', 'kie.js', 'routing.js', 'storage.js', 'runtime.js'];

export function loadAdapterLibrary() {
  return ADAPTER_FILES.map((f) => fs.readFileSync(path.join(root, 'provider-adapters', f), 'utf8')).join('\n');
}

function sql(name) {
  return fs.readFileSync(path.join(root, 'runtime', 'sql', `${name}.sql`), 'utf8').trim();
}

const LIB = loadAdapterLibrary();
const CRED_NOTE = {
  postgres: 'Requires n8n credential VIDEO_FACTORY_POSTGRES (Video Factory runtime role; never the Music Factory credential).',
  fal: 'Requires n8n Header Auth credential VIDEO_FACTORY_FAL (Authorization: Key <fal key>).',
  kie: 'Requires n8n Header Auth credential VIDEO_FACTORY_KIE (Authorization: Bearer <Kie key>).',
  storage: 'Requires n8n Header Auth credential VIDEO_FACTORY_SUPABASE_STORAGE (Authorization: Bearer <Supabase service key>); the target bucket must exist.',
};

// Build-time defaults only. base_url/bucket come from the providers row at runtime, so
// no project URL is ever committed into workflow JSON.
const MANIFEST = JSON.parse(fs.readFileSync(path.join(root, 'config', 'factory-manifest.json'), 'utf8'));
const STORAGE_DEFAULTS = { backend: MANIFEST.storage.backend, path_template: MANIFEST.storage.path_template, public_read: MANIFEST.storage.public_read, cache_control: MANIFEST.storage.cache_control };

function codeNode(id, name, position, body, withLib = true) {
  return {
    parameters: { jsCode: withLib ? `${LIB}\n\n// ---- node step ----\n${body}` : body },
    id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position,
  };
}

function pgNode(id, name, position, queryName, replacement, opts = {}) {
  return {
    parameters: { operation: 'executeQuery', query: sql(queryName), options: { queryReplacement: replacement } },
    id, name, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position,
    notes: CRED_NOTE.postgres,
    ...(opts.alwaysOutputData ? { alwaysOutputData: true } : {}),
    ...(opts.errorOutput ? { onError: 'continueErrorOutput' } : {}),
  };
}

function httpNode(id, name, position, provider, method, urlExpr, bodyExpr, extra = {}) {
  const parameters = {
    method,
    url: urlExpr,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    options: { response: { response: { fullResponse: true, neverError: true } }, timeout: extra.timeout || 60000 },
  };
  if (extra.responseFile) parameters.options.response.response.responseFormat = 'file';
  if (extra.outputPropertyName) parameters.options.response.response.outputPropertyName = extra.outputPropertyName;
  if (extra.headersExpr) Object.assign(parameters, { sendHeaders: true, specifyHeaders: 'json', jsonHeaders: extra.headersExpr });
  if (extra.binaryField) Object.assign(parameters, { sendBody: true, contentType: 'binaryData', inputDataFieldName: extra.binaryField });
  if (bodyExpr) Object.assign(parameters, { sendBody: true, specifyBody: 'json', jsonBody: bodyExpr });
  return {
    parameters, id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position,
    notes: CRED_NOTE[provider] + (method === 'POST' ? ' Paid submission: never enable retry-on-fail on this node.' : ''),
    onError: 'continueErrorOutput',
  };
}

function cond(id, leftValue, operator, rightValue) {
  return { id, leftValue, rightValue: rightValue === undefined ? '' : rightValue, operator };
}
const OP_TRUE = { type: 'boolean', operation: 'true', singleValue: true };
const OP_STR_EQ = { type: 'string', operation: 'equals' };

function ifNode(id, name, position, leftValue) {
  return {
    parameters: {
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [cond(`${id}-c`, leftValue, OP_TRUE)], combinator: 'and' },
      options: {},
    },
    id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position,
  };
}

// rules: [{ key, conditions: [[leftValue, rightValue], ...], combinator }]
function switchNode(id, name, position, rules) {
  return {
    parameters: {
      rules: {
        values: rules.map((r, i) => ({
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
            conditions: r.conditions.map(([l, v], j) => cond(`${id}-${i}-${j}`, l, OP_STR_EQ, v)),
            combinator: r.combinator || 'and',
          },
          renameOutput: true,
          outputKey: r.key,
        })),
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'other' },
    },
    id, name, type: 'n8n-nodes-base.switch', typeVersion: 3.2, position,
  };
}

function noOp(id, name, position) {
  return { parameters: {}, id, name, type: 'n8n-nodes-base.noOp', typeVersion: 1, position };
}

function stopNode(id, name, position, messageExpr) {
  return { parameters: { errorMessage: messageExpr }, id, name, type: 'n8n-nodes-base.stopAndError', typeVersion: 1, position };
}

function link(connections, from, outputs) {
  // outputs: array per output index of target node names
  connections[from] = { main: outputs.map((targets) => (targets || []).map((node) => ({ node, type: 'main', index: 0 }))) };
}

const SETTINGS = { executionOrder: 'v1', saveExecutionProgress: true, saveManualExecutions: true, executionTimeout: 600 };

// ---------------------------------------------------------------------------
function generationWorker() {
  const X = 260;
  const nodes = [
    { parameters: {}, id: 'vf-gen-manual', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] },
    { parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } }, id: 'vf-gen-schedule', name: 'Every Minute', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 200] },
    codeNode('vf-gen-init', 'Init Worker', [X, 100],
      "const workerId = 'vf-generation-worker:' + $execution.id;\nreturn [{ json: { worker_id: workerId, db_payload: { worker_id: workerId } } }];", false),
    pgNode('vf-gen-recover', 'Recover Stale Jobs', [X * 2, 100], 'recover_stale_jobs', '={{ [ $json.db_payload ] }}', { alwaysOutputData: true, errorOutput: true }),
    pgNode('vf-gen-claim', 'Claim Generation Job', [X * 3, 100], 'claim_generation_job',
      "={{ [ $('Init Worker').first().json.db_payload ] }}", { alwaysOutputData: true }),
    ifNode('vf-gen-claimed', 'Job Claimed?', [X * 4, 100], '={{ Boolean($json.job && $json.job.id) }}'),
    noOp('vf-gen-nojob', 'No Job - Exit', [X * 5, 300]),
    pgNode('vf-gen-context', 'Load Routing Context', [X * 4, 0], 'load_routing_context',
      "={{ [ { job_id: $json.job.id, worker_id: $('Init Worker').first().json.worker_id } ] }}", { errorOutput: true }),
    codeNode('vf-gen-route', 'Select Quality-First Route', [X * 5, 0],
      "return [{ json: vfStepSelectRoute($input.first().json, $('Init Worker').first().json.worker_id) }];"),
    switchNode('vf-gen-route-outcome', 'Route Outcome', [X * 6, 0], [
      { key: 'routed', conditions: [['={{ $json.outcome }}', 'ROUTED']] },
      { key: 'no_route', conditions: [['={{ $json.outcome }}', 'NO_ROUTE']] },
    ]),
    noOp('vf-gen-lease-lost', 'Lease Lost - Exit', [X * 7, 400]),
    codeNode('vf-gen-normalize', 'Normalize Provider Request', [X * 7, -100],
      'return [{ json: vfStepNormalizeRequest($input.first().json) }];'),
    ifNode('vf-gen-ready', 'Request Ready?', [X * 8, -100], "={{ $json.outcome === 'READY' }}"),
    pgNode('vf-gen-persist', 'Persist Route + Create Attempt', [X * 9, -200], 'persist_route_create_attempt',
      '={{ [ $json.persist_payload ] }}', { alwaysOutputData: true, errorOutput: true }),
    ifNode('vf-gen-attempt', 'Attempt Created?', [X * 10, -200], '={{ Boolean($json.attempt_id) }}'),
    switchNode('vf-gen-provider', 'Submit Provider', [X * 11, -200], [
      { key: 'fal', conditions: [["={{ $('Normalize Provider Request').first().json.provider_slug }}", 'fal']] },
      { key: 'kie', conditions: [["={{ $('Normalize Provider Request').first().json.provider_slug }}", 'kie']] },
    ]),
    httpNode('vf-gen-submit-fal', 'Submit to fal', [X * 12, -300], 'fal', 'POST',
      "={{ $('Normalize Provider Request').first().json.provider_request.url }}",
      "={{ JSON.stringify($('Normalize Provider Request').first().json.provider_request.body) }}"),
    httpNode('vf-gen-submit-kie', 'Submit to Kie', [X * 12, -100], 'kie', 'POST',
      "={{ $('Normalize Provider Request').first().json.provider_request.url }}",
      "={{ JSON.stringify($('Normalize Provider Request').first().json.provider_request.body) }}"),
    codeNode('vf-gen-after-submit', 'Normalize Submit Result', [X * 13, -200],
      "return [{ json: vfStepAfterSubmit($('Normalize Provider Request').first().json, $('Persist Route + Create Attempt').first().json, $input.first().json) }];"),
    switchNode('vf-gen-submit-outcome', 'Submit Outcome', [X * 14, -200], [
      { key: 'waiting_provider', conditions: [['={{ $json.outcome }}', 'WAITING_PROVIDER']] },
      { key: 'succeeded', conditions: [['={{ $json.outcome }}', 'SUCCEEDED']] },
    ]),
    pgNode('vf-gen-mark-waiting', 'Mark Waiting Provider', [X * 15, -300], 'mark_waiting_provider', '={{ [ $json.mark_payload ] }}', { errorOutput: true }),
    stopNode('vf-gen-stop-waiting', 'Stop - Waiting State Not Persisted', [X * 16, -300],
      "={{ 'Provider accepted request ' + $('Normalize Submit Result').first().json.submit.provider_job_id + ' but WAITING_PROVIDER was not persisted. Job left PROCESSING to prevent a duplicate paid submission. ' + ($json.message || '') }}"),
    pgNode('vf-gen-complete', 'Persist Sync Completion', [X * 15, -100], 'complete_generation', '={{ [ $json.complete_payload ] }}', { errorOutput: true }),
    stopNode('vf-gen-stop-complete', 'Stop - Completion Not Persisted', [X * 16, -100],
      "={{ 'Provider output for job ' + $('Normalize Submit Result').first().json.job_id + ' was not persisted; job left PROCESSING so paid output is not regenerated. ' + ($json.message || '') }}"),
    codeNode('vf-gen-build-failure', 'Build Failure', [X * 15, 200],
      [
        'const input = $input.first().json;',
        'if (input.fail_payload) return [{ json: { fail_payload: input.fail_payload } }];',
        "const workerId = $('Init Worker').first().json.worker_id;",
        "const jobId = $('Claim Generation Job').first().json.job.id;",
        'let attemptId = null;',
        "try { attemptId = $('Persist Route + Create Attempt').first().json.attempt_id || null; } catch (e) { attemptId = null; }",
        "return [{ json: { fail_payload: vfFailPayload({ job_id: jobId, worker_id: workerId, attempt_id: attemptId, error: 'WORKFLOW_STEP_FAILED: ' + vfErrorMessage(input), stage: 'workflow' }) } }];",
      ].join('\n')),
    pgNode('vf-gen-fail', 'Fail Generation Job', [X * 16, 200], 'fail_generation', '={{ [ $json.fail_payload ] }}'),
  ];

  const c = {};
  link(c, 'Manual Trigger', [['Init Worker']]);
  link(c, 'Every Minute', [['Init Worker']]);
  link(c, 'Init Worker', [['Recover Stale Jobs']]);
  // Recovery is best-effort: its error output still proceeds to the claim.
  link(c, 'Recover Stale Jobs', [['Claim Generation Job'], ['Claim Generation Job']]);
  link(c, 'Claim Generation Job', [['Job Claimed?']]);
  link(c, 'Job Claimed?', [['Load Routing Context'], ['No Job - Exit']]);
  link(c, 'Load Routing Context', [['Select Quality-First Route'], ['Build Failure']]);
  link(c, 'Select Quality-First Route', [['Route Outcome']]);
  link(c, 'Route Outcome', [['Normalize Provider Request'], ['Build Failure'], ['Lease Lost - Exit']]);
  link(c, 'Normalize Provider Request', [['Request Ready?']]);
  link(c, 'Request Ready?', [['Persist Route + Create Attempt'], ['Build Failure']]);
  link(c, 'Persist Route + Create Attempt', [['Attempt Created?'], ['Build Failure']]);
  link(c, 'Attempt Created?', [['Submit Provider'], ['Build Failure']]);
  link(c, 'Submit Provider', [['Submit to fal'], ['Submit to Kie'], ['Build Failure']]);
  link(c, 'Submit to fal', [['Normalize Submit Result'], ['Normalize Submit Result']]);
  link(c, 'Submit to Kie', [['Normalize Submit Result'], ['Normalize Submit Result']]);
  link(c, 'Normalize Submit Result', [['Submit Outcome']]);
  link(c, 'Submit Outcome', [['Mark Waiting Provider'], ['Persist Sync Completion'], ['Build Failure']]);
  link(c, 'Mark Waiting Provider', [[], ['Stop - Waiting State Not Persisted']]);
  link(c, 'Persist Sync Completion', [[], ['Stop - Completion Not Persisted']]);
  link(c, 'Build Failure', [['Fail Generation Job']]);

  return {
    name: 'VF - Generation Worker v1',
    nodes,
    connections: c,
    settings: SETTINGS,
    staticData: null,
    pinData: {},
    meta: { videoFactoryManaged: true, implementationState: 'v1', safeToActivate: false, generatedBy: 'scripts/build-workflows.mjs' },
  };
}

// ---------------------------------------------------------------------------
function providerPoll() {
  const X = 260;
  const nodes = [
    { parameters: {}, id: 'vf-poll-manual', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] },
    { parameters: { rule: { interval: [{ field: 'seconds', secondsInterval: 30 }] } }, id: 'vf-poll-schedule', name: 'Every 30 Seconds', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 200] },
    codeNode('vf-poll-init', 'Init Poller', [X, 100],
      "const workerId = 'vf-provider-poll:' + $execution.id;\nreturn [{ json: { worker_id: workerId, db_payload: { worker_id: workerId, stale_lease_minutes: 10 } } }];", false),
    pgNode('vf-poll-claim', 'Claim Waiting Provider Job', [X * 2, 100], 'claim_waiting_provider_job', '={{ [ $json.db_payload ] }}', { alwaysOutputData: true }),
    ifNode('vf-poll-claimed', 'Job Claimed?', [X * 3, 100], '={{ Boolean($json.job && $json.job.id) }}'),
    noOp('vf-poll-nojob', 'Nothing Due - Exit', [X * 4, 300]),
    codeNode('vf-poll-build', 'Build Poll Request', [X * 4, 0],
      "return [{ json: vfStepBuildPoll($input.first().json, $('Init Poller').first().json.worker_id, new Date().toISOString()) }];"),
    switchNode('vf-poll-route', 'Poll Route', [X * 5, 0], [
      { key: 'fal', conditions: [['={{ $json.outcome }}', 'POLL'], ['={{ $json.provider_slug }}', 'fal']] },
      { key: 'kie', conditions: [['={{ $json.outcome }}', 'POLL'], ['={{ $json.provider_slug }}', 'kie']] },
    ]),
    httpNode('vf-poll-fal-status', 'Poll fal Status', [X * 6, -150], 'fal', 'GET', '={{ $json.provider_request.url }}'),
    httpNode('vf-poll-kie', 'Poll Kie Task', [X * 6, 50], 'kie', 'GET', '={{ $json.provider_request.url }}'),
    codeNode('vf-poll-normalize', 'Normalize Poll Result', [X * 7, -50],
      "return [{ json: vfStepAfterPoll($('Build Poll Request').first().json, $input.first().json) }];"),
    switchNode('vf-poll-outcome', 'Poll Outcome', [X * 8, 0], [
      { key: 'in_progress', conditions: [['={{ $json.outcome }}', 'PENDING'], ['={{ $json.outcome }}', 'RUNNING']], combinator: 'or' },
      { key: 'fetch_result', conditions: [['={{ $json.outcome }}', 'FETCH_RESULT']] },
      { key: 'succeeded', conditions: [['={{ $json.outcome }}', 'SUCCEEDED']] },
    ]),
    pgNode('vf-poll-release', 'Release Poll Lease', [X * 9, -250], 'release_poll_lease', '={{ [ $json.release_payload ] }}'),
    httpNode('vf-poll-fal-result', 'Fetch fal Result', [X * 9, -80], 'fal', 'GET', '={{ $json.provider_request.url }}'),
    codeNode('vf-poll-fal-normalize', 'Normalize fal Result', [X * 10, -80],
      "return [{ json: vfStepAfterFalResult($('Build Poll Request').first().json, $input.first().json) }];"),
    pgNode('vf-poll-complete', 'Persist Completion', [X * 9, 100], 'complete_generation', '={{ [ $json.complete_payload ] }}', { errorOutput: true }),
    stopNode('vf-poll-stop-complete', 'Stop - Completion Not Persisted', [X * 10, 100],
      "={{ 'Provider output for job ' + $json.job_id + ' was not persisted; lease expires and the result is re-fetched without regenerating. ' + ($json.message || '') }}"),
    codeNode('vf-poll-build-failure', 'Build Poll Failure', [X * 9, 300],
      [
        'const input = $input.first().json;',
        'if (input.fail_payload) return [{ json: { fail_payload: input.fail_payload } }];',
        "const poll = $('Build Poll Request').first().json;",
        "return [{ json: { fail_payload: vfFailPayload({ job_id: poll.job_id, worker_id: poll.worker_id, attempt_id: poll.attempt_id, error: 'POLL_WORKFLOW_STEP_FAILED: ' + vfErrorMessage(input), stage: 'poll' }) } }];",
      ].join('\n')),
    pgNode('vf-poll-fail', 'Fail Generation Job', [X * 10, 300], 'fail_generation', '={{ [ $json.fail_payload ] }}'),
  ];

  const c = {};
  link(c, 'Manual Trigger', [['Init Poller']]);
  link(c, 'Every 30 Seconds', [['Init Poller']]);
  link(c, 'Init Poller', [['Claim Waiting Provider Job']]);
  link(c, 'Claim Waiting Provider Job', [['Job Claimed?']]);
  link(c, 'Job Claimed?', [['Build Poll Request'], ['Nothing Due - Exit']]);
  link(c, 'Build Poll Request', [['Poll Route']]);
  link(c, 'Poll Route', [['Poll fal Status'], ['Poll Kie Task'], ['Poll Outcome']]);
  link(c, 'Poll fal Status', [['Normalize Poll Result'], ['Normalize Poll Result']]);
  link(c, 'Poll Kie Task', [['Normalize Poll Result'], ['Normalize Poll Result']]);
  link(c, 'Normalize Poll Result', [['Poll Outcome']]);
  link(c, 'Poll Outcome', [['Release Poll Lease'], ['Fetch fal Result'], ['Persist Completion'], ['Build Poll Failure']]);
  link(c, 'Fetch fal Result', [['Normalize fal Result'], ['Normalize fal Result']]);
  link(c, 'Normalize fal Result', [['Poll Outcome']]);
  link(c, 'Persist Completion', [[], ['Stop - Completion Not Persisted']]);
  link(c, 'Build Poll Failure', [['Fail Generation Job']]);

  return {
    name: 'VF - Provider Poll v1',
    nodes,
    connections: c,
    settings: SETTINGS,
    staticData: null,
    pinData: {},
    meta: { videoFactoryManaged: true, implementationState: 'v1', safeToActivate: false, generatedBy: 'scripts/build-workflows.mjs' },
  };
}


// ---------------------------------------------------------------------------
// Durable archival runs in its own workflow so an archive failure can never
// touch a generation job (and therefore can never cause a second paid call).
function assetArchive() {
  const X = 260;
  const CFG = JSON.stringify(STORAGE_DEFAULTS);
  const nodes = [
    { parameters: {}, id: 'vf-arc-manual', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] },
    { parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } }, id: 'vf-arc-schedule', name: 'Every 5 Minutes', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 200] },
    codeNode('vf-arc-init', 'Init Archiver', [X, 100],
      "const workerId = 'vf-asset-archive:' + $execution.id;\nreturn [{ json: { worker_id: workerId, db_payload: { worker_id: workerId } } }];", false),
    pgNode('vf-arc-claim', 'Claim Asset For Archive', [X * 2, 100], 'claim_asset_archive', '={{ [ $json.db_payload ] }}', { alwaysOutputData: true }),
    ifNode('vf-arc-claimed', 'Asset Claimed?', [X * 3, 100], '={{ Boolean($json.asset && $json.asset.id) }}'),
    noOp('vf-arc-none', 'Nothing To Archive - Exit', [X * 4, 300]),
    codeNode('vf-arc-build', 'Build Archive Request', [X * 4, 0],
      `return [{ json: vfStepBuildArchive($input.first().json, $('Init Archiver').first().json.worker_id, ${CFG}) }];`),
    switchNode('vf-arc-route', 'Archive Route', [X * 5, 0], [
      { key: 'archive', conditions: [['={{ $json.outcome }}', 'ARCHIVE']] },
      { key: 'already_archived', conditions: [['={{ $json.outcome }}', 'ALREADY_ARCHIVED']] },
    ]),
    noOp('vf-arc-already', 'Already Archived - Exit', [X * 6, 200]),
    httpNode('vf-arc-download', 'Download Provider Asset', [X * 6, -100], 'fal', 'GET',
      '={{ $json.download_request.url }}', undefined, { responseFile: true, outputPropertyName: 'data', timeout: 120000 }),
    codeNode('vf-arc-after-download', 'After Download', [X * 7, -100],
      [
        "const plan = $('Build Archive Request').first().json;",
        'const item = $input.first().json;',
        'const headers = item.headers || {};',
        "const meta = { fileSize: headers['content-length'], mimeType: headers['content-type'] };",
        '// binary must be returned explicitly or the downloaded bytes are dropped before upload',
        'return [{ json: vfStepAfterDownload(plan, item, meta), binary: $input.first().binary }];',
      ].join('\n')),
    ifNode('vf-arc-downloaded', 'Download OK?', [X * 8, -100], "={{ $json.outcome === 'UPLOAD' }}"),
    httpNode('vf-arc-upload', 'Upload To Durable Storage', [X * 9, -200], 'storage', 'POST',
      "={{ $('Build Archive Request').first().json.upload_request.url }}", undefined,
      { binaryField: 'data', headersExpr: "={{ JSON.stringify($('Build Archive Request').first().json.upload_request.headers) }}", timeout: 120000 }),
    codeNode('vf-arc-after-upload', 'After Upload', [X * 10, -200],
      `return [{ json: vfStepAfterUpload($('After Download').first().json, $input.first().json, Object.assign({}, ${CFG}, $('Build Archive Request').first().json.storage_config || {})) }];`),
    ifNode('vf-arc-stored', 'Archive Stored?', [X * 11, -200], "={{ $json.outcome === 'ARCHIVED' }}"),
    pgNode('vf-arc-persist', 'Persist Archive', [X * 12, -300], 'persist_archive', '={{ [ $json.persist_payload ] }}', { errorOutput: true }),
    stopNode('vf-arc-stop', 'Stop - Archive Not Recorded', [X * 13, -300],
      "={{ 'Object was uploaded but archive state was not recorded for asset ' + $('Build Archive Request').first().json.asset_id + '; the same object key is reused on retry. ' + ($json.message || '') }}"),
    codeNode('vf-arc-failure', 'Build Archive Failure', [X * 10, 200],
      [
        'const input = $input.first().json;',
        "const plan = $('Build Archive Request').first().json;",
        'const payload = input.fail_payload || { asset_id: plan.asset_id, worker_id: plan.worker_id, stage: \'workflow\', error: vfErrorMessage(input) };',
        'return [{ json: { fail_payload: payload } }];',
      ].join('\n')),
    pgNode('vf-arc-fail', 'Fail Archive', [X * 11, 200], 'fail_archive', '={{ [ $json.fail_payload ] }}'),
  ];

  const c = {};
  link(c, 'Manual Trigger', [['Init Archiver']]);
  link(c, 'Every 5 Minutes', [['Init Archiver']]);
  link(c, 'Init Archiver', [['Claim Asset For Archive']]);
  link(c, 'Claim Asset For Archive', [['Asset Claimed?']]);
  link(c, 'Asset Claimed?', [['Build Archive Request'], ['Nothing To Archive - Exit']]);
  link(c, 'Build Archive Request', [['Archive Route']]);
  link(c, 'Archive Route', [['Download Provider Asset'], ['Already Archived - Exit'], ['Build Archive Failure']]);
  link(c, 'Download Provider Asset', [['After Download'], ['After Download']]);
  link(c, 'After Download', [['Download OK?']]);
  link(c, 'Download OK?', [['Upload To Durable Storage'], ['Build Archive Failure']]);
  link(c, 'Upload To Durable Storage', [['After Upload'], ['After Upload']]);
  link(c, 'After Upload', [['Archive Stored?']]);
  link(c, 'Archive Stored?', [['Persist Archive'], ['Build Archive Failure']]);
  link(c, 'Persist Archive', [[], ['Stop - Archive Not Recorded']]);
  link(c, 'Build Archive Failure', [['Fail Archive']]);

  return {
    name: 'VF - Asset Archive Worker v1',
    nodes,
    connections: c,
    settings: SETTINGS,
    staticData: null,
    pinData: {},
    meta: { videoFactoryManaged: true, implementationState: 'v1', safeToActivate: false, generatedBy: 'scripts/build-workflows.mjs' },
  };
}

export const BUILDERS = {
  'workflows/generation-worker.json': generationWorker,
  'workflows/provider-poll.json': providerPoll,
  'workflows/asset-archive.json': assetArchive,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [file, build] of Object.entries(BUILDERS)) {
    const text = `${JSON.stringify(build(), null, 2)}\n`;
    const target = path.join(root, file);
    if (check) {
      const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
      if (current !== text) { console.error(`Out of date: ${file} (run npm run build:workflows)`); stale = true; }
    } else {
      fs.writeFileSync(target, text);
      console.log(`Built ${file} (${text.length} bytes)`);
    }
  }
  if (stale) process.exit(1);
}
