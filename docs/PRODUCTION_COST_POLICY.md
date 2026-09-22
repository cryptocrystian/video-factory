# Video Factory Production Cost Policy v1

Status: Canonical spend-control policy

## 1. Doctrine

> **Quality first. Cost second. Spend must earn its way into the frame.**

The factory does not select the cheapest model.
The factory also does not select the newest or most expensive model by default.

Spend is justified by measurable production value.

## 2. Primary economic metric

Optimize:

> **cost per accepted production second**

Not:
- provider list price
- price per generated second
- credits consumed
- number of generations

Formula:

```
cost_per_accepted_second =
(total generation + retry spend for the shot class)
/ accepted final-screen seconds
```

Future enhancement: include attributable post-production labor/compute.

## 3. Premium-spend justification

A premium route requires at least one explicit reason:

- SIGNATURE_OPENING
- SIGNATURE_CLOSING
- CRITICAL_STORY_REVEAL
- COMPLEX_GEOMETRY
- COMPLEX_CAMERA
- CONTINUITY_CRITICAL
- MULTIMODAL_REFERENCE_REQUIRED
- LONG_TEMPORAL_STABILITY_REQUIRED
- FIRST_LAST_FRAME_CONTROL_REQUIRED
- LOWER_COST_MODEL_FAILED_QUALITY_GATE
- MATERIAL_REDUCTION_IN_EXPECTED_RETRIES
- MATERIAL_REDUCTION_IN_POST_CLEANUP

Record:
- expected screen time
- narrative importance
- required capabilities
- lower-cost route considered
- why it is insufficient
- expected incremental spend

No reason = no premium spend.

## 4. Shot tiers

### Tier A — Signature / hero
Examples:
- cold open
- major reveal
- final payoff
- central scale transition

Policy:
- premium models permitted with justification
- up to 3 serious attempts before creative/model reassessment
- continuity package required when recurring
- full QC

### Tier B — Supporting cinematic
Examples:
- infrastructure B-roll
- explanatory environment
- secondary transition

Policy:
- benchmarked standard route preferred
- up to 2 attempts
- escalate only with recorded failure reason

### Tier C — Connective / utility
Examples:
- quick detail
- simple establishing insert
- graphic connective tissue

Policy:
- 1 paid attempt where possible
- prefer real footage, graphics, existing assets, or cheaper proven route
- do not premium-escalate unless editorially critical

## 5. Retry policy

After a failed generation, classify failure first.

Do not blindly reroll.

Decision tree:

```
failure
→ provider execution problem? retry same route once if safe
→ prompt/directing problem? revise brief
→ continuity/reference problem? strengthen reference package
→ model capability problem? change model
→ shot concept too fragile? redesign shot
```

After max attempts:
- stop
- redesign or replace
- do not keep spending because prior spend already occurred

## 6. Previsualization policy

For hero sequences:
- storyboard before paid motion
- animatic before multi-shot premium generation
- scratch assets are acceptable
- premium generation begins only after sequence timing works

The cheapest rejected generation is the one never made.

## 7. Asset-reuse policy

Before generation:
1. search approved assets
2. search continuity-package assets
3. search real/source footage
4. determine whether a crop/edit/composite can solve the need
5. generate only if required

Never regenerate paid media merely because workflow state restarted.

## 8. Budget authorization

A production plan should expose:
- planned shots by tier
- model candidates
- estimated attempts
- expected spend range
- premium justifications
- contingency allowance

Full-episode production should not begin without cost visibility.

## 9. Stop-loss controls

Required:
- per-shot max attempts
- per-sequence budget cap
- per-episode generation cap
- provider kill switch
- no automatic premium escalation beyond approved policy
- idempotency
- no resubmission when provider acceptance state is uncertain

## 10. Model economics

Compare models using:
- first-pass acceptance
- eventual acceptance
- attempts/accepted shot
- cleanup burden
- continuity success
- final screen seconds retained

Example:
- Model A: $0.08/sec × 4 attempts = expensive if only one usable result.
- Model B: $0.20/sec × 1 attempt = potentially cheaper per accepted second.

Raw price is only one input.

## 11. Rejected-output accounting

Rejected spend is not hidden.

Track:
- model
- provider
- shot class
- spend
- failure reason
- whether retry occurred
- eventual accepted route

The objective is to reduce repeated failure classes over time.

## 12. Economics dashboard targets

Per episode:
- total generated spend
- rejected-generation spend
- accepted generated seconds
- cost per accepted generated second
- spend by shot tier
- spend by model
- spend by provider
- acceptance rate by model/shot class
- retry rate
- premium spend share
- archival/storage costs

## 13. Price freshness

Provider pricing is time-sensitive.

Before major production:
- refresh offers
- record last-checked timestamp
- do not assume an old promotion remains valid

Quality routing order is not changed by a discount unless candidates are already creatively equivalent.

## 14. Final principle

> **Spend more when the audience can see the difference. Spend less when they cannot.**
