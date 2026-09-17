// Step functions used by the n8n Code nodes of
//   VF - Generation Worker v1
//   VF - Provider Poll v1
// Each takes plain JSON and returns plain JSON so that the identical text can
// run inside n8n and inside scripts/test-runtime.mjs.

const VF_SUBMIT_NORMALIZERS = { fal: vfFalNormalizeSubmit, kie: vfKieNormalizeSubmit };

// ---------------------------------------------------------------------------
// Generation Worker
// ---------------------------------------------------------------------------

// "Select Quality-First Route": ctx = Load Routing Context row.
function vfStepSelectRoute(ctx, workerId) {
  if (!ctx || !ctx.job || !ctx.job.id) {
    return { outcome: 'LEASE_LOST', worker_id: workerId };
  }
  const route = vfSelectRoute(Object.assign({}, ctx, { worker_id: workerId }));
  const base = { worker_id: workerId, job_id: ctx.job.id };
  if (route.outcome !== 'ROUTED') {
    return Object.assign(base, {
      outcome: 'NO_ROUTE',
      fail_payload: vfFailPayload({ job_id: ctx.job.id, worker_id: workerId, attempt_id: null, error: route.error, stage: 'route', routing_decision: route.decision }),
    });
  }
  return Object.assign(base, { outcome: 'ROUTED', route, job: ctx.job });
}

// "Normalize Provider Request": plan = output of vfStepSelectRoute.
function vfStepNormalizeRequest(plan) {
  const { route, job } = plan;
  const s = route.selected;
  const impl = VF_PROVIDER_ADAPTERS[s.provider_slug];
  let providerRequest;
  try {
    providerRequest = impl.buildRequest(s, job, route.params, route.inputs);
  } catch (e) {
    return Object.assign({}, plan, {
      outcome: 'INVALID',
      fail_payload: vfFailPayload({ job_id: job.id, worker_id: plan.worker_id, attempt_id: null, error: 'REQUEST_NORMALIZATION_FAILED: ' + vfTruncate(e && e.message, 300), stage: 'normalize_request' }),
    });
  }

  // Normalized submit input (contract v1). Stored on the attempt; contains no credentials.
  const submitInput = {
    contract_version: VF_CONTRACT_VERSION,
    provider_slug: s.provider_slug,
    provider_model_slug: s.provider_model_key,
    provider_model_offer_id: s.provider_offer_id,
    canonical_model_slug: s.canonical_model_slug,
    required_mode: route.mode,
    prompt: job.prompt || null,
    negative_prompt: job.negative_prompt || null,
    parameters: route.params,
    input_manifest: route.inputs,
    idempotency_key: job.idempotency_key || 'generation_job:' + job.id + ':attempt:' + job.attempts,
    provider_request: { method: providerRequest.method, url: providerRequest.url, body: providerRequest.body, queue_path: providerRequest.queue_path || null },
  };

  return {
    outcome: 'READY',
    worker_id: plan.worker_id,
    job_id: job.id,
    job_kind: job.job_kind,
    provider_slug: s.provider_slug,
    provider_request: providerRequest,
    estimate: route.estimate,
    lineage: vfLineageFor(route.inputs),
    persist_payload: {
      job_id: job.id,
      worker_id: plan.worker_id,
      canonical_model_id: s.canonical_model_id,
      provider_model_offer_id: s.provider_offer_id,
      routing_decision: route.decision,
      estimated_cost: route.estimate.amount,
      cost_estimate: route.estimate,
      currency: route.estimate.currency || 'USD',
      request_payload: submitInput,
    },
  };
}

