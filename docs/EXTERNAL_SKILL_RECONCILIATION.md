# External Production Skill Reconciliation

Status: **Canonical integration decision**
Date: 2026-09-23

## Purpose

Video Factory now includes several external production skill sources. This document records what is adopted, what is rejected, and how those sources fit the Synthetic Frontier production system.

External skills are specialist references. They do **not** replace Video Factory's canonical production doctrine, orchestration, spend controls, provider adapters, provenance, or QC.

## Sources reviewed

- `smixs/visual-skills` @ `92be33a5a73325fb3d8e0c73b22744b114e2a90e`
  - `video/SKILL.md`
  - dramaturgy, universal rules, camera/lighting, animatic, Kling, Seedance, Veo references
  - License: CC BY 4.0; attribution to Serge Shima / smixs retained
- `smixs/creative-director-skill` @ `ac06eb255371da35d1db0a146dbfcca8c8857543`
- `artokun/comfyui-mcp` Director skill @ `1d5b12b1b499a7358ac614ffb41b736a0817f855`
- `remotion-dev/skills` @ `9682e994989f951c75912fbc49aa10332a512685`
- `dandacompany/dantelabs-agentic-school` Kie video generator @ `9e86720814ebe6ff3aa321db26a94d8d2a7958bb`

## Core integration decision

The canonical production stack remains:

1. Showrunner / Story Architect
2. Research / Standards
3. Documentary Director
4. Editorial Director
5. Cinematography Director
6. Production Design & Continuity
7. Evidence-to-Visual / Motion Graphics
8. Sound Director
9. Creative Model Router
10. Prompt Compiler / Model Adapter
11. Documentary QC / Post Supervisor
12. Deterministic Render Layer

The major change is the explicit addition of **Prompt Compiler / Model Adapter** and **Deterministic Render Layer**. This prevents model syntax from contaminating creative direction and prevents generative models from being used for tasks better handled deterministically.

---

## 1. smixs visual/video skill

### Adopt

#### Dramaturgy before prompting
The external skill correctly separates filmmaking from prompt syntax. Video Factory adopts this hierarchy:

```
story function
→ scene function
→ shot function
→ cinematography
→ model selection
→ model-specific prompt compilation
```

Prompt engineering is downstream of direction.

#### Three-jobs rule
Every shot must do at least one:
- change viewer emotion / curiosity state
- advance action, information, or spatial understanding
- increase tension, scale, pressure, or consequence

For documentary work, “action” includes revealing evidence or explaining mechanism.

#### Physical-detail triad
Every directed shot should identify three concrete layers where applicable:
- environmental pressure / physical environment
- physical micro-action or state change
- sound anchor or visual motif

For non-human science/engineering subjects, “micro-action” means a physical change such as a relay actuating, reflection shifting, coolant moving, a panel articulating, heat shimmer changing, or sunlight crossing material.

#### Motivated camera
Camera movement must answer “what changed?” If nothing changed, static may be the better choice.

#### One primary camera move
Short AI-generated shots should normally have one dominant camera movement, with only subtle secondary behavior.

#### Final-frame rule
Every generated shot requires an explicit visual destination / final-frame intent.

#### Reference-role discipline
Every reference asset gets:
- an explicit role
- what it controls
- what must be ignored

More references are not automatically more control.

#### Priority declaration
For overloaded shots, specify:
- what must survive
- what is mandatory
- what may vary
- required ending state

#### Animatic keyframe discipline
Storyboard/animatic panels must have a story function, not merely be attractive compositions.

### Adapt

The smixs scene formula is character-drama oriented. Synthetic Frontier adapts it to documentary:

```
Scene =
viewer question / knowledge desire
+ obstacle / uncertainty
+ spatial or conceptual geometry
+ controlled gaze
+ editorial rhythm
```

Human blocking rules become **attention blocking** for infrastructure, documents, graphics, mechanisms, and environments.

### Do not adopt literally

- generic model routing recommendations as truth
- commercial/ad pacing assumptions
- mandatory human micro-expression logic for non-human documentary scenes
- stylistic director-name imitation as a default production method

Model-specific recommendations are treated as priors until Video Factory benchmarks them.

---

## 2. Creative Director skill

### Adopt

Use as an upstream **ideation and premise stress-test module**, not as the Documentary Showrunner.

Useful methods:
- insight-first problem framing
- deliberate ideation methods rather than free association
- one-sentence concept test
- “remove the obvious” discipline
- restart when an idea plateaus rather than endlessly polishing a weak premise
- critique instead of automatic praise

### Synthetic Frontier usage

Allowed for:
- episode premise exploration
- cold-open alternatives
- title territory
- visual motif exploration
- finding non-obvious framing
- stress-testing whether an idea is actually distinct

