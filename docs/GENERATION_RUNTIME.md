# Generation Runtime v1

`VF - Generation Worker v1` and `VF - Provider Poll v1` are generated from repo sources:

| Source | Purpose |
|---|---|
| `provider-adapters/contract.js` | normalized contract, cost estimate, lineage, safe raw payloads |
| `provider-adapters/routing.js` | quality-first route selection (model first, provider second) |
| `provider-adapters/fal.js`, `kie.js` | request mapping and submit/poll normalization |
| `provider-adapters/runtime.js` | step functions called by the n8n Code nodes |
| `runtime/sql/*.sql` | every database write, one atomic statement per step |
| `scripts/build-workflows.mjs` | inlines the above into `workflows/generation-worker.json` and `workflows/provider-poll.json` |
| `scripts/test-runtime.mjs` | dry-run tests against the built JSON (rolled-back transaction, mocked providers) |

```bash
npm run build:workflows        # regenerate workflow JSON after editing adapters or SQL
npm run check:workflows-built  # fails if committed JSON is stale
npm run validate:workflows
npm run test:runtime           # dry run; aborts if live generation jobs exist
npm run deploy:n8n -- --only=generation_worker,provider_poll
```

## Flow

Generation Worker: claim (`claim_next_generation_job`) → load routing context → select route
(`get_route_candidates` + capability match) → normalize request → persist route + STARTED attempt
(+ ESTIMATE cost, event) → submit to fal or Kie → WAITING_PROVIDER (`mark_generation_waiting_provider`),
or synchronous completion, or `fail_generation_job`.

Provider Poll: lease a due WAITING_PROVIDER job → poll → PENDING/RUNNING releases the lease;
SUCCEEDED persists assets, lineage, cost, attempt SUCCEEDED, `complete_generation_job`, event;
FAILED/CANCELLED/timeout calls `fail_generation_job`.

## Safety properties

- Provider adapters with `provider_adapters.is_active = false` are never selected (current state: fal and Kie inactive).
- A lower-priority model is considered only when every offer of higher-priority models is ineligible for a
  recorded non-price reason (mode, adapter, constraints, previous failure, quality-gate exclusion).
- If a provider accepted a request but the database write fails, the job is left PROCESSING and the run stops
  with the provider job id in the error, so paid work is not resubmitted.
- Credentials exist only in n8n credentials; nothing credential-bearing is written to jobs, attempts,
  providers, adapters, checkpoints or events.

## Required n8n credentials (not yet created)

| Credential name | Type | Used by |
|---|---|---|
| `VIDEO_FACTORY_POSTGRES` | Postgres | all Postgres nodes (connect as `video_factory_runtime`) |
| `VIDEO_FACTORY_FAL` | Header Auth, `Authorization: Key …` | Submit to fal, Poll fal Status, Fetch fal Result |
| `VIDEO_FACTORY_KIE` | Header Auth, `Authorization: Bearer …` | Submit to Kie, Poll Kie Task |

The existing `supabase-pg` and `kie-api` credentials belong to Music Factory and must not be bound.

## Known v1 limits

- Outputs are registered with provider-hosted URLs (`metadata.storage_state = PROVIDER_HOSTED_NOT_YET_ARCHIVED`);
  archival to durable storage is not implemented.
- fal charges are recorded as offer rate × requested units; Kie reports credits only, so Kie USD cost is unknown.
- No reaper for jobs stuck in PROCESSING after a crashed Generation Worker run.
- Kie Veo 3.1 and Kie ElevenLabs are not mapped (different API / voice catalogue).

## Proposed runtime role (NOT APPLIED)

Every `video_factory` table has RLS enabled with no policies, and the job functions are `SECURITY INVOKER`,
so the role needs table privileges plus RLS policies (preferred over `BYPASSRLS`).

