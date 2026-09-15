# Video Factory Model Routing — Quality-First v1

## Doctrine

Quality is the first constraint. Cost matters only after a candidate model clears the required quality and capability bar for the shot.

The router therefore makes two separate decisions:

1. **Model selection** — choose the best model class for the creative and technical requirements of the shot.
2. **Provider selection** — after the model is chosen, select the best verified provider offer for that model using reliability, effective price, promotions, and latency.

A temporary provider discount may break a provider tie. It must never cause the factory to select a lower-quality model than the scene requires.

## Synthetic Frontier v1 routing profile

Profile: `synthetic-frontier-v1`
Strategy: `QUALITY_FIRST`
Minimum model quality tier: 4/5

Selection order:

1. quality threshold
2. capability match
3. provider reliability
4. effective price
5. latency

## Routing classes

### STATIC_HERO
Primary: `gpt_image_2_5_sunburst`
Fallback: `flux_2_max`

Use for hero frames, title frames, editorial graphics, precise compositing, image edits, and other frames where instruction fidelity matters more than generation cost.

### STANDARD_CINEMATIC_MOTION
Primary: `minimax_h3_max_turbo`
Fallback 1: `minimax_h3_max`
Fallback 2: `kling_3`

Use for routine cinematic motion and the majority of volume image-to-video work. Turbo is preferred when it clears the visual quality gate. Move to Max when Turbo does not. Kling is the premium motion fallback.

### PRECISE_MULTI_SHOT
Primary: `kling_3`
Fallback: `seedance_2_5`

Use when the shot requires multi-shot structure, precise first/last-frame behavior, complex motion, or stronger temporal control.

### HEAVY_MULTIMODAL
Primary: `seedance_2_5`
Fallback: `kling_3`

Use for complex hero scenes, multiple references, longer takes, or scenes whose success depends on richer multimodal reference handling.

### PREMIUM_EXCEPTION
Model: `veo_3_1`

Veo is registered but is not a normal fallback. It requires explicit approval and should be used only when the shot materially benefits from it or other routes fail the quality gate.

### NARRATION
Primary: `elevenlabs_multilingual_v2`

Narration should be treated as its own production layer rather than inheriting whichever provider is used for image/video generation.

## Provider policy

Production aggregators in v1:

- `fal`
- `kie`

Higgsfield is not a production API provider. It is retained only as an interactive MCP-based prototyping/comparison surface.

Provider adapters remain inactive until credentials, endpoint/model identifiers, and callback/poll semantics are verified.

## Dynamic pricing and promotions

The database table `video_factory.provider_model_offers` stores time-bounded provider offers. It supports:

- provider
- canonical model
- provider-specific model key
- pricing basis
- unit price
- resolution
- whether audio is included
- promotion name
- effective dates
- last checked timestamp
- source
- quality/reliability/latency observations

Provider price is deliberately not hard-coded into routing rules.

Promotions such as temporary Kie discounts are represented as offers and can influence provider selection once quality and capability constraints have already been satisfied.

## Generation-job audit trail

Every generation job can now record:

- `canonical_model_id`
- `provider_model_offer_id`
- `routing_decision`

The routing decision JSON should capture why the model and provider were selected, including rejected alternatives when useful. This makes model routing auditable and allows us to measure whether cheaper routes actually preserve production quality.

## Asset reuse

Approved assets should be reused whenever their lineage and intended use permit it. The factory must not regenerate paid media merely because a workflow restarted.

## Next implementation step

Build provider discovery/pricing sync for fal and Kie, populate verified `provider_model_offers`, and only then activate those provider adapters in n8n.