Not authoritative for:
- factual interpretation
- source weighting
- neutrality
- final documentary narrative
- scientific claims
- production approval

Research/Standards and Showrunner always outrank it.

---

## 3. Director / Hero Frame pipeline

### Adopt

#### Canonical anchor strategy
For recurring generated subjects, create one approved canonical design anchor plus supporting references rather than independently reinventing the subject per shot.

#### Derived-frame strategy
When continuity matters, derive new views from approved anchors where the selected model supports it.

#### Shallow lineage
Avoid long reference/edit chains that accumulate drift. Branch back to a trusted canonical anchor after a small number of derivations.

#### Exact boundary chaining when useful
For sequences requiring seamless visual continuity, the approved terminal frame of shot N may become the starting reference for shot N+1.

This is optional, not universal. Editorial cuts often benefit from a new angle rather than literal frame continuity.

#### Stage verification
Every expensive stage is a gate:
- inspect
- accept/reject
- persist output
- only then advance

#### Resume without rerender
Completed/approved assets must be reusable after workflow interruption.

### Reject as implementation dependency

Do not adopt the source pipeline's fixed:
- Z-Image
- Qwen Edit
- WAN 2.2
- ComfyUI topology

Video Factory keeps provider/model independence.

---

## 4. Remotion

### Adopt as a core deterministic render layer

Remotion becomes preferred for:
- lower thirds
- source citations
- document transforms
- maps
- timelines
- charts
- number reveals
- power-flow diagrams
- orbital diagrams
- chapter cards
- captions
- repeatable transitions
- branded typography
- parameterized visual systems

### Rule

If a visual can be represented deterministically with data, geometry, typography, maps, or compositing, prefer Remotion over generative video.

Generation should create photography-like imagery. Remotion should create exact graphics.

### Output contract

Evidence-to-Visual emits a structured graphic spec. Remotion renders it.

---

## 5. Kie Video Generator skill

### Adopt

Use as:
- an additional capability/reference source
- provider API behavior reference
- model availability hypothesis source
- cross-check for image-to-video / first-last-frame support

### Do not adopt as runtime control plane

Its CLI/polling/cost logic duplicates Video Factory's:
- generation jobs
- provider adapters
- polling
- cost ledger
- asset archive
- routing
- retry safety

All Kie production calls continue through Video Factory.

### Freshness rule

The pinned skill includes model/pricing information that can become stale. Never use its price/model table as current truth without live provider verification.

---

## 6. Prompt Compiler / Model Adapter — NEW canonical skill

This is the largest architectural addition from the reconciliation.

### Why it exists

The Director should not write a Kling prompt.
The Cinematographer should not write a Seedance prompt.
The Router should not change the creative brief to suit a provider.

They produce a **canonical director brief**.

After the Router selects an eligible model, the Prompt Compiler translates that brief into the model's preferred syntax and supported parameters.

### Input

- canonical shot brief
- continuity package
- reference-role manifest
- selected canonical model
- selected provider offer
- target duration / resolution
- model capability profile
- benchmark rules if applicable

### Output

- immutable canonical director brief ID/version
- exact provider prompt
- negative prompt if supported
- reference bindings and roles
- provider parameters
- declared priorities
- expected ending state
- compiler version
- model-adapter version

### Non-negotiable

The compiler may translate syntax and remove unsupported instructions.

It may **not** silently change:
- narrative purpose
- shot function
- composition objective
- evidence meaning
- continuity identity
- provenance class

Any creative change returns upstream for approval.

---

## 7. Benchmark protocol implications

External skills reinforce that model-specific syntax matters. Therefore “same prompt” is replaced by:

> **same canonical director brief, model-native compilation**

Benchmarks must preserve creative intent while allowing syntax/parameter adaptation.

Creative-interpretation benchmarks must not use a shared start image.

Continuity benchmarks intentionally do.

These are separate scientific questions and must never be conflated again.

---

## 8. Canonical conflict-resolution order

When sources disagree:

1. Synthetic Frontier Production Bible
2. factual/provenance/rights constraints
3. approved story and edit
4. canonical shot brief
5. continuity package
6. benchmark evidence from Video Factory
7. model/provider live capability
8. external skill recommendation
9. aesthetic convention

External skill advice never overrides tested production evidence.

---

## 9. What changes before the next paid benchmark

Before another benchmark:
- canonical director brief must be finalized
- benchmark question must be explicit
- benchmark type must be CREATIVE, CONTINUITY, or SEQUENCE
- Prompt Compiler adapters must be documented for each participating model
- provider capability and price must be refreshed
- one-attempt rule must be set
- automatic reject conditions must be fixed
- blind review labels must be assigned before outputs are viewed
- native outputs and normalized review outputs must both be retained

No paid benchmark should begin until this preflight passes.