// "Normalize Submit Result": request = Normalize Provider Request output,
// attempt = Persist Route + Create Attempt row, httpItem = HTTP node item json.
function vfStepAfterSubmit(request, attempt, httpItem) {
  const http = vfHttpResult(httpItem);
  const normalized = VF_SUBMIT_NORMALIZERS[request.provider_slug](http);
  const submitOutput = {
    accepted: normalized.accepted,
    provider_job_id: normalized.provider_job_id,
    status: normalized.status,
    estimated_cost: request.estimate ? request.estimate.amount : null,
    raw_response: normalized.raw_response,
    poll: normalized.poll || null,
    http_status: http.status_code,
  };
  const common = { worker_id: request.worker_id, job_id: request.job_id, attempt_id: attempt.attempt_id, provider_slug: request.provider_slug, submit: submitOutput };

  if (!normalized.accepted) {
    return Object.assign(common, {
      outcome: 'FAILED',
      fail_payload: vfFailPayload({ job_id: request.job_id, worker_id: request.worker_id, attempt_id: attempt.attempt_id, error: normalized.error, stage: 'submit', raw_response: normalized.raw_response }),
    });
  }
  if (normalized.status === 'SUCCEEDED' && Array.isArray(normalized.files) && normalized.files.length) {
    return Object.assign(common, {
      outcome: 'SUCCEEDED',
      complete_payload: vfCompletePayload({
        job_id: request.job_id,
        attempt_id: attempt.attempt_id,
        worker_id: request.worker_id,
        expected_status: 'PROCESSING',
        job_kind: request.job_kind,
        provider_slug: request.provider_slug,
        provider_job_id: normalized.provider_job_id,
        normalized,
        estimate: request.estimate,
        lineage: request.lineage,
      }),
    });
  }
  return Object.assign(common, {
    outcome: 'WAITING_PROVIDER',
    mark_payload: {
      job_id: request.job_id,
      attempt_id: attempt.attempt_id,
      worker_id: request.worker_id,
      provider_job_id: normalized.provider_job_id,
      submit_result: submitOutput,
    },
  });
}

// ---------------------------------------------------------------------------
// Provider Poll
// ---------------------------------------------------------------------------

// "Build Poll Request": row = Claim Waiting Provider Job row.
function vfStepBuildPoll(row, workerId, nowIso) {
  if (!row || !row.job || !row.job.id) return { outcome: 'NO_JOB' };
  const job = row.job;
  const attempt = row.attempt;
  const base = { worker_id: workerId, job_id: job.id, provider_slug: row.provider_slug, job_kind: job.job_kind };

  if (!attempt || !attempt.id) {
    return Object.assign(base, { outcome: 'FAILED', attempt_id: null, fail_payload: vfFailPayload({ job_id: job.id, worker_id: workerId, attempt_id: null, error: 'ATTEMPT_RECORD_MISSING for provider job ' + job.external_job_id, stage: 'poll' }) });
  }
  base.attempt_id = attempt.id;

  const adapter = row.adapter || {};
  const startedMs = Date.parse(attempt.started_at);
  const maxMinutes = vfNum(adapter.max_poll_minutes) || 30;
  if (Number.isFinite(startedMs) && Date.parse(nowIso) - startedMs > maxMinutes * 60000) {
    return Object.assign(base, {
      outcome: 'FAILED',
      fail_payload: vfFailPayload({ job_id: job.id, worker_id: workerId, attempt_id: attempt.id, error: 'PROVIDER_POLL_TIMEOUT after ' + maxMinutes + ' minutes (provider job ' + job.external_job_id + ')', stage: 'poll' }),
    });
  }

  const inputs = vfResolveInputs(job, row.input_assets);
  const ctx = Object.assign(base, {
    provider_job_id: job.external_job_id,
    estimate: (job.routing_decision && job.routing_decision.cost_estimate) || null,
    lineage: vfLineageFor(inputs),
  });

  if (row.provider_slug === 'fal') {
    const r = vfFalStatusRequest(attempt, row.offer || {});
    return Object.assign(ctx, { outcome: 'POLL', provider_request: { method: 'GET', url: r.url }, fal_response_url: r.response_url });
  }
  if (row.provider_slug === 'kie') {
    return Object.assign(ctx, { outcome: 'POLL', provider_request: vfKieStatusRequest(attempt) });
  }
  return Object.assign(ctx, { outcome: 'FAILED', fail_payload: vfFailPayload({ job_id: job.id, worker_id: workerId, attempt_id: attempt.id, error: 'NO_POLL_ADAPTER for provider ' + row.provider_slug, stage: 'poll' }) });
}

// "Normalize Poll Result": poll = Build Poll Request output. For fal this
// handles the queue status call; vfStepAfterFalResult handles the result call.
function vfStepAfterPoll(poll, httpItem) {
  const http = vfHttpResult(httpItem);
  const n = poll.provider_slug === 'fal' ? vfFalNormalizeStatus(http) : vfKieNormalizePoll(http);
  if (n.needs_result_fetch) {
    return Object.assign({}, poll, { outcome: 'FETCH_RESULT', provider_request: { method: 'GET', url: poll.fal_response_url }, poll_status: n });
  }
  return vfPollOutcome(poll, n);
}

