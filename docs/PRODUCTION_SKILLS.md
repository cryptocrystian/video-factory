# Synthetic Frontier Production Skills v2

Status: **Canonical skill architecture**
Supersedes: v1

External skill sources are specialist references. Video Factory remains the production control plane.

## 1. Showrunner / Story Architect

### Owns
- central mystery
- thesis
- narrative arc
- act structure
- escalation
- reveal schedule
- audience knowledge-state progression
- opening/closing relationship
- story risks
- required evidence beats

### Adopted ideation support
The Showrunner may invoke Creative Director methods for premise exploration, non-obvious framing, title territory, and cold-open alternatives.

Creative ideation never outranks factual/editorial standards.

### Core checks
- curiosity before explanation
- no conclusion before tension
- no redundant acts
- causal or conceptual spine is explicit
- ending recontextualizes opening when possible
- neutral editorial doctrine preserved
- core concept can be stated in one sentence

## 2. Research / Standards Editor

### Owns
- fact ledger
- source hierarchy
- dates and units
- company claim vs observed fact
- deployed vs announced vs prototype vs forecast vs speculation
- provenance class
- factual boundaries for visuals

This role can block a creative idea that exceeds source support.

## 3. Documentary Director

### Input
- approved story architecture
- Ears / Eyes / Evidence script
- fact boundaries
- production bible

### Output
- scene intent
- viewer question / knowledge desire
- uncertainty or obstacle
- conceptual/spatial geometry
- controlled gaze
- emotional objective
- source modality
- scene transition
- hero/support classification
- continuity dependencies

### Documentary scene formula

```
viewer question / knowledge desire
+ obstacle / uncertainty
+ spatial or conceptual geometry
+ controlled gaze
+ editorial rhythm
```

### Three-jobs rule
Every shot must do at least one:
- change emotion / curiosity
- advance action, information, or understanding
- increase pressure, scale, tension, or consequence

### Rule
Think in scenes and viewer state, not prompts.

## 4. Editorial Director

### Input
- narration
- scene intents
- evidence beats
- existing assets

### Output
- paper edit
- exact timeline
- storyboard order
- animatic instructions
- shot duration
- cut points
- eye-trace notes
- reveal timing
- visual-register balance
- pacing notes

### Editorial priorities
In order:
1. emotion / curiosity state
2. story / understanding
3. rhythm
4. eye trace
5. 2D screen continuity
6. 3D spatial continuity

### Rule
Edit on paper before premium generation.

## 5. Cinematography Director

### Input
- scene concept
- shot job
- continuity package
- physical constraints

### Output
- shot class
- camera position
- lens character
- framing
- **one primary camera move**
- optional secondary micro-adjustment
- subject movement
- environmental movement
- parallax design
- lighting evolution
- focus behavior
- physical-detail triad
- shot endpoint / final-frame intent
- duration
- negative constraints

### Physical-detail triad
Where applicable, define:
- environmental pressure / material condition
- physical micro-action or mechanism state change
- sound anchor or recurring visual motif

### Rule
Camera movement must be motivated by a change in information, pressure, action, gaze, or space.

Reject “beautiful still + slow push” as a default solution.

## 6. Production Design & Continuity

### Owns
- canonical anchor design
- geometry
- materials
- scale
- signature features
- lighting states
- angle references
- mutation blacklist
- asset IDs / lineage
- reference-role manifest
- derived-frame lineage

### Continuity strategy
- establish trusted canonical anchor(s)
- derive from approved references when continuity matters
- keep derived chains shallow
- branch back to canonical anchors before drift accumulates
- use exact terminal→start chaining only when editorially justified

### Rule
Recurring environments and objects are production assets, not new prompts.

## 7. Evidence-to-Visual / Motion Graphics Director

### Input
- sourced claim
- authentic source material
- audience knowledge state
- brand system

### Output
- evidence treatment
- source excerpt
- transformation path
- diagram/map/chart spec
- source attribution
- motion behavior
- transition to/from photography
- **deterministic render spec**

### Rule
Evidence transforms into understanding.

If exact typography/data/geometry can solve the visual, prefer deterministic rendering over generative video.

## 8. Sound Director

### Owns
- narration performance direction
- score map
- ambience map
- SFX cues
- silence cues
- sonic transitions
- mix targets

