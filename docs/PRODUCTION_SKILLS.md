# Synthetic Frontier Production Skills v1

Status: Canonical skill architecture

These are durable production-intelligence modules. They must not be coupled to one provider or model generation.

## 1. Showrunner / Story Architect

### Input
- research/fact ledger
- episode premise
- target audience
- prior/next episode context
- desired duration

### Output
- central mystery
- thesis
- narrative arc
- act structure
- escalation map
- reveal schedule
- opening/closing relationship
- audience knowledge-state progression
- story risks
- required evidence beats

### Core checks
- curiosity before explanation
- no conclusion before tension
- no redundant acts
- ending recontextualizes opening when possible
- neutral editorial doctrine preserved

## 2. Documentary Director

### Input
- approved story architecture
- Ears/Eyes/Evidence script
- evidence constraints
- production bible

### Output
- scene intent
- emotional objective
- visual concept
- source modality
- scene transition
- hero/support classification
- continuity dependencies

### Rule
Think in scenes, not prompts.

## 3. Cinematography Director

### Input
- scene concept
- shot purpose
- continuity package
- physical constraints

### Output
- shot class
- camera position
- lens character
- framing
- movement
- subject/environment motion
- parallax design
- lighting evolution
- focus behavior
- shot endpoint
- duration
- negative constraints

### Rule
Reject “beautiful still + slow push” as the default solution.

## 4. Production Design & Continuity

### Input
- recurring subject/environment
- approved reference frames
- real-world engineering constraints

### Output
- canonical design package
- geometry
- materials
- scale
- signature features
- lighting states
- angle references
- mutation blacklist
- asset IDs / lineage

### Rule
Recurring environments are production assets, not new prompts.

## 5. Editorial Director

### Input
- narration
- scene intents
- planned visuals
- existing assets

### Output
- paper edit
- exact timeline
- storyboard order
- animatic instructions
- shot duration
- cut points
- reveal timing
- visual-register balance
- pacing notes

### Rule
Edit on paper before premium generation.

## 6. Evidence-to-Visual / Motion Graphics Director

### Input
- sourced claim
- source material
- audience knowledge state
- brand system

### Output
- evidence treatment
- source excerpt/visual
- transformation path
- diagram/map/chart spec
- source attribution
- motion behavior
- transition into next scene

### Rule
Evidence should transform into understanding.

## 7. Sound Director

### Input
- locked narration
- act structure
- rough cut
- emotional map

### Output
- narration performance direction
- score map
- ambience map
- SFX cues
- silence cues
- transition cues
- mix targets

### Rule
Never use one undifferentiated music bed for an entire episode.

## 8. Creative Model Router

### Input
- shot specification
- required capabilities
- shot tier
- benchmark matrix
- provider offers
- continuity requirements
- approved budget

### Output
- eligible models
- selected canonical model
- selected provider offer
- quality rationale
- premium justification if needed
- expected spend
- retry policy
- fallback reasons

### Selection order
1. required quality
2. capability match
3. benchmark acceptance evidence
4. continuity/reliability
5. expected cost per accepted second
6. effective price
7. latency

### Rule
Newest model is not a reason.

## 9. Documentary QC / Post Supervisor

### Input
- generated/source asset
- shot brief
- sequence context
- QC rubric
- fact/provenance data

### Output
- accept / reject / repair
- score dimensions
- failure reason codes
- repair instructions
- post requirements
- rights/fact flags

### Authority
May reject any paid output.

## 10. Skill execution order

```
Showrunner
→ Research/Standards
→ Documentary Director
→ Editorial Director (paper edit)
→ Cinematography + Production Design
→ Storyboard/Animatic
→ Evidence-to-Visual
→ Creative Model Router
→ Generation/Acquisition
→ Documentary QC
→ Editorial assembly
→ Sound Director
→ Post Supervisor final QC
```

Some passes iterate, but premium generation should not begin until upstream creative intent is stable.

## 11. Skill data contract

Each skill should return structured, machine-readable fields in addition to prose.

Minimum shared identifiers:
- brand_id
- episode_id
- script_version
- scene_id
- shot_id
- production_run_id
- continuity_package_id where applicable
- source_ref IDs
- provenance class
- shot tier
- approval state

The goal is to make creative reasoning durable and auditable rather than trapped in prompt text.

## 12. Future implementation

Recommended implementation sequence:
1. encode structured shot brief schema
2. encode QC result/failure taxonomy schema
3. encode premium-spend justification fields
4. add benchmark-run tables/results
5. add continuity-package storage
6. build previsualization/animatic workflow
7. wire skills into Episode Production workflow gates
8. add dashboard metrics for accepted-shot economics