function vfStepAfterFalResult(poll, httpItem) {
  return vfPollOutcome(poll, vfFalNormalizeResult(vfHttpResult(httpItem)));
}

function vfPollOutcome(poll, n) {
  const pollOutput = {
    status: n.status,
    result_urls: n.result_urls || [],
    actual_cost: null,
    error: n.error || null,
    raw_response: n.raw_response,
    credits_consumed: n.credits_consumed == null ? null : n.credits_consumed,
    transient: n.transient === true,
  };
  const base = Object.assign({}, poll, { poll: pollOutput });
  delete base.provider_request;

  if (n.status === 'SUCCEEDED') {
    const complete = vfCompletePayload({
      job_id: poll.job_id,
      attempt_id: poll.attempt_id,
      worker_id: poll.worker_id,
      expected_status: 'WAITING_PROVIDER',
      job_kind: poll.job_kind,
      provider_slug: poll.provider_slug,
      provider_job_id: poll.provider_job_id,
      normalized: n,
      estimate: poll.estimate,
      lineage: poll.lineage,
    });
    pollOutput.actual_cost = complete.actual_cost;
    return Object.assign(base, { outcome: 'SUCCEEDED', complete_payload: complete });
  }
  if (n.status === 'FAILED' || n.status === 'CANCELLED') {
    return Object.assign(base, {
      outcome: n.status,
      fail_payload: vfFailPayload({ job_id: poll.job_id, worker_id: poll.worker_id, attempt_id: poll.attempt_id, error: n.error || 'provider reported ' + n.status, stage: 'poll', raw_response: n.raw_response }),
    });
  }
  return Object.assign(base, {
    outcome: n.status === 'PENDING' ? 'PENDING' : 'RUNNING',
    release_payload: {
      job_id: poll.job_id,
      worker_id: poll.worker_id,
      attempt_id: poll.attempt_id,
      provider_status: n.status,
      warning: n.transient ? n.error : null,
      raw_response: n.raw_response,
    },
  });
}

// ---------------------------------------------------------------------------
// Shared payload builders (consumed by runtime/sql/*.sql)
// ---------------------------------------------------------------------------

function vfCompletePayload(a) {
  const n = a.normalized;
  const estimate = a.estimate || {};
  // fal does not return a per-request charge: the verified offer rate times the
  // requested units is recorded as the charge and labelled as such.
  // Kie returns credits only: USD stays unknown until a verified credit rate exists.
  let actualCost = null;
  let costStatus = 'UNKNOWN';
  if (a.provider_slug === 'fal' && vfNum(estimate.amount) != null) {
    actualCost = vfNum(estimate.amount);
    costStatus = 'OFFER_RATE_X_REQUESTED_UNITS';
  } else if (a.provider_slug === 'kie') {
    costStatus = n.credits_consumed == null ? 'UNKNOWN' : 'KIE_CREDITS_ONLY';
  }
  return {
    job_id: a.job_id,
    attempt_id: a.attempt_id,
    worker_id: a.worker_id,
    expected_status: a.expected_status,
    asset_type: VF_ASSET_TYPE_BY_JOB_KIND[a.job_kind] || 'OTHER',
    storage_provider: a.provider_slug,
    provider_job_id: a.provider_job_id,
    files: (n.files || []).map((f) => Object.assign({}, f, { mime_type: f.mime_type || vfGuessMime(f.url, a.job_kind) })),
    lineage: a.lineage || [],
    actual_cost: actualCost,
    currency: estimate.currency || 'USD',
    cost_status: costStatus,
    cost_quantity: estimate.units == null ? null : estimate.units,
    cost_unit: estimate.unit || null,
    credits_consumed: n.credits_consumed == null ? null : n.credits_consumed,
    raw_response: n.raw_response,
  };
}

function vfFailPayload(a) {
  return {
    job_id: a.job_id,
    worker_id: a.worker_id,
    attempt_id: a.attempt_id || null,
    error: vfTruncate(a.error || 'unknown failure', 1000),
    stage: a.stage,
    raw_response: a.raw_response == null ? null : a.raw_response,
    routing_decision: a.routing_decision || null,
  };
}

// For error outputs of Postgres/HTTP nodes: pull a readable message.
function vfErrorMessage(item) {
  if (!item) return 'unknown error';
  const e = item.error;
  return vfTruncate(item.message || (e && (e.message || e.description)) || (typeof e === 'string' ? e : JSON.stringify(e || item)), 500);
}
