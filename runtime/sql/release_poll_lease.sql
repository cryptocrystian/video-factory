-- VF Provider Poll: provider still PENDING/RUNNING; record the poll and release the lease.
with p as (
  select $1::jsonb as v
),
rel as (
  update video_factory.generation_jobs j
     set worker_id = null
    from p
   where j.id = (p.v->>'job_id')::uuid
     and j.status = 'WAITING_PROVIDER'
     and j.worker_id = p.v->>'worker_id'
  returning j.id, j.production_run_id, j.episode_id
),
att as (
  update video_factory.generation_attempts a
     set response_payload = a.response_payload || jsonb_build_object('last_poll', jsonb_build_object(
           'status', p.v->>'provider_status', 'polled_at', now(), 'warning', p.v->>'warning', 'raw_response', p.v->'raw_response'))
    from p, rel
   where a.id = (p.v->>'attempt_id')::uuid
     and a.generation_job_id = rel.id
  returning a.id
),
warn as (
  insert into video_factory.production_events (production_run_id, episode_id, event_type, entity_type, entity_id, severity, message, data)
  select rel.production_run_id, rel.episode_id, 'PROVIDER_POLL_WARNING', 'generation_job', rel.id, 'WARNING',
         left(p.v->>'warning', 500), jsonb_build_object('generation_attempt_id', p.v->>'attempt_id')
  from rel, p
  where p.v->>'warning' is not null
  returning id
)
select rel.id as job_id, (select count(*) from att)::int as attempts_updated, (select count(*) from warn)::int as warning_rows
from rel
