# B01 CREATIVE — Orbital Infrastructure Hero Benchmark v1

Status: **PREFLIGHT COMPLETE — PAID RUN NOT YET AUTHORIZED**
Episode: *How Far Will We Go to Power AI?*
Benchmark type: **CREATIVE**
Target shot class: FRONTIER / WONDER
Target duration: **8 seconds**
Master aspect ratio: **16:9**

## 1. Decision question

Which current video model can create the strongest **premium science-documentary moving image** from the same provider-independent directing problem when it is allowed to invent its own production design and composition?

This benchmark is specifically testing **original cinematography**, not continuity preservation.

## 2. Falsifiable hypothesis

At least two current production candidates will generate an 8-second text-to-video shot that:

- passes all automatic rejection rules;
- scores at least 4.0/5 weighted overall;
- scores at least 4/5 in photographic realism, camera physicality, and temporal/geometry stability;
- is useful enough to justify a follow-on continuity benchmark.

If fewer than two candidates clear the threshold, the hypothesis fails. We do not lower the bar.

## 3. Story function

This is the opening visual proposition for Episode 1.

### Viewer state at start
The viewer sees orbit/Earth and incomplete visual information. They do not yet understand what they are looking at.

### Viewer state at end
The viewer understands that the object is a physically plausible **industrial computing installation in orbit**, large enough to feel consequential rather than merely satellite-sized.

### Shot jobs
- create wonder / curiosity;
- reveal new information;
- establish physical scale;
- make the central premise believable enough that the viewer asks “why would anyone put compute here?”

## 4. Canonical Director Brief — provider independent

**Subject:** A physically plausible low-Earth-orbit AI compute installation above Earth at dawn. It should read as functional aerospace infrastructure rather than a fantasy spacecraft: modular compute structures, solar collection, thermal rejection/radiator surfaces, communications hardware, and restrained structural engineering. The exact design is intentionally left to the model.

**Dramaturgy:** Begin with incomplete visual information. Over the shot, reveal enough of the installation that the viewer moves from mystery to comprehension. The reveal must be caused by physical camera movement, depth/parallax, changing visibility, or motivated natural light—not by morphing or a generic digital zoom.

**Camera:** One coherent, physically believable primary camera move chosen to reveal scale. The exact move is not prescribed so the model can demonstrate visual judgment. It must have inertia, readable spatial geometry, and genuine foreground/midground/background separation.

**Environment:** Low Earth orbit, Earth as a physically stable scale reference, thin atmospheric limb, black space. No crowded star field or ornamental sci-fi environment.

**Light:** Natural dawn illumination should evolve during the shot and reveal materials progressively. Light must have a motivated source and consistent shadow/reflection behavior.

**Physical behavior:** Rigid engineering remains rigid. Earth/background motion must be independent from the camera. Small believable mechanical or attitude-control behavior is acceptable; large structures must not flap, breathe, melt, or reconfigure.

**Visual character:** Premium observational science-documentary naturalism. Restrained, tactile, credible, photographed rather than illustrated.

**Final-frame intent:** End with the installation clearly readable as a large engineered compute/power structure in orbit, with its scale and function visually legible enough to support the narration pivot.

**May vary:** exact platform architecture, exact composition, exact reveal direction, exact lens/focal length, exact camera path, relative placement in frame.

**Must survive:** aerospace plausibility, industrial-compute reading, Earth/orbital context, progressive reveal, physical camera behavior, depth/parallax, natural light evolution, final scale comprehension.

**Negative constraints:** no neon/cyberpunk; no glowing data streams; no fantasy propulsion; no crewed-space-station windows; no weapon-like beams; no giant lens flare; no fake logos/text; no warped Earth; no impossible shadows; no geometry mutation; no “still image with a slow push-in” as the entire shot.

## 5. Candidate set

Quality-first candidate funnel:

1. **MiniMax H3 Max** — fal text-to-video, 1080p
2. **Kling 3.0 Pro** — fal text-to-video
3. **Seedance 2.5** — fal US text-to-video, 1080p
4. **Veo 3.1 Standard** — fal text-to-video, 1080p
5. **Higgsfield Cinema Studio 3.0** — external quality reference, 1080p

Excluded:
- H3 Max Turbo: known low-cost control already exposed the animated-keyframe failure mode in the prior production proof; not necessary for this quality-first creative test.
- Veo Fast: not appropriate when the purpose is to establish the ceiling of production quality.
- Kling Standard: Pro is the quality-first candidate.
- Kie duplicate routes: provider comparison is not the question in this benchmark.

