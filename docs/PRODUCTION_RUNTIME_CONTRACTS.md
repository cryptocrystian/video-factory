# Video Factory Production Runtime Contracts v1

Status: Canonical structured contracts for the upgraded Synthetic Frontier production system.

## Shot brief contract

A shot brief is the machine-readable output of Director + Cinematography + Production Design.

Required fields:
- shot_id
- version
- status
- story_purpose
- emotional_objective
- shot_class
- source_mode
- provenance_class
- rights_class
- shot_tier
- camera_position
- lens_character
- framing
- camera_movement
- subject_movement
- environment_movement
- depth_parallax
- lighting_start
- lighting_evolution
- focus_behavior
- shot_endpoint
- transition_in
- transition_out
- target_duration_seconds
- continuity_package_id
- capability_requirements
- negative_constraints
- evidence_refs
- director_notes

The canonical persistence table is `video_factory.shot_briefs`.

## Continuity package contract

Canonical persistence: `video_factory.continuity_packages`.

A package defines:
- recurring subject identity
- geometry
- materials
- scale
- lighting states
- signature features
- prohibited mutations
- canonical reference asset IDs
- prompt anchors

A recurring subject must not be independently redesigned by generation prompts.

## Previsualization contract

Canonical persistence: `video_factory.previsualizations`.

Supported types:
- PAPER_EDIT
- STORYBOARD
- ANIMATIC
- OTHER

A hero sequence cannot enter unrestricted premium generation until a paper edit exists and storyboard/animatic gates are satisfied.

## Premium-spend justification contract

Canonical persistence: `video_factory.premium_spend_justifications`.

Required:
- episode / scene / shot
- selected canonical model when known
- one or more reason codes
- narrative importance
- expected screen seconds
- capability need
- lower-cost alternatives considered
- why those alternatives are insufficient
- expected incremental cost
- approval state

No justification = no automatic premium escalation.

## Model benchmark contract

Canonical persistence:
- `video_factory.model_benchmark_runs`
- `video_factory.model_benchmark_results`

Each benchmark uses a fixed, versioned creative brief.

Each model result records:
- model
- provider offer
- generation job
- attempt number
- acceptance status
- dimension scores
- failure codes
- generated seconds
- accepted screen seconds
- generation cost
- cleanup minutes
- latency
- notes

Primary optimization metric: **cost per accepted production second**.

## QC contract

Existing `video_factory.qc_reviews` is extended for:
- shot_id
- generation_job_id
- decision: ACCEPT / REJECT / REPAIR
- failure_codes[]
- dimension_scores
- repair_plan
- provenance_class
- rights_class

A paid result may be rejected without regard to sunk cost.

## Rights gate

Allowed final-master states:
- OWNED
- LICENSED
- PUBLIC_DOMAIN
- FAIR_USE_EDITORIAL

Blocking states:
- PERMISSION_REQUIRED
- UNKNOWN

## Provenance gate

Allowed internal classifications:
- DOCUMENTED
- RECONSTRUCTION
- CONCEPT
- SPECULATIVE

Generated visuals must never be silently presented as DOCUMENTED.

## Runtime implementation order

1. Director creates/updates shot brief.
2. Continuity package resolved.
3. Editor creates paper edit.
4. Storyboard/animatic produced.
5. Creative router reads capability requirements + benchmark evidence.
6. Premium justification created when required.
7. Generation/acquisition occurs.
8. QC review records decision/failure codes.
9. Accepted results enter edit.
10. Benchmark/acceptance telemetry feeds future routing.

## Current security posture

New production-intelligence tables:
- have RLS enabled
- are not exposed to anon/authenticated/public
- are not automatically granted to the restricted generation runtime role

Worker grants should be added only when a concrete workflow requires them.
