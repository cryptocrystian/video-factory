-- VF Provider Poll: lease one WAITING_PROVIDER job that is due for a poll.
-- Due: unleased and idle for the adapter poll interval, or a lease older than
-- stale_lease_minutes (a crashed poll run).
with p as (
  select $1::jsonb as v
),
cand as (
  select j.id
  from video_factory.generation_jobs j
  join video_factory.provider_model_offers o on o.id = j.provider_model_offer_id
  join video_factory.provider_adapters pa on pa.provider_id = o.provider_id,
  p
  where j.status = 'WAITING_PROVIDER'
    and j.external_job_id is not null
    and (
      (j.worker_id is null and j.updated_at <= now() - make_interval(secs => pa.poll_interval_seconds))
      or (j.worker_id is not null and j.updated_at <= now() - make_interval(mins => coalesce((p.v->>'stale_lease_minutes')::int, 10)))
    )
  order by j.updated_at
  limit 1
  for update of j skip locked
),
claimed as (
  update video_factory.generation_jobs j
     set worker_id = p.v->>'worker_id'
    from cand, p
   where j.id = cand.id
  returning j.*
)
select
  to_jsonb(c) as job,
  to_jsonb(a) as attempt,
  pr.slug as provider_slug,
  jsonb_build_object('poll_interval_seconds', pa.poll_interval_seconds, 'max_poll_minutes', pa.max_poll_minutes, 'adapter_active', pa.is_active) as adapter,
  jsonb_build_object('provider_model_key', o.provider_model_key, 'endpoint_key', o.endpoint_key) as offer,
  coalesce((
    select jsonb_agg(jsonb_build_object('asset_id', ia.id, 'uri', ia.uri))
    from video_factory.assets ia
    where ia.id in (
      select (e->>'asset_id')::uuid
      from jsonb_array_elements(c.input_manifest) e
      where e->>'asset_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ), '[]'::jsonb) as input_assets
from claimed c
join video_factory.provider_model_offers o on o.id = c.provider_model_offer_id
join video_factory.providers pr on pr.id = o.provider_id
join video_factory.provider_adapters pa on pa.provider_id = pr.id
left join lateral (
  select ga.id, ga.attempt_number, ga.status, ga.external_job_id, ga.started_at, ga.request_payload, ga.response_payload
  from video_factory.generation_attempts ga
  where ga.generation_job_id = c.id and ga.external_job_id = c.external_job_id
  order by ga.attempt_number desc
  limit 1
) a on true