## 6. Model-native compilation

The **canonical brief above is fixed**. Exact submitted strings may differ to match model syntax without changing creative intent.

### A. H3 Max adapter

Parameters:
- endpoint: `minimax/h3-max/text-to-video`
- duration: 8
- resolution: 1080P
- aspect_ratio: 16:9
- prompt_expansion_mode: balanced
- no reference image

Compiled prompt:

> A physically plausible low-Earth-orbit AI compute installation hangs above Earth's dawn limb. Functional aerospace infrastructure: modular compute structures, broad solar collection surfaces, dedicated thermal radiators, restrained truss engineering and communications hardware; no fantasy spacecraft styling. Begin with the installation only partly understood. Use one physically believable camera move with real inertia and multi-plane parallax to progressively reveal its scale. Earth remains stable and moves independently in the background. Natural sunrise light gradually exposes dark aerospace materials and radiator detail with consistent shadows and reflections. The structure stays rigid and geometrically stable. Premium observational science-documentary naturalism, tactile and photographed rather than illustrated. End with the installation clearly readable as a large industrial computing structure in orbit.

### B. Kling 3.0 Pro adapter

Parameters:
- endpoint: `fal-ai/kling-video/v3/pro/text-to-video`
- duration: 8
- aspect_ratio: 16:9
- generate_audio: false
- shot_type: customize
- cfg_scale: provider default unless preflight says otherwise
- no multi_prompt; this is one continuous shot

Compiled prompt:

> Single continuous documentary shot. A physically plausible industrial AI compute installation in low Earth orbit at dawn: modular compute sections, solar collection, thermal radiators, restrained aerospace truss and communications hardware. Start with incomplete visual information and reveal the installation progressively through one motivated physical camera move with inertia and strong foreground/midground/background parallax. Earth is a stable scale reference and drifts independently. Sunrise naturally reveals material detail across the structure; lighting, shadows and reflections remain physically consistent. Rigid engineering stays rigid. The exact platform design and camera direction may be interpreted freely. Finish on a clear, comprehensible view that communicates the installation's industrial scale. Premium observational science-documentary realism, not science-fiction spectacle.

Negative prompt:
> neon cyberpunk, glowing data streams, fantasy engines, spacecraft windows, weapon beams, giant lens flare, fake text, logos, warped Earth, geometry morphing, melting structures, impossible shadows, game render, static still with digital zoom

### C. Seedance 2.5 adapter

Parameters:
- endpoint: `bytedance/seedance-2.5/us/text-to-video`
- duration: 8
- resolution: 1080p
- aspect_ratio: 16:9
- generate_audio: false
- bitrate_mode: high
- codec: H264

Compiled prompt:

> 8-second single continuous shot, premium live-action science-documentary naturalism. A functional AI compute installation in low Earth orbit above Earth's dawn limb, built from modular compute structures, solar collection surfaces, thermal radiators, restrained truss engineering and communications hardware. [00:00–00:03] The scene begins with incomplete visual information; the viewer sees orbit and only part of the installation. One physically believable camera movement establishes real depth and parallax. [00:03–00:06] The installation resolves progressively as Earth drifts independently and sunrise light crosses the structure, revealing material and thermal surfaces with consistent shadows and reflections. [00:06–00:08] End on a stable, readable composition that makes the industrial scale and computing function clear. Rigid structures remain rigid and geometrically unchanged. No stylized science-fiction spectacle.

Global constraints:
> no neon, no glowing data streams, no fantasy propulsion, no crew windows, no giant lens flare, no fake text/logos, no warped Earth, no geometry mutation, no melting, no impossible shadows, no slideshow/Ken-Burns feel

### D. Veo 3.1 Standard adapter

Parameters:
- endpoint: `fal-ai/veo3.1`
- duration: 8s
- resolution: 1080p
- aspect_ratio: 16:9
- generate_audio: false

Compiled prompt:

> Wide observational science-documentary shot of a physically plausible industrial AI compute installation in low Earth orbit above Earth's dawn limb. Functional modular compute structures, solar collection, dedicated thermal radiators, restrained aerospace truss and communications hardware. Begin with incomplete visual information, then use one motivated physical camera movement with natural inertia and multi-plane parallax to reveal the installation's scale. Earth remains stable as an independent background reference. Sunrise gradually reveals dark aerospace materials with consistent shadows and reflections. The structure remains rigid and geometrically stable. Avoid science-fiction spectacle. End on a clear view that communicates a large engineered computing installation in orbit, photographed with restrained premium documentary naturalism.

