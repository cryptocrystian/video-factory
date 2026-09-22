# Synthetic Frontier Shot Taxonomy & Cinematography Guide v1

Status: Canonical visual-direction guide

## 1. Purpose

This guide converts story intent into directed moving-image language. “Cinematic” is not a valid direction by itself.

Every shot must specify a purpose, physical camera logic, internal evolution, and endpoint.

## 2. Required shot specification

Every premium generated shot should define:

- story purpose
- shot class
- subject
- environment
- camera position
- lens character
- framing
- camera movement
- subject movement
- environmental movement
- foreground / midground / background behavior
- depth and parallax
- lighting state at start
- lighting evolution
- focus behavior
- duration
- shot endpoint
- transition in
- transition out
- continuity package
- evidence class
- rights/source status
- model capability requirements
- negative constraints

## 3. Shot classes

### ESTABLISHING
Purpose: orient scale, geography, system, or environment.

Typical language:
- wide or extreme wide
- restrained movement
- clear horizon/spatial geometry
- natural environmental motion

Reject if:
- nothing changes
- shot exists only as a beauty frame
- scale is visually ambiguous

### DISCOVERY
Purpose: reveal an object or idea progressively.

Typical language:
- partial occlusion
- controlled lateral reveal
- foreground parallax
- changing light or focus
- subject becomes legible during shot

Endpoint:
- the reveal completes just before cut.

### INVESTIGATION
Purpose: examine a mechanism or object.

Typical language:
- macro/close track
- selective focus
- controlled rack focus
- tactile material detail
- small mechanical behaviors

Good for:
- GPU packages
- busbars
- cooling
- transformers
- optics
- connectors

### MECHANISM
Purpose: explain how something works.

May combine:
- real footage
- simplified overlay
- cutaway
- diagram
- animated flow

Camera should support comprehension, not compete with it.

### SCALE TRANSITION
Purpose: connect nested scales.

Examples:
- prompt → chip → rack → hall → campus → grid
- solar cell → array → orbital platform → constellation
- transformer → substation → transmission corridor

Requires:
- visual anchor
- geometric continuity
- clear scale cue
- planned destination

### CONSEQUENCE
Purpose: show physical/social/infrastructure implication.

Style:
- more observational
- fewer stylized moves
- documentary realism
- real footage preferred

### FRONTIER / WONDER
Purpose: create awe without spectacle-for-spectacle's-sake.

Style:
- negative space
- deliberate scale
- slower camera
- elegant composition
- evolving natural light
- minimal graphics

### EVIDENCE
Purpose: prove or qualify a factual claim.

Sources:
- filing
- research figure
- company plan
- technical diagram
- archival image
- official data

Never linger without transforming the information.

### GRAPHIC EXPLANATION
Purpose: clarify relationships impossible to see directly.

Use:
- diagrams
- maps
- timelines
- comparisons
- flow systems
- scale graphics

### TRANSITION
Purpose: bridge concepts, scale, geography, or time.

Best transitions are semantic:
- busbar becomes transmission line
- solar panel becomes orbital array
- rack power path becomes grid map
- document number becomes spatial visualization

## 4. Camera grammar

### Static
Use only when stillness itself carries tension, scale, evidence, or contemplation.

### Dolly / push
Must have a destination. Avoid generic “slow push-in” as default.

### Lateral track
Strong for revealing geometry and creating parallax.

### Arc / orbit
Use selectively around machinery, infrastructure, or hero objects. Must remain physically plausible.

### Crane / rise
Useful for revealing system scale.

### Macro drift
Small movement, shallow depth, tactile detail.

### Aerial
Use for infrastructure relationships, not generic spectacle.

### Locked observational
Useful for reality/evidence/consequence beats.

## 5. Internal-motion requirement

For a shot longer than ~3 seconds, identify at least two independent motion layers where appropriate:
- camera
- subject
- environment
- light
- focus
- atmospheric material
- reflected motion

Examples:
- camera tracks left while radiator panels move in foreground and Earth drifts in background
- transformer cooling fans rotate while heat shimmer changes and rack focus moves from busbar to insulator
- data-center aisle remains stable while indicator light patterns vary and cooling airflow moves light fabric/dust

Do not force motion into naturally static evidence shots.

## 6. Physicality rules

Camera motion must have:
- acceleration
- inertia
- plausible stabilization
- consistent horizon
- believable parallax

Reject:
- frictionless “AI glide”
- impossible zoom/dolly combination
- object morphing
- changing architecture
- moving shadows with no light source
- geometry that changes under camera motion

## 7. Lens character

Use qualitative lens intent rather than random focal-length jargon.

### Wide environmental
Emphasizes scale and spatial relationship.

### Normal observational
Feels documentary and unforced.

### Telephoto compression
Useful for infrastructure density and distant scale.

### Macro
Emphasizes materiality and engineering detail.

### Shallow-focus close
Use sparingly for tactile emphasis.

Depth of field must remain physically consistent across motion.

## 8. Lighting doctrine

Preferred:
- motivated light
- practical industrial sources
- sunrise/sunset only when narratively useful
- warm/cool contrast grounded in environment
- controlled specular highlights
- real shadow direction

Avoid:
- universal rim lighting
- constant volumetric beams
- blue-neon “technology light”
- lighting changes with no physical cause

## 9. Shot duration

Duration is earned by internal evolution.

Guidance:
- 1–3 sec: quick evidence, connective detail, impact beat
- 3–6 sec: most documentary cinematography
- 6–10 sec: hero reveal, complex mechanism, contemplative scale
- >10 sec: only when action/explanation genuinely develops

Long static-looking generated shots are a failure mode.

## 10. Sequence design

A premium sequence should vary:
- scale
- lens character
- motion
- source type
- information density
- emotional temperature

Avoid:
- four consecutive generated wide shots
- four consecutive slow push-ins
- repeating the same environment without new information
- graphics followed by graphics without a return to the physical world

## 11. Continuity package use

If a recurring subject exists, shot prompts must reference its canonical package.

Continuity package fields:
- identity
- geometry
- materials
- scale
- orientation
- distinctive features
- allowed camera sectors
- known lighting states
- approved source frames
- forbidden mutations

## 12. Negative-prompt categories

Every high-risk generated shot should consider:
- geometry mutation
- extra objects
- fake text/logos
- impossible reflections
- camera shake
- excessive lens flare
- neon/cyberpunk
- fantasy engineering
- physically impossible movement
- inconsistent Earth/sky/horizon
- changing materials
- warped faces/hands if humans appear

## 13. Director preflight

Before generation, answer:
1. What is the viewer learning or feeling?
2. Why is motion needed?
3. What changes from first frame to last?
4. Where is the camera physically?
5. What is moving independently of the camera?
6. What is the endpoint?
7. Does this need to be generated at all?
8. Which capability—not model name—is required?
