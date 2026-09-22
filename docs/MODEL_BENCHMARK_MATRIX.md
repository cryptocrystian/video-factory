# Video Factory Model Benchmark Matrix v1

Status: **Preliminary framework — benchmark evidence required before hard routing changes**

## 1. Principle

Do not route by model reputation or novelty.

Route by:

1. shot capability requirement
2. minimum quality threshold
3. measured acceptance performance for that shot class
4. continuity / reliability
5. expected cleanup burden
6. cost per accepted production second
7. latency

Raw price per generated second is not the optimization target.

## 2. Core metric

```
cost_per_accepted_second =
(total generation spend + attributable retry spend)
/ accepted final-screen seconds
```

Supporting metrics:
- first-pass acceptance rate
- eventual acceptance rate
- average attempts per accepted shot
- continuity failure rate
- geometry failure rate
- camera-motion failure rate
- cleanup minutes per accepted second
- median latency
- provider error rate

## 3. Benchmark shot suite

Use fixed, versioned briefs so results remain comparable.

### B01 — Orbital infrastructure hero
Tests:
- complex engineering geometry
- Earth/background stability
- multi-plane parallax
- slow physical camera
- lighting evolution

### B02 — Industrial interior
Tests:
- realistic architecture
- deep perspective
- practical lighting
- stable machinery
- camera inertia

### B03 — Macro electronics
Tests:
- material detail
- shallow focus
- tiny physical motion
- reflection consistency

### B04 — Complex camera move
Tests:
- deliberate start/end
- acceleration/inertia
- no morphing under motion

### B05 — Recurring-subject continuity
Tests:
- canonical environment/vehicle/platform preservation across angles

### B06 — Human/environment documentary realism
Tests:
- natural movement
- wardrobe/object continuity
- non-synthetic camera behavior

### B07 — Semantic transformation
Tests:
- controlled visual transition
- first/last frame behavior
- concept continuity

### B08 — Long controlled take
Tests:
- 8–15 sec temporal stability
- internal motion
- no drift/mutation

## 4. Scoring dimensions

Each output is reviewed 1–5 on:
- photorealism
- temporal stability
- geometry stability
- camera naturalism
- physics
- prompt adherence
- continuity
- lighting realism
- detail integrity
- editorial usefulness

Binary:
- accepted / rejected

Rejection reasons come from the QC failure taxonomy.

## 5. Preliminary model matrix

These are capability hypotheses from the current registry/provider metadata, not final benchmark rankings.

| Model | Current role | Registry quality tier | Known strengths | Current concern / unknown |
|---|---|---:|---|---|
| GPT Image 2.5 Sunburst | static hero / keyframe | 5 | instruction fidelity, typography, editing, hero frames | motion not applicable |
| FLUX 2 Max | image fallback | 4 | photorealism, references | pricing/empirical acceptance not yet benchmarked |
| MiniMax H3 Max Turbo | standard motion / volume | 4 | low cost, text/image-to-video, first/last frame support | sample showed polished motion but can still read as animated keyframe; needs benchmark against premium models |
| MiniMax H3 Max | motion quality fallback | 4 | image-to-video, higher-cost H3 path | empirical advantage over Turbo not yet established |
| Kling 3 | precise / complex motion | 5 | multi-shot, first/last frame, references, complex motion | needs controlled benchmark for documentary camera naturalism and geometry |
| Seedance 2.5 | heavy multimodal / long take | 5 | multimodal references, long take, complex hero scenes | substantially higher known fal price; must prove acceptance benefit |
| Veo 3.1 | premium exception | 5 | premium generation, text/image-to-video, optional native audio | premium use must be justified by measured result, not brand/model prestige |
| ElevenLabs Multilingual v2 | narration | 5 | voice consistency, multilingual TTS | provider voice-catalog compatibility must be validated per aggregator |

## 6. Current verified provider price observations

Values below reflect the current Video Factory provider registry as of the last verified sync and can become stale.

### fal examples
- GPT Image 2.5 Sunburst 2560x1440: $0.05529/image
- H3 Max Turbo 768p: $0.04/sec
- H3 Max Turbo 1080p: $0.08/sec
- H3 Max 1080p: $0.16/sec
- Kling 3 Pro image-to-video, no audio: $0.112/sec
- Seedance 2.5 720p with audio: $0.473/sec
- Veo 3.1 Fast 1080p no audio: $0.10/sec
- Veo 3.1 standard 1080p no audio: $0.20/sec

Price alone must not determine model choice.

## 7. Evidence status

### Tested in Video Factory
- GPT Image 2.5 Sunburst keyframes via fal: successful.
- H3 Max Turbo live smoke: successful.
- H3 Max Turbo Episode 1 sample motion: successful technically; creative result exposed the “animated still” failure mode for premium-documentary hero work.

### Not yet sufficiently benchmarked
- H3 Max vs Turbo
- Kling 3
- Seedance 2.5
- Veo 3.1
- provider-to-provider equivalence for same canonical model
- true cost per accepted second by shot class

## 8. Benchmark execution policy

For each benchmark:
- same creative brief
- same duration where supported
- same source/reference package where supported
- same aspect ratio
- audio disabled unless audio itself is under test
- maximum one paid attempt per model in first benchmark pass
- record exact provider, offer, price, latency, result, rejection reason
- no hidden rerolls

Second-pass retries occur only if the first result indicates an execution failure rather than a model-quality failure.

## 9. Routing evolution

Do not replace routing rules solely from one impressive output.

A routing change requires:
- benchmark evidence
- at least one production-context result
- documented tradeoff
- provider/pricing verification
- rollback path

Target future route selection:

```
shot brief
→ capability requirements
→ eligible benchmarked models
→ expected acceptance probability
→ expected cleanup burden
→ expected cost per accepted second
→ provider reliability
→ effective price
→ latency
```

## 10. Model freshness

New models enter as **UNBENCHMARKED**.

They may be tested, but should not automatically displace a proven route.

Latest does not mean best for the shot.