Negative prompt:
> neon cyberpunk, glowing data streams, fantasy engines, crewed spacecraft windows, weapon beams, giant lens flare, logos, text, warped Earth, morphing geometry, melting structures, impossible shadows, video-game CGI, static image zoom

### E. Higgsfield Cinema Studio 3.0 adapter

Parameters:
- model: cinematic_studio_3_0
- duration: 8
- resolution: 1080p
- aspect_ratio: 16:9
- generate_audio: false
- genre: auto
- no start image

Compiled prompt:

> A physically plausible low-Earth-orbit AI compute installation above Earth's dawn limb, filmed as restrained premium science-documentary cinematography. Functional modular compute structures, broad solar collection, dedicated thermal radiator surfaces, restrained aerospace truss and communications hardware. Begin with incomplete visual information and progressively reveal the installation through one physically believable camera movement with genuine depth, parallax and inertia. Earth moves independently as the scale reference. Natural sunrise light gradually exposes material detail with consistent shadows and reflections. Rigid structures stay rigid; no morphing. The exact platform architecture and reveal direction are free. End with a clear, comprehensible view that communicates the installation's industrial scale. No neon, fantasy propulsion, glowing data effects, logos, text, giant lens flare, warped Earth or game-like CGI.

## 7. Review protocol

### Native review
Review every untouched native output individually.

### Blind normalized review
Create one standardized 1080p / 24fps reel with randomized labels only:
- Clip A
- Clip B
- Clip C
- Clip D
- Clip E

No model name, provider, price, music, SFX, color grade, stabilization, sharpening, or cleanup.

Model identity is revealed only after initial human scores are recorded.

## 8. Scoring

1–5 per dimension.

| Dimension | Weight |
|---|---:|
| Photographic / documentary realism | 25% |
| Camera physicality & cinematography | 20% |
| Temporal + geometry stability | 20% |
| Production design / visual taste | 15% |
| Story usefulness / editability | 10% |
| Canonical brief adherence | 10% |

### Required minimum to advance
- weighted score >= 4.0
- documentary realism >= 4
- camera physicality >= 4
- temporal/geometry stability >= 4
- no automatic reject

## 9. Automatic reject

Reject regardless of weighted score for any material unrepairable instance of:
- geometry/architecture mutation
- obvious synthetic melting
- warped Earth/horizon
- impossible orbital/physical behavior
- camera motion with no believable mass/inertia
- insufficient parallax that reads as a moving still
- nonsensical engineering dominating the shot
- fantasy/cyberpunk visual language
- fake text/logo artifacts
- no progressive reveal / no final visual destination
- obvious “still image being pushed around” when true moving cinematography is required

## 10. Attempt policy

- exactly one paid first-pass attempt per candidate
- no hidden rerolls
- no seed shopping
- provider execution failure may be retried only if no valid result/charge was produced and the failure is infrastructure, not model quality
- model-quality failure is recorded as a benchmark result

## 11. Decision rule

- The top **two** candidates that clear all thresholds advance to **B01 CONTINUITY**.
- A third candidate advances only if it is within 0.10 weighted points of second place **and** demonstrates a materially different useful strength; this requires separate approval.
- If only one candidate passes, do not lower the bar to create a two-model shortlist.
- If none pass, redesign the shot/candidate set rather than rerolling blindly.
- No full production route is locked from CREATIVE alone. Final hero routing requires CONTINUITY + SEQUENCE evidence.

## 12. Current cost preflight — 8 seconds

Verified 2026-09-28; refresh again immediately before submission.

- H3 Max 1080p: **$0.64** at current launch-promo rate ($0.08/s); fal says promo ends Sep 30, then $0.16/s.
- Kling 3 Pro, audio off: **$0.896** ($0.112/s).
- Seedance 2.5 1080p: **~$9.312** (~$1.164/s; token billing authoritative).
- Veo 3.1 Standard 1080p, audio off: **$1.60** ($0.20/s).
- fal subtotal estimate: **~$12.448**.
- Proposed hard fal cap: **$13.00**.
- Higgsfield Cinema Studio 3.0: **80 credits**.
- No retries included.

This benchmark's cost is intentionally front-loaded to establish the quality ceiling and avoid season-scale waste.

## 13. Spend state

**NOT AUTHORIZED BY THIS DOCUMENT.**

Creating this benchmark specification, registry entries and adapter mappings does not authorize generation.