### Rule
Sound must evolve with the episode. Never use one undifferentiated music bed.

## 9. Creative Model Router

### Input
- canonical shot brief
- required capabilities
- shot tier
- benchmark evidence
- continuity strategy
- provider offers
- approved budget

### Output
- eligible models
- selected canonical model
- selected provider offer
- capability rationale
- premium justification
- expected spend
- retry policy
- fallback reasons

### Selection order
1. required quality threshold
2. required capability
3. benchmark acceptance evidence
4. continuity/reliability
5. expected cleanup burden
6. expected cost per accepted second
7. effective provider price
8. latency

### Rule
External model recommendations are hypotheses. Video Factory benchmark evidence wins.

## 10. Prompt Compiler / Model Adapter

### Purpose
Translate canonical creative intent into model-native syntax **after** routing.

### Input
- canonical director/shot brief
- continuity package
- reference-role manifest
- selected model/provider offer
- model capability profile
- target duration/resolution

### Output
- exact submitted prompt
- exact negative prompt if supported
- exact references and declared roles
- provider parameters
- priority declaration
- final-frame requirement
- compiler version
- adapter version

### Universal compilation rules
- lead with the subject/action or model-appropriate highest-priority instruction
- use concrete physical direction, not adjective/tag spam
- one primary camera move per short shot
- no contradictory instructions
- declare reference roles explicitly
- state what a reference should **not** control where needed
- give the shot a visible ending state
- if the brief is overloaded, declare what must survive and what may vary
- respect model duration limits

### Non-negotiable
The compiler can translate syntax. It cannot rewrite creative intent.

## 11. Documentary QC / Post Supervisor

### Input
- source/generated asset
- canonical shot brief
- exact compiled provider request
- sequence context
- provenance/rights data
- QC rubric

### Output
- ACCEPT / REJECT / REPAIR
- dimension scores
- failure codes
- repair plan
- post requirements
- fact/rights flags

### Additional checks
- did the result satisfy the declared final-frame intent?
- did the primary camera move remain physically coherent?
- did reference roles bleed into unintended attributes?
- did the model preserve required priorities?
- does the shot perform at least one declared story job?

### Authority
May reject any paid result. Sunk cost is irrelevant.

## 12. Deterministic Render Layer

Preferred implementation: **Remotion + FFmpeg**, selected by task.

### Use Remotion for
- branded typography
- lower thirds
- evidence transformations
- citations
- timelines
- maps
- charts
- number reveals
- diagrams
- captions
- compositing
- parameterized graphics

### Use FFmpeg for
- deterministic cuts
- concat
- transcode
- audio muxing
- simple crop/scale/retime
- delivery encode

### Rule
Do not ask a generative video model to do a deterministic graphics job.

## 13. Skill execution order

```
Showrunner
→ Research / Standards
→ Documentary Director
→ Editorial Director / paper edit
→ Cinematography + Production Design
→ Storyboard / animatic
→ Evidence-to-Visual specs
→ Creative Model Router
→ Prompt Compiler / Model Adapter
→ Cost authorization
→ Generation / source acquisition
→ Documentary QC
→ Deterministic graphics + compositing
→ Editorial assembly
→ Sound
→ Color / post
→ Final factual / rights / technical QC
```

Iteration is allowed, but a failed downstream stage returns to the **nearest responsible upstream layer** instead of blindly rerolling.

## 14. Structured data contract

Every production decision should preserve:
- brand_id
- episode_id
- script_version
- scene_id
- shot_id
- production_run_id
- continuity_package_id
- source_ref IDs
- provenance class
- rights class
- shot tier
- shot job(s)
- canonical brief version
- final-frame intent
- primary camera move
- physical-detail triad
- reference-role manifest
- priority declaration
- selected model/provider
- compiler version
- exact provider request
- approval state

## 15. External skill usage policy

External skills are selectively invoked as specialist references:

- smixs visual/video → dramaturgy, shot craft, prompt compilation priors
- Creative Director → upstream ideation and critique only
- Hero Frame / Director → continuity architecture and resume/retry patterns
- Remotion → deterministic graphics/rendering
- Kie Video Generator → provider capability/reference cross-check only

No external skill:
- authorizes spend
- bypasses Video Factory jobs
- bypasses archival/provenance
- changes a canonical brief silently
- overrides benchmark evidence
