-- VF Asset Archive Worker: archival failed. Only archive_* state changes, so the
-- generated asset and its generation job are never affected (no regeneration).
with p as (
  select $1::jsonb as v
),
upd as (
  update video_factory.assets a
     set storage_state = 'ARCHIVE_FAILED',
         archive_worker_id = null,
         archive_last_error = left(p.v->>'error', 1000),
         archive_run_after = now() + (interval '1 minute' * power(4, least(greatest(a.archive_attempts, 1), 5)))
    from p
   where a.id = (p.v->>'asset_id')::uuid
     and a.archive_worker_id = p.v->>'worker_id'
     and a.storage_state = 'ARCHIVING'
  returning a.id, a.episode_id, a.archive_attempts, a.archive_run_after
),
ev as (
  insert into video_factory.production_events (episode_id, event_type, entity_type, entity_id, severity, message, data)
  select upd.episode_id, 'ASSET_ARCHIVE_FAILED', 'asset', upd.id, 'WARNING',
         left(p.v->>'error', 500),
         jsonb_build_object('archive_attempts', upd.archive_attempts, 'retry_after', upd.archive_run_after, 'stage', p.v->>'stage')
  from upd, p
  returning id
)
select upd.id as asset_id, upd.archive_attempts, upd.archive_run_after as retry_after, (select count(*) from ev)::int as event_rows
from upd
