# Video Factory Runtime Operations

How normal operation is controlled from Supabase and n8n, without Claude Code.

## Control surfaces

| Control | Where | Effect |
|---|---|---|
| Paid generation kill switch | `video_factory.provider_adapters.is_active` (per provider) | `false` = the router records `ADAPTER_INACTIVE` and no provider request is ever built |
| Archival kill switch | `video_factory.providers` row `supabase_storage` (`is_active`, `base_url`) | inactive or unconfigured = the archive worker claims nothing and idles |
| Work intake | rows in `video_factory.generation_jobs` (status `PENDING`) | workers only act on queued rows |
| Routing policy | `routing_profiles`, `routing_rules`, `provider_model_offers` | quality-first order and verified offers |
| Runtime identity | `video_factory_runtime` role (RLS + column grants) | workers cannot read `workflow_definitions` or write `provider_adapters` |

Workers idle safely when there is no work: each claim query returns zero rows and the run ends
at a No-op node. An idle pass costs one short query per schedule tick.

## Workers

| Workflow | Schedule | Claims | Paid? |
|---|---|---|---|
| VF - Generation Worker v1 (`NF0tQkgCgrNaU6vA`) | every 1 min | one `PENDING` job; first recovers stale `PROCESSING` jobs | yes, when an adapter is active |
| VF - Provider Poll v1 (`Vyhrxp3EIGHsorF0`) | every 30 s | one due `WAITING_PROVIDER` job | no (status reads only) |
| VF - Asset Archive Worker v1 (not yet deployed) | every 5 min | one asset needing archival | no |

## Crash recovery (stale PROCESSING)

`claim_next_generation_job` now sets `lease_expires_at` (10 min) and `submission_state`.
`recover_stale_generation_jobs()` runs at the start of every Generation Worker pass and is
deterministic about the three cases:

| Situation | Detected by | Action |
|---|---|---|
| Claimed, never submitted | no external id, `submission_state <> 'SUBMITTING'` | back to `PENDING`; open attempt `CANCELLED` |
| Submitted and persisted | external id on the job or its attempt | `WAITING_PROVIDER`, handed to Provider Poll; never resubmitted |
| Provider may have accepted, persistence uncertain | `submission_state = 'SUBMITTING'`, no external id | `FAILED` + `submission_state = 'UNCERTAIN'`, ERROR event with `requires_reconciliation` |

`submission_state` is set to `SUBMITTING` in the same statement that opens the attempt, immediately
before the provider call, so a worker that dies mid-submission is quarantined rather than retried.
Recovery never increments `attempts`, so `max_attempts` still bounds paid work. Multiple workers are
safe: recovery selects `FOR UPDATE SKIP LOCKED` and each job transitions exactly once.

**Reconciliation runbook for `UNCERTAIN`:** look up the job's `idempotency_key` and time window in the
provider dashboard. If the provider did run it, record the output manually and mark the job `DONE`;
if not, set it back to `PENDING`. Never bulk-requeue `UNCERTAIN` jobs.

## Durable archival

Successful generations insert assets with `storage_state = 'ARCHIVE_PENDING'`. The archive worker
downloads the provider URI and uploads to the configured backend, then records `archive_uri`,
`archive_object_key`, `archived_at`, `archive_size_bytes` and a checksum (the storage ETag; a content
hash is not computed because n8n Code nodes have no crypto module here).

- The provider URI and `storage_provider` are never overwritten or deleted.
- The object key is deterministic (`episodes/{episode_id}/assets/{asset_id}.{ext}`) and uploads use
  `x-upsert`, so a retry overwrites one object instead of creating a second.
- Archival only ever writes `archive_*` columns and `storage_state`, so a failure cannot alter a
  generation job and therefore cannot trigger a second paid generation.
- Backends live in `provider-adapters/storage.js`; `supabase_storage` is the first one. Runtime
  settings come from the `supabase_storage` providers row, so no project URL is committed to git.

**Before activating archival:** create the bucket (default `video-factory-assets`, private), create the
n8n credential `VIDEO_FACTORY_SUPABASE_STORAGE` (Header Auth `Authorization: Bearer <service key>`),
then set the providers row `base_url` and `is_active = true`.

## Postgres TLS status

The runtime credential currently uses `ssl=require` with `allowUnauthorizedCerts=true`, i.e. encrypted
but with no certificate verification. Verified findings:

- Every Postgres endpoint for this project — direct `db.<ref>.supabase.co:5432` and the pooler
  `aws-0-us-west-2.pooler.supabase.com` on 5432 and 6543 — presents a chain signed by
  **Supabase Root 2021 CA**, which is not in any public trust store.
- With that CA supplied explicitly, verification succeeds on all three endpoints and the runtime role
  behaves correctly (`rolbypassrls=false`, `statement_timeout=30s`, `workflow_definitions` denied).
- n8n's Postgres credential has no CA field, and the n8n container does not trust that root, so
  verification cannot currently be enabled from n8n.

Remediation (control plane, either one):
1. Mount the Supabase root CA into the n8n container and set `NODE_EXTRA_CA_CERTS` to it, then flip the
   credential to `allowUnauthorizedCerts=false`. This needs a Music Factory compose change.
2. Run Video Factory's own n8n instance with that CA trusted.

Switching to the pooler is recommended once trust is in place (it is the supported endpoint and pools
better), but on its own it does not improve verification.

## Recommended activation sequence

1. Control plane applies `supabase/migrations/20260918021500_video_factory_runtime_hardening.sql`.
2. Redeploy workflows: `npm run deploy:n8n -- --only=generation_worker,provider_poll,asset_archive`
   (creates the archive worker inactive; the registry row is in the migration).
3. Bind `VIDEO_FACTORY_POSTGRES`, `VIDEO_FACTORY_FAL`, `VIDEO_FACTORY_KIE` on the archive worker's
   Postgres node and, once created, `VIDEO_FACTORY_SUPABASE_STORAGE` on its upload node.
4. Activate Provider Poll first (unpaid), confirm it idles cleanly for a few minutes.
5. Activate the Generation Worker with **all adapters still inactive**; confirm it idles and that
   recovery runs without touching anything.
6. Configure and activate archival, then re-run the existing smoke asset through it.
7. Only then enable one provider adapter for authorized production work.

With adapters inactive, leaving all three workers activated is safe: no provider request can be built,
so no spend is possible. The one operational cost is that each queued job burns `max_attempts` against
`NO_ELIGIBLE_ROUTE` while adapters are off — so queue work only after enabling an adapter.
