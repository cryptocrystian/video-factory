-- VF Generation Worker: load job, shot, profile, routing requirements and
-- quality-first candidates for a job this worker holds.
with p as (
  select $1::jsonb as v
),
job as (
  select j.*
  from video_factory.generation_jobs j, p
  where j.id = (p.v->>'job_id')::uuid
    and j.status = 'PROCESSING'
    and j.worker_id = p.v->>'worker_id'
),
shot as (
  select s.* from video_factory.shots s join job on s.id = job.shot_id
),
brand as (
  select b.id, b.slug, b.config
  from video_factory.brands b
  join video_factory.episodes e on e.brand_id = b.id
  join job on e.id = job.episode_id
),
profile as (
  select rp.*
  from video_factory.routing_profiles rp
  where rp.is_active
    and rp.id = coalesce(
      (select shot.routing_profile_id from shot),
      (select rp2.id
         from video_factory.routing_profiles rp2, job, brand
        where rp2.is_active
          and rp2.slug = coalesce(job.parameters->>'routing_profile_slug', brand.config->'routing'->>'profile')
          and (rp2.brand_id = brand.id or rp2.brand_id is null)
        order by rp2.brand_id nulls last
        limit 1)
    )
),
req as (
  select
    coalesce(job.parameters->>'routing_class', (select shot.routing_class from shot)) as routing_class,
    coalesce(job.parameters->>'resolution', (select shot.routing_requirements->>'resolution' from shot)) as resolution,
    coalesce(
      (job.parameters->>'audio_included')::boolean,
      (select (shot.routing_requirements->>'audio_included')::boolean from shot),
      case when job.job_kind = 'VIDEO' then false end
    ) as audio_included,
    exists (
      select 1 from video_factory.approval_events ae
      where ae.entity_type = 'GENERATION_JOB'
        and ae.entity_id = job.id
        and ae.decision = 'APPROVED'
        and ae.metadata->>'approval_scope' = 'PREMIUM_EXCEPTION'
    ) as premium_approved
  from job
)
select
  (select to_jsonb(job) from job) as job,
  (select to_jsonb(shot) from shot) as shot,
  (select to_jsonb(profile) from profile) as profile,
  (select to_jsonb(req) from req) as requirements,
  coalesce((
    select jsonb_agg(to_jsonb(c) - 'ordinality' order by c.ordinality)
    from profile, req,
         lateral video_factory.get_route_candidates(profile.slug, req.routing_class, req.resolution, req.audio_included, req.premium_approved)
           with ordinality as c
  ), '[]'::jsonb) as candidates,
  coalesce((
    select jsonb_object_agg(pr.slug, jsonb_build_object(
      'provider_active', pr.is_active,
      'adapter_active', coalesce(pa.is_active, false),
      'adapter_mode', pa.adapter_mode,
      'poll_interval_seconds', pa.poll_interval_seconds,
      'max_poll_minutes', pa.max_poll_minutes))
    from video_factory.providers pr
    left join video_factory.provider_adapters pa on pa.provider_id = pr.id
  ), '{}'::jsonb) as adapters,
  coalesce((
    select jsonb_agg(distinct ga.request_payload->>'provider_model_offer_id')
    from video_factory.generation_attempts ga join job on ga.generation_job_id = job.id
    where ga.status = 'FAILED' and ga.request_payload ? 'provider_model_offer_id'
  ), '[]'::jsonb) as failed_offer_ids,
  coalesce((
    select jsonb_agg(jsonb_build_object('asset_id', a.id, 'uri', a.uri, 'asset_type', a.asset_type, 'mime_type', a.mime_type))
    from video_factory.assets a, job
    where a.id in (
      select (e->>'asset_id')::uuid
      from jsonb_array_elements(job.input_manifest) e
      where e->>'asset_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ), '[]'::jsonb) as input_assets
