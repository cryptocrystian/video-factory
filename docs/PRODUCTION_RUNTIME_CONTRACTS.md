# Video Factory Production Runtime Contracts v2

Status: **Canonical structured contracts**
Supersedes: v1

## 1. Canonical shot brief contract

Persistence: `video_factory.shot_briefs`

Existing explicit columns remain authoritative. The following v2 fields may initially live inside structured JSON metadata until promoted to dedicated columns:

- `shot_jobs[]`: EMOTION_OR_CURIOSITY_CHANGE | ACTION_OR_INFORMATION_ADVANCE | PRESSURE_SCALE_CONSEQUENCE
- `viewer_question`
- `obstacle_or_uncertainty`
- `controlled_gaze`
- `primary_camera_move`
- `secondary_camera_adjustment`
- `physical_detail.environmental_pressure`
- `physical_detail.micro_action_or_state_change`
- `physical_detail.sound_or_visual_anchor`
- `final_frame_intent`
- `priority_declaration.must_survive[]`
- `priority_declaration.mandatory_beats[]`
- `priority_declaration.may_vary[]`

A shot cannot enter paid generation unless:
- at least one shot job exists
- final-frame intent exists for generated motion
- camera motion is motivated
- capability requirements are explicit

## 2. Continuity package contract

Persistence: `video_factory.continuity_packages`

Add structured usage semantics:
- canonical anchor asset(s)
- derived-frame parentage
- maximum preferred derivation depth
- reference-role manifest
- attributes each reference controls
- attributes each reference must not control
- exact-boundary chaining flag when terminal→start continuity is required

Reference assets are inputs with roles, not generic inspiration buckets.

## 3. Previsualization contract

Persistence: `video_factory.previsualizations`

Supported:
- PAPER_EDIT
- STORYBOARD
- ANIMATIC
- OTHER

Each storyboard/animatic panel should record:
- story beat
- function tag
- controlled gaze / visual anchor
- implied movement
- expected transition
- planned duration

A hero sequence cannot enter unrestricted premium generation until paper edit + storyboard/animatic gates are satisfied.

## 4. Canonical director brief

NEW logical contract.

A canonical director brief is provider-independent and immutable by generation workers.

It includes:
- narrative purpose
- shot jobs
- subject/environment
- composition objective
- physical behavior
- camera/lens
- light evolution
- continuity constraints
- reference-role manifest
- final-frame intent
- negative constraints
- priorities
- duration target
- provenance/evidence limits

The benchmark system and prompt compiler reference its version.

## 5. Prompt compilation contract

NEW logical contract.

For each generation attempt preserve:
- canonical brief ID/version
- selected canonical model
- selected provider offer
- compiler version
- model-adapter version
- exact positive prompt
- exact negative prompt
- exact reference bindings + roles
- exact provider parameters
- unsupported canonical instructions removed or transformed
- any required upstream change request

The Prompt Compiler may alter syntax, not intent.

Provider request payloads already persisted in generation attempts remain the final forensic record of what was submitted.

## 6. Premium-spend justification

Persistence: `video_factory.premium_spend_justifications`

No premium escalation without:
- capability reason
- lower-cost alternative considered
- insufficiency reason
- incremental cost
- approval

## 7. Benchmark contract

Persistence:
- `video_factory.model_benchmark_runs`
- `video_factory.model_benchmark_results`

Every benchmark declares:
- `benchmark_type`: CREATIVE | CONTINUITY | SEQUENCE | RELIABILITY
- one decision question
- one falsifiable hypothesis
- canonical director brief version
- participating models
- allowed model-native compilation rules
- native duration/resolution
- normalization method
- automatic rejection conditions
- one-attempt policy
- blind labels
- maximum spend
- decision rule after results

### Creative benchmark
- no shared start frame unless the thing being tested specifically requires one
- models may interpret production design within the canonical brief

### Continuity benchmark
- shared approved reference is intentional
- identity preservation is a primary scoring dimension

### Sequence benchmark
- tests connected shots/editability, not isolated clip beauty

Never use one benchmark to answer a different question.

## 8. QC contract

Persistence: `video_factory.qc_reviews`

In addition to current fields, QC should evaluate:
- story-job completion
- final-frame completion
- camera-move coherence
- reference-role adherence
- priority preservation
- unintended reference bleed
- native-quality artifacts
- normalized-review usefulness

A result may be technically successful and still be creatively rejected.

## 9. Deterministic graphics/render contract

Evidence-to-Visual produces a render spec containing:
- composition ID
- duration
- dimensions/fps
- brand tokens
- source assets
- text/data payload
- animation timing
- transition behavior
- citations
- expected deterministic output

Preferred executor:
- Remotion for graphics/compositing/maps/captions
- FFmpeg for simple deterministic media operations

Generative video is not the default graphics renderer.

## 10. Resume / idempotency contract

Completed paid assets must never be regenerated merely because orchestration resumed.

Before rerun:
- inspect existing attempts
- inspect provider acceptance state
- inspect archived assets
- reuse approved outputs
- rerun only failed/incomplete stage

## 11. Runtime order

```
story / facts
→ canonical director brief
→ paper edit / storyboard / animatic
→ continuity resolution
→ route by required capability
→ compile model-native request
→ spend authorization
→ submit generation
→ archive
→ QC
→ deterministic graphics / post
→ edit
```

A downstream failure returns to the nearest owning layer:
- bad idea → Director
- bad timing → Editor
- bad camera → Cinematography
- drift → Continuity
- unsupported request → Router / Prompt Compiler
- provider failure → Adapter
- technically good but visually weak → QC → creative redesign, not blind reroll
