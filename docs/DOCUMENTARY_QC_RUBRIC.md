# Synthetic Frontier Documentary QC Rubric v1

Status: Canonical acceptance standard

## 1. Pass principle

A shot or sequence passes only if it serves the story **and** clears the production-quality threshold.

> **If the viewer notices the generation technique before the story, the shot fails.**

Sunk cost never lowers the quality bar.

## 2. QC stages

### A. Shot QC
Performed before a generated/source shot enters the edit.

### B. Sequence QC
Performed after shots are assembled with narration/graphics.

### C. Rough-cut QC
Tests story, rhythm, repetition, clarity, and visual variation.

### D. Picture-lock QC
Tests continuity, compositing, graphics, and factual representation.

### E. Final-master QC
Tests sound, color, captions, encoding, rights, provenance, and delivery.

## 3. Shot scoring dimensions

Rate 1–5:
- narrative usefulness
- visual realism
- temporal stability
- geometry stability
- camera naturalism
- physics
- lighting realism
- material realism
- prompt/brief adherence
- continuity
- visual progression
- editorial distinctiveness
- brand fit

Any critical failure below overrides average score.

## 4. Critical rejection conditions

Immediate reject if material and not repairable:
- impossible or mutating geometry
- subject identity mutation
- architecture changes during shot
- nonsensical electrical/mechanical hardware
- warped Earth/horizon/orbital behavior
- fake text or logos presented as real
- physically impossible camera motion
- obvious generative melting
- severe temporal flicker
- unexplained object appearance/disappearance
- evidence shown in a misleading way
- speculative imagery made to look like documentary evidence
- rights state UNKNOWN for intended final use

## 5. Failure taxonomy

Use one or more reason codes for every rejected generated shot.

### Cinematography
- CAMERA_UNNATURAL
- CAMERA_WITHOUT_DESTINATION
- LOW_PARALLAX
- SHOT_TOO_STATIC
- SHOT_OVERLONG
- FOCUS_BEHAVIOR_UNREALISTIC
- LIGHTING_UNMOTIVATED
- LOW_VISUAL_INFORMATION

### Temporal / geometry
- GEOMETRY_INSTABILITY
- SUBJECT_MUTATION
- ARCHITECTURE_MUTATION
- OBJECT_APPEAR_DISAPPEAR
- TEMPORAL_FLICKER
- TEXTURE_SWIMMING
- REFLECTION_INCONSISTENT

### Physics
- PHYSICS_FAILURE
- ORBITAL_BEHAVIOR_IMPLAUSIBLE
- MECHANICAL_BEHAVIOR_IMPLAUSIBLE
- SCALE_WRONG
- SHADOW_DIRECTION_FAILURE

### Editorial
- BORING_SHOT
- EDITORIAL_REDUNDANCY
- NO_STORY_FUNCTION
- WRONG_EMOTIONAL_TONE
- REPETITIVE_VISUAL_REGISTER
- GENERIC_AI_AESTHETIC
- TOO_STYLIZED_FOR_EVIDENCE

### Prompt / model
- PROMPT_MISINTERPRETATION
- REFERENCE_NOT_PRESERVED
- FIRST_LAST_FRAME_FAILURE
- CAPABILITY_MISMATCH
- PROVIDER_EXECUTION_FAILURE

### Evidence / rights
- EVIDENCE_MISREPRESENTED
- PROVENANCE_MISSING
- RIGHTS_UNKNOWN
- SOURCE_OUTDATED
- CLAIM_SCOPE_MISMATCH

## 6. “Photographed” test

For generated cinematic footage, ask:

- Does the camera occupy a believable physical position?
- Does camera movement have mass/inertia?
- Do foreground, midground, and background move with correct parallax?
- Does light behave consistently?
- Do reflections respond correctly?
- Does the environment continue to exist coherently off-screen?
- Does the shot evolve internally?
- Could a viewer plausibly believe a camera captured this?

If several answers are no, reject or redesign.

## 7. Sequence-level tests

A sequence should demonstrate:
- clear visual hierarchy
- changing scale
- source-type variation
- no repeated camera gimmick
- no “slideshow” rhythm
- graphics that explain
- evidence that advances the story
- score/sound movement
- purposeful silence
- clean handoff into next idea

Reject sequences that feel assembled from independent assets rather than directed.

## 8. Sound QC

Check:
- narration intelligibility
- natural pacing
- no synthetic pronunciation artifacts
- score supports act progression
- ambience matches environment
- SFX are physically motivated
- transitions are not over-designed
- silence exists where useful
- no clipping
- controlled loudness/true peak
- no constant wall of sound

## 9. Graphics QC

Check:
- brand typography/palette
- no faux-HUD language
- readable at normal playback
- enough dwell time
- chart axes/units/dates correct
- source scope visible where needed
- motion has explanatory purpose
- no unnecessary text duplication of narration

## 10. Fact QC

For every factual visual/narration beat:
- claim matches source
- date matches claim
- unit matches source
- population/geography/scope match
- forecast vs observed fact distinguished
- company claim attributed
- plan/proposal vs deployed system distinguished
- evidence class correct

## 11. Rights QC

Every external asset must resolve to:
- OWNED
- LICENSED
- PUBLIC_DOMAIN
- FAIR_USE_EDITORIAL

Final master blocks:
- UNKNOWN
- PERMISSION_REQUIRED

## 12. Technical QC

Master targets:
- 3840×2160
- 23.976/24 fps
- 16:9
- clean audio
- no dropped/corrupt frames
- no accidental watermarks
- no model/provider artifacts
- captions synchronized
- title-safe graphics
- platform-safe encode

## 13. Sequence gate question

Before approval:

> **Would we be comfortable placing this sequence beside premium science-documentary work without explaining that it was made with AI?**

If not, it has not cleared the gate.
