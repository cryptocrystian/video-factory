-- VF Generation Worker: provider accepted an async request.
with p as (
  select $1::jsonb as v
),
guard as (
  select j.id, j.production_run_id, j.episode_id
  from video_factory.generation_jobs j, p
  where j.id = (p.v->>'job_id')::uuid
    and j.status = 'PROCESSING'
    and j.worker_id = p.v->>'worker_id'
  for update of j
),
att as (
  update video_factory.generation_attempts a
     set status = 'WAITING_PROVIDER',
         external_job_id = p.v->>'provider_job_id',
         response_payload = a.response_payload || jsonb_build_object('submit', p.v->'submit_result')
    from p, guard
   where a.id = (p.v->>'attempt_id')::uuid
     and a.generation_job_id = guard.id
     and a.status = 'STARTED'
  returning a.id, a.attempt_number
),
ev as (
  insert into video_factory.production_events (production_run_id, episode_id, event_type, entity_type, entity_id, severity, message, data)
  select guard.production_run_id, guard.episode_id, 'GENERATION_WAITING_PROVIDER', 'generation_job', guard.id, 'INFO',
         'Provider accepted request ' || (p.v->>'provider_job_id'),
         jsonb_build_object('generation_attempt_id', att.id, 'provider_job_id', p.v->>'provider_job_id')
  from guard, p, att
  returning id
),
marked as (
  select video_factory.mark_generation_waiting_provider(guard.id, p.v->>'provider_job_id') as j
  from guard, p, att
)
select (marked.j).id as job_id, (marked.j).status as job_status, (marked.j).external_job_id as provider_job_id,
       (select count(*) from ev)::int as event_rows
from marked
