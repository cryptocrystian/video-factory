-- VF Asset Archive Worker: record the durable copy.
-- The provider URI is preserved; only archive_* columns and storage_state change,
-- so re-running this for the same asset updates one row and creates nothing new.
with p as (
  select $1::jsonb as v
),
upd as (
  update video_factory.assets a
     set storage_state = 'ARCHIVED',
         archive_uri = p.v->>'archive_uri',
         archive_storage_provider = p.v->>'archive_storage_provider',
         archive_object_key = p.v->>'archive_object_key',
         archived_at = now(),
         archive_checksum = p.v->>'archive_checksum',
         archive_checksum_algorithm = p.v->>'archive_checksum_algorithm',
         archive_size_bytes = (p.v->>'archive_size_bytes')::bigint,
         archive_worker_id = null,
         archive_last_error = null
    from p
   where a.id = (p.v->>'asset_id')::uuid
     and a.archive_worker_id = p.v->>'worker_id'
     and a.storage_state = 'ARCHIVING'
  returning a.id, a.generation_job_id, a.episode_id, a.uri, a.archive_uri, a.storage_state
),
ev as (
  insert into video_factory.production_events (episode_id, event_type, entity_type, entity_id, severity, message, data)
  select upd.episode_id, 'ASSET_ARCHIVED', 'asset', upd.id, 'INFO',
         'Asset archived to durable storage',
         jsonb_build_object('archive_storage_provider', p.v->>'archive_storage_provider',
                            'archive_object_key', p.v->>'archive_object_key',
                            'archive_size_bytes', (p.v->>'archive_size_bytes')::bigint,
                            'provider_uri_preserved', true)
  from upd, p
  returning id
)
select upd.id as asset_id, upd.storage_state, upd.uri as provider_uri, upd.archive_uri,
       (select count(*) from ev)::int as event_rows
from upd