```sql
create role video_factory_runtime login password '<generated>' noinherit nocreatedb nocreaterole nobypassrls connection limit 10;
alter role video_factory_runtime set search_path = '';
alter role video_factory_runtime set statement_timeout = '30s';

grant usage on schema video_factory to video_factory_runtime;

-- job queue
grant select on video_factory.generation_jobs to video_factory_runtime;
grant update (status, worker_id, attempts, started_at, finished_at, run_after, last_error, external_job_id,
              actual_cost, estimated_cost, currency, canonical_model_id, provider_model_offer_id,
              provider_model_id, routing_decision, updated_at)
  on video_factory.generation_jobs to video_factory_runtime;
grant select, insert on video_factory.generation_attempts to video_factory_runtime;
grant update (status, external_job_id, response_payload, error_message, cost, currency, finished_at)
  on video_factory.generation_attempts to video_factory_runtime;

-- outputs and audit (append-only)
grant select, insert on video_factory.assets, video_factory.asset_lineage to video_factory_runtime;
grant insert on video_factory.cost_ledger, video_factory.production_events to video_factory_runtime;
grant select (id) on video_factory.cost_ledger, video_factory.production_events to video_factory_runtime;

-- read-only routing and planning context
grant select on video_factory.episodes, video_factory.brands, video_factory.shots,
                video_factory.routing_profiles, video_factory.routing_rules, video_factory.canonical_models,
                video_factory.provider_model_offers, video_factory.providers, video_factory.approval_events
  to video_factory_runtime;
grant select (id, provider_id, adapter_mode, is_active, poll_interval_seconds, max_poll_minutes, timeout_seconds)
  on video_factory.provider_adapters to video_factory_runtime;

grant execute on function
  video_factory.claim_next_generation_job(text),
  video_factory.fail_generation_job(uuid, text),
  video_factory.mark_generation_waiting_provider(uuid, text),
  video_factory.complete_generation_job(uuid, numeric),
  video_factory.get_route_candidates(text, text, text, boolean, boolean)
  to video_factory_runtime;

-- RLS: one policy per table/command actually used, scoped to the runtime role only.
create policy vf_runtime_select on video_factory.generation_jobs for select to video_factory_runtime using (true);
create policy vf_runtime_update on video_factory.generation_jobs for update to video_factory_runtime using (true) with check (true);
create policy vf_runtime_select on video_factory.generation_attempts for select to video_factory_runtime using (true);
create policy vf_runtime_insert on video_factory.generation_attempts for insert to video_factory_runtime with check (true);
create policy vf_runtime_update on video_factory.generation_attempts for update to video_factory_runtime using (true) with check (true);
create policy vf_runtime_select on video_factory.assets for select to video_factory_runtime using (true);
create policy vf_runtime_insert on video_factory.assets for insert to video_factory_runtime with check (true);
create policy vf_runtime_select on video_factory.asset_lineage for select to video_factory_runtime using (true);
create policy vf_runtime_insert on video_factory.asset_lineage for insert to video_factory_runtime with check (true);
create policy vf_runtime_select on video_factory.cost_ledger for select to video_factory_runtime using (true);
create policy vf_runtime_insert on video_factory.cost_ledger for insert to video_factory_runtime with check (true);
create policy vf_runtime_select on video_factory.production_events for select to video_factory_runtime using (true);
create policy vf_runtime_insert on video_factory.production_events for insert to video_factory_runtime with check (true);
-- read-only tables
create policy vf_runtime_select on video_factory.episodes for select to video_factory_runtime using (true);
create policy vf_runtime_select on video_factory.brands for select to video_factory_runtime using (true);
create policy vf_runtime_select on video_factory.shots for select to video_factory_runtime using (true);
create policy vf_runtime_select on video_factory.routing_profiles for select to video_factory_runtime using (true);
create policy vf_runtime_select on video_factory.routing_rules for select to video_factory_runtime using (true);
create policy vf_runtime_select on video_factory.canonical_models for select to video_factory_runtime using (true);
create policy vf_runtime_select on video_factory.provider_model_offers for select to video_factory_runtime using (true);
create policy vf_runtime_select on video_factory.providers for select to video_factory_runtime using (true);
create policy vf_runtime_select on video_factory.provider_adapters for select to video_factory_runtime using (true);
create policy vf_runtime_select on video_factory.approval_events for select to video_factory_runtime using (true);
```

No `public` privileges are granted. The role still inherits PostgreSQL defaults granted to `PUBLIC`
(database CONNECT/TEMP, USAGE on schema `public`, EXECUTE on `public.set_updated_at`); no `public`
table or sequence is granted to `PUBLIC`, and all 10 `public` tables have RLS enabled.

`workflow_definitions` is written only by `deploy:n8n`, which should keep using a separate deploy credential.
