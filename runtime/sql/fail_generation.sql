-- VF Generation Worker / Provider Poll: record the failure and hand the job to fail_generation_job
-- (retry with backoff, or DEAD after max_attempts).
with p as (
  select $1::jsonb as v
),
guard as (
  select j.id, j.production_run_id, j.episode_id, j.attempts, j.max_attempts
  from video_factory.generation_jobs j, p
  where j.id = (p.v->>'job_id')::uuid
    and j.status in ('PROCESSING', 'WAITING_PROVIDER')
    and j.worker_id = p.v->>'worker_id'
  for update of j
),
att as (
  update video_factory.generation_attempts a
     set status = 'FAILED',
         error_message = p.v->>'error',
         response_payload = a.response_payload || jsonb_build_object('failure', jsonb_build_object('stage', p.v->>'stage', 'raw_response', p.v->'raw_response')),
         finished_at = now()
    from p, guard
   where a.id = nullif(p.v->>'attempt_id', '')::uuid
     and a.generation_job_id = guard.id
     and a.status in ('STARTED', 'WAITING_PROVIDER')
  returning a.id
),
ev as (
  insert into video_factory.production_events (production_run_id, episode_id, event_type, entity_type, entity_id, severity, message, data)
  select guard.production_run_id, guard.episode_id, 'GENERATION_FAILED', 'generation_job', guard.id,
         case when guard.attempts >= guard.max_attempts then 'ERROR' else 'WARNING' end,
         left(p.v->>'error', 500),
         jsonb_build_object('stage', p.v->>'stage', 'generation_attempt_id', p.v->>'attempt_id',
                            'attempts', guard.attempts, 'max_attempts', guard.max_attempts,
                            'will_retry', guard.attempts < guard.max_attempts,
                            'routing_decision', p.v->'routing_decision')
  from guard, p
  returning id
),
failed as (
  select video_factory.fail_generation_job(guard.id, p.v->>'error') as j
  from guard, p
)
select (failed.j).id as job_id, (failed.j).status as job_status, (failed.j).attempts as attempts,
       (failed.j).max_attempts as max_attempts, (failed.j).run_after as retry_after,
       (select count(*) from att)::int as attempts_marked,
       (select count(*) from ev)::int as event_rows
from failed
