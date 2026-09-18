-- VF Generation Worker: persist the routing decision and open a STARTED attempt.
with p as (
  select $1::jsonb as v
),
upd as (
  update video_factory.generation_jobs j
     set canonical_model_id = (p.v->>'canonical_model_id')::uuid,
         provider_model_offer_id = o.id,
         provider_model_id = coalesce(o.provider_model_id, j.provider_model_id),
         routing_decision = p.v->'routing_decision',
         estimated_cost = coalesce((p.v->>'estimated_cost')::numeric, j.estimated_cost),
         currency = coalesce(p.v->>'currency', j.currency),
         -- crash-recovery marker: set immediately before the provider call so a stale
         -- PROCESSING job is quarantined for reconciliation instead of resubmitted
         submission_state = 'SUBMITTING',
         lease_expires_at = now() + interval '10 minutes'
    from p, video_factory.provider_model_offers o
   where j.id = (p.v->>'job_id')::uuid
     and j.status = 'PROCESSING'
     and j.worker_id = p.v->>'worker_id'
     and o.id = (p.v->>'provider_model_offer_id')::uuid
     and o.canonical_model_id = (p.v->>'canonical_model_id')::uuid
  returning j.id, j.attempts, j.production_run_id, j.episode_id, o.provider_id, o.provider_model_id
),
att as (
  insert into video_factory.generation_attempts (generation_job_id, attempt_number, provider_model_id, status, request_payload, currency)
  select upd.id, upd.attempts, upd.provider_model_id, 'STARTED', p.v->'request_payload', coalesce(p.v->>'currency', 'USD')
  from upd, p
  on conflict (generation_job_id, attempt_number) do nothing
  returning id, attempt_number
),
estimate as (
  insert into video_factory.cost_ledger (production_run_id, episode_id, provider_id, provider_model_id, generation_job_id, event_type, amount, currency, quantity, unit, metadata)
  select upd.production_run_id, upd.episode_id, upd.provider_id, upd.provider_model_id, upd.id, 'ESTIMATE',
         (p.v->>'estimated_cost')::numeric, coalesce(p.v->>'currency', 'USD'),
         (p.v->'cost_estimate'->>'units')::numeric, p.v->'cost_estimate'->>'unit',
         jsonb_build_object('source', 'provider_model_offer_rate', 'generation_attempt_id', att.id, 'provider_model_offer_id', p.v->>'provider_model_offer_id')
  from upd, p, att
  where p.v->>'estimated_cost' is not null
  returning id
),
ev as (
  insert into video_factory.production_events (production_run_id, episode_id, event_type, entity_type, entity_id, severity, message, data)
  select upd.production_run_id, upd.episode_id, 'GENERATION_ROUTED', 'generation_job', upd.id, 'INFO',
         'Routed to ' || (p.v->'routing_decision'->'selected'->>'canonical_model_slug') || ' via ' || (p.v->'routing_decision'->'selected'->>'provider_slug'),
         jsonb_build_object('generation_attempt_id', att.id, 'attempt_number', att.attempt_number, 'selected', p.v->'routing_decision'->'selected', 'worker_id', p.v->>'worker_id')
  from upd, p, att
  returning id
)
select att.id as attempt_id, att.attempt_number, upd.id as job_id,
       (select count(*) from estimate)::int as estimate_rows,
       (select count(*) from ev)::int as event_rows
from upd join att on true
