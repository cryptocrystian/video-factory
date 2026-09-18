-- VF Asset Archive Worker: lease one asset that still needs durable archival.
-- Nothing is claimed unless the storage backend row is active and configured, so the
-- worker idles safely when archival is switched off.
with p as (
  select $1::jsonb as v
),
storage as (
  select s.slug, s.base_url, s.config
  from video_factory.providers s
  where s.slug = 'supabase_storage' and s.is_active = true and s.base_url is not null
)
select to_jsonb(a) as asset,
       (select jsonb_build_object('backend', storage.slug, 'base_url', storage.base_url) || storage.config from storage) as storage_config
from storage, p,
     lateral video_factory.claim_next_asset_for_archive(p.v->>'worker_id', 10) as a
