// Quality-first route selection. Model first, provider second.
//
// Selection order (never reordered for cost):
//   1. quality threshold    - enforced by get_route_candidates (quality_tier >= profile minimum)
//   2. capability match     - required mode, adapter mapping, request constraints, adapter active
//   3. provider reliability - within the chosen model only
//   4. effective price      - within the chosen model only; unknown price ranks after known price
//   5. latency              - within the chosen model only
//
// A lower-priority model is considered only when every offer of every
// higher-priority model is ineligible for a recorded, non-price reason.

const VF_SELECTION_ORDER = ['quality_threshold', 'capability_match', 'provider_reliability', 'effective_price', 'latency'];

const VF_MODE_COMPAT = {
  text_to_image: ['text_to_image'],
  image_edit: ['image_edit', 'image_to_image'],
  text_to_video: ['text_to_video', 'video', 'multimodal_video'],
  image_to_video: ['image_to_video', 'video', 'multimodal_video'],
  reference_to_video: ['reference_to_video', 'multimodal_video'],
  tts: ['tts'],
};

const VF_PROVIDER_ADAPTERS = {
  fal: { supports: vfFalSupports, buildRequest: vfFalBuildRequest },
  kie: { supports: vfKieSupports, buildRequest: vfKieBuildRequest },
};

function vfRequiredMode(job, inputs) {
  const roles = new Set(inputs.filter((i) => i.uri).map((i) => i.role));
  switch (job.job_kind) {
    case 'IMAGE':
      return roles.has('edit_source') || roles.has('reference') ? 'image_edit' : 'text_to_image';
    case 'VIDEO':
      if (roles.has('start_frame')) return 'image_to_video';
      if (roles.has('reference') || roles.has('reference_image') || roles.has('reference_video')) return 'reference_to_video';
      return 'text_to_video';
    case 'TTS':
      return 'tts';
    default:
      return null;
  }
}

function vfOfferRankKey(o) {
  const price = vfNum(o.unit_price);
  return [
    -(vfNum(o.reliability_score) == null ? -1 : vfNum(o.reliability_score)), // reliability desc, unknown last
    price == null ? 1 : 0, // known price before unknown price
    price == null ? 0 : price, // price asc
    -(vfNum(o.latency_score) == null ? -1 : vfNum(o.latency_score)), // latency desc, unknown last
    String(o.provider_slug || ''),
  ];
}

function vfCompareKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

