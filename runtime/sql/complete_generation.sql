-- VF Generation Worker (sync) / Provider Poll (async): persist outputs and complete the job.
with p as (
  select $1::jsonb as v
),
guard as (
  select j.id, j.production_run_id, j.episode_id, j.scene_id, j.shot_id, j.provider_model_id, e.brand_id, o.provider_id
  from video_factory.generation_jobs j
  join video_factory.episodes e on e.id = j.episode_id
  left join video_factory.provider_model_offers o on o.id = j.provider_model_offer_id,
  p
  where j.id = (p.v->>'job_id')::uuid
    and j.status = p.v->>'expected_status'
    and j.worker_id = p.v->>'worker_id'
  for update of j
),
att as (
  update video_factory.generation_attempts a
     set status = 'SUCCEEDED',
         response_payload = a.response_payload || jsonb_build_object('result', p.v->'raw_response'),
         cost = (p.v->>'actual_cost')::numeric,
         currency = coalesce(p.v->>'currency', a.currency),
         finished_at = now()
    from p, guard
   where a.id = (p.v->>'attempt_id')::uuid
     and a.generation_job_id = guard.id
     and a.status in ('STARTED', 'WAITING_PROVIDER')
  returning a.id, a.attempt_number
),
new_assets as (
  insert into video_factory.assets (brand_id, episode_id, scene_id, shot_id, generation_job_id, asset_type, uri, storage_provider, storage_state, mime_type, size_bytes, duration_seconds, width, height, is_primary, metadata)
  select guard.brand_id, guard.episode_id, guard.scene_id, guard.shot_id, guard.id,
         p.v->>'asset_type', f.value->>'url', p.v->>'storage_provider', 'ARCHIVE_PENDING', f.value->>'mime_type',
         (f.value->>'size_bytes')::bigint, (f.value->>'duration_seconds')::numeric,
         (f.value->>'width')::int, (f.value->>'height')::int,
         f.ordinality = 1,
         jsonb_build_object('generation_attempt_id', att.id, 'provider_job_id', p.v->>'provider_job_id',
                            'output_index', f.ordinality, 'file_name', f.value->>'file_name',
                            'storage_state', 'PROVIDER_HOSTED_NOT_YET_ARCHIVED')
  from guard, p, att, jsonb_array_elements(p.v->'files') with ordinality as f
  returning id
),
lineage as (
  insert into video_factory.asset_lineage (parent_asset_id, child_asset_id, relationship_type, metadata)
  select parent.id, child.id, l.value->>'relationship_type', jsonb_build_object('generation_job_id', p.v->>'job_id')
  from new_assets child
  cross join p
  cross join jsonb_array_elements(p.v->'lineage') as l
  join video_factory.assets parent on parent.id = (l.value->>'asset_id')::uuid
  on conflict do nothing
  returning id
),
cost as (
  insert into video_factory.cost_ledger (production_run_id, episode_id, provider_id, provider_model_id, generation_job_id, event_type, amount, currency, quantity, unit, external_reference, metadata)
  select guard.production_run_id, guard.episode_id, guard.provider_id, guard.provider_model_id, guard.id,
         case when p.v->>'actual_cost' is null then 'OTHER' else 'CHARGE' end,
         coalesce((p.v->>'actual_cost')::numeric, 0),
         coalesce(p.v->>'currency', 'USD'),
         (p.v->>'cost_quantity')::numeric, p.v->>'cost_unit', p.v->>'provider_job_id',
         jsonb_build_object('cost_status', p.v->>'cost_status', 'credits_consumed', p.v->'credits_consumed', 'generation_attempt_id', att.id)
  from guard, p, att
  returning id
),
ev as (
  insert into video_factory.production_events (production_run_id, episode_id, event_type, entity_type, entity_id, severity, message, data)
  select guard.production_run_id, guard.episode_id, 'GENERATION_COMPLETED', 'generation_job', guard.id,
         case when p.v->>'actual_cost' is null then 'WARNING' else 'INFO' end,
         'Generation completed with ' || jsonb_array_length(p.v->'files') || ' output(s)'
           || case when p.v->>'actual_cost' is null then '; cost unknown (' || (p.v->>'cost_status') || ')' else '' end,
         jsonb_build_object('generation_attempt_id', att.id, 'provider_job_id', p.v->>'provider_job_id', 'cost_status', p.v->>'cost_status')
  from guard, p, att
  returning id
),
done as (
  select video_factory.complete_generation_job(guard.id, (p.v->>'actual_cost')::numeric) as j
  from guard, p, att
)
select (done.j).id as job_id, (done.j).status as job_status, (done.j).actual_cost as actual_cost,
       (select count(*) from new_assets)::int as assets_created,
       (select count(*) from lineage)::int as lineage_created,
       (select count(*) from cost)::int as cost_rows,
       (select count(*) from ev)::int as event_rows
from done