// ctx: the "Load Routing Context" row plus worker_id.
function vfSelectRoute(ctx) {
  const job = ctx.job;
  const req = ctx.requirements || {};
  const profile = ctx.profile;
  const adapters = ctx.adapters || {};
  const inputs = vfResolveInputs(job, ctx.input_assets);
  const params = vfEffectiveParameters(job, ctx.shot);
  const mode = vfRequiredMode(job, inputs);
  const failedOffers = new Set(ctx.failed_offer_ids || []);
  const excludedModels = new Set(Array.isArray(params.exclude_canonical_models) ? params.exclude_canonical_models : []);

  const decision = {
    contract_version: VF_CONTRACT_VERSION,
    strategy: 'QUALITY_FIRST',
    selection_order: VF_SELECTION_ORDER,
    decided_at: new Date().toISOString(),
    decided_by: ctx.worker_id,
    profile_slug: profile ? profile.slug : null,
    routing_class: req.routing_class || null,
    constraints: {
      required_mode: mode,
      resolution: req.resolution || null,
      audio_included: req.audio_included == null ? null : req.audio_included,
      premium_exception_approved: req.premium_approved === true,
      minimum_quality_tier: profile ? profile.minimum_quality_tier : null,
    },
    model_evaluation: [],
    selected: null,
  };

  const fail = (reason) => {
    decision.outcome = 'NO_ELIGIBLE_ROUTE';
    decision.failure_reason = reason;
    return { outcome: 'NO_ROUTE', error: 'NO_ELIGIBLE_ROUTE: ' + reason, decision };
  };

  if (!profile) return fail('ROUTING_PROFILE_NOT_FOUND');
  if (!req.routing_class) return fail('ROUTING_CLASS_MISSING');
  if (!mode) return fail('JOB_KIND_NOT_ROUTABLE_' + job.job_kind);

  const candidates = Array.isArray(ctx.candidates) ? ctx.candidates : [];
  if (!candidates.length) return fail('NO_ROUTING_RULES_FOR_CLASS');

  // Group by routing rule, preserving rule priority (the quality order).
  const groups = [];
  const byRule = {};
  for (const c of candidates) {
    const key = c.routing_rule_id;
    if (!byRule[key]) {
      byRule[key] = { rule_priority: c.rule_priority, rule_role: c.rule_role, canonical_model_id: c.canonical_model_id, canonical_model_slug: c.canonical_model_slug, quality_tier: c.quality_tier, offers: [] };
      groups.push(byRule[key]);
    }
    if (c.provider_offer_id) byRule[key].offers.push(c);
  }
  groups.sort((a, b) => a.rule_priority - b.rule_priority);

  let selected = null;
  for (const g of groups) {
    const evaluation = { rule_priority: g.rule_priority, rule_role: g.rule_role, canonical_model_slug: g.canonical_model_slug, quality_tier: g.quality_tier, offers: [] };
    decision.model_evaluation.push(evaluation);

    if (selected) {
      evaluation.outcome = 'NOT_EVALUATED';
      evaluation.reason = 'HIGHER_PRIORITY_MODEL_SELECTED';
      continue;
    }
    if (excludedModels.has(g.canonical_model_slug)) {
      evaluation.outcome = 'REJECTED';
      evaluation.reason = 'EXCLUDED_BY_QUALITY_GATE';
      continue;
    }

    const eligible = [];
    for (const o of g.offers) {
      let reason = null;
      const adapter = adapters[o.provider_slug];
      const impl = VF_PROVIDER_ADAPTERS[o.provider_slug];
      const offerMode = (o.offer_capabilities && o.offer_capabilities.mode) || null;
      if (!impl) reason = 'PROVIDER_NOT_A_PRODUCTION_ADAPTER';
      else if (!(VF_MODE_COMPAT[mode] || []).includes(offerMode)) reason = 'MODE_MISMATCH';
      else if (!adapter || adapter.provider_active !== true) reason = 'PROVIDER_INACTIVE';
      else if (adapter.adapter_active !== true) reason = 'ADAPTER_INACTIVE';
      else if (failedOffers.has(o.provider_offer_id)) reason = 'PREVIOUS_ATTEMPT_FAILED';
      else reason = impl.supports(o, job, mode, params, inputs);
      evaluation.offers.push({
        provider_offer_id: o.provider_offer_id,
        provider_slug: o.provider_slug,
        provider_model_key: o.provider_model_key,
        unit_price: vfNum(o.unit_price),
        pricing_basis: o.pricing_basis,
        outcome: reason ? 'REJECTED' : 'ELIGIBLE',
        reason,
      });
      if (!reason) eligible.push(o);
    }

    if (!g.offers.length) {
      evaluation.outcome = 'REJECTED';
      evaluation.reason = 'NO_ACTIVE_OFFER_FOR_CONSTRAINTS';
    } else if (!eligible.length) {
      evaluation.outcome = 'REJECTED';
      evaluation.reason = 'NO_CAPABLE_PROVIDER_OFFER';
    } else {
      // Provider second: reliability, then effective price, then latency - within this model only.
      eligible.sort((a, b) => vfCompareKeys(vfOfferRankKey(a), vfOfferRankKey(b)));
      selected = eligible[0];
      evaluation.outcome = 'SELECTED';
      for (const e of evaluation.offers) {
        if (e.provider_offer_id === selected.provider_offer_id) e.outcome = 'SELECTED';
        else if (e.outcome === 'ELIGIBLE') e.reason = 'RANKED_BELOW_SELECTED_OFFER';
      }
    }

    if (!selected && profile.allow_model_fallback === false) break;
  }

  if (!selected) return fail('NO_CAPABLE_OFFER_FOR_ANY_ALLOWED_MODEL');

  const estimate = vfEstimateCost(selected, job, params);
  decision.outcome = 'ROUTED';
  decision.selected = {
    rule_priority: selected.rule_priority,
    rule_role: selected.rule_role,
    canonical_model_id: selected.canonical_model_id,
    canonical_model_slug: selected.canonical_model_slug,
    provider_offer_id: selected.provider_offer_id,
    provider_id: selected.provider_id,
    provider_slug: selected.provider_slug,
    provider_model_key: selected.provider_model_key,
    pricing_basis: selected.pricing_basis,
    unit_price: vfNum(selected.unit_price),
    currency: selected.currency,
    resolution: selected.resolution,
    audio_included: selected.audio_included,
    promotion_name: selected.promotion_name,
  };
  decision.cost_estimate = estimate;

  return { outcome: 'ROUTED', decision, selected, estimate, mode, params, inputs };
}
