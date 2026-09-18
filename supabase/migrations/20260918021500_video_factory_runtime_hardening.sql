-- Video Factory runtime hardening v1
--   1. lease + submission state on generation_jobs, and deterministic stale-PROCESSING recovery
--   2. durable asset archival columns and an archive claim function
--   3. grants/policies for video_factory_runtime, and the asset_archive workflow registry row
--
-- NOT APPLIED TO PRODUCTION BY THE VPS. The dry-run test suite applies this file
-- inside a rolled-back transaction, so it is exercised before the control plane applies it.

-- ---------------------------------------------------------------------------
-- 1. Generation job lease + submission state
-- ---------------------------------------------------------------------------
alter table video_factory.generation_jobs
  add column if not exists lease_expires_at timestamptz,
  add column if not exists submission_state text not null default 'NONE',
  add column if not exists recovery_count integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'generation_jobs_submission_state_check') then
    alter table video_factory.generation_jobs
      add constraint generation_jobs_submission_state_check
      check (submission_state in ('NONE', 'SUBMITTING', 'SUBMITTED', 'UNCERTAIN'));
  end if;
end $$;

create index if not exists generation_jobs_stale_lease_idx
  on video_factory.generation_jobs (status, lease_expires_at)
  where status = 'PROCESSING';

-- Claim now records an explicit lease. Signature unchanged so existing callers keep working.
create or replace function video_factory.claim_next_generation_job(p_worker_id text)
 returns setof video_factory.generation_jobs
 language sql
 set search_path to ''
as $function$
  update video_factory.generation_jobs
     set status = 'PROCESSING',
         worker_id = p_worker_id,
         attempts = attempts + 1,
         started_at = coalesce(started_at, now()),
         lease_expires_at = now() + interval '10 minutes',
         submission_state = 'NONE'
   where id = (
     select id
       from video_factory.generation_jobs
      where status = 'PENDING'
        and run_after <= now()
      order by priority, run_after, created_at
      limit 1
      for update skip locked
   )
  returning *;
$function$;

-- Terminal/handoff transitions clear the lease.
create or replace function video_factory.mark_generation_waiting_provider(p_job_id uuid, p_external_job_id text)
 returns video_factory.generation_jobs
 language plpgsql
 set search_path to ''
as $function$
declare v_job video_factory.generation_jobs;
begin
  update video_factory.generation_jobs
     set status = 'WAITING_PROVIDER',
         external_job_id = p_external_job_id,
         worker_id = null,
         submission_state = 'SUBMITTED',
         lease_expires_at = null,
         updated_at = now()
   where id = p_job_id
   returning * into v_job;
  return v_job;
end;
$function$;

create or replace function video_factory.complete_generation_job(p_job_id uuid, p_actual_cost numeric default null::numeric)
 returns video_factory.generation_jobs
 language plpgsql
 set search_path to ''
as $function$
declare v_job video_factory.generation_jobs;
begin
  update video_factory.generation_jobs
     set status = 'DONE',
         actual_cost = coalesce(p_actual_cost, actual_cost),
         worker_id = null,
         submission_state = 'NONE',
         lease_expires_at = null,
         finished_at = now(),
         updated_at = now()
   where id = p_job_id
   returning * into v_job;
  return v_job;
end;
$function$;

create or replace function video_factory.fail_generation_job(p_job_id uuid, p_error text)
 returns video_factory.generation_jobs
 language plpgsql
 set search_path to ''
as $function$
declare v_job video_factory.generation_jobs;
begin
  update video_factory.generation_jobs
     set status = case when attempts >= max_attempts then 'DEAD' else 'PENDING' end,
         last_error = p_error,
         worker_id = null,
         submission_state = 'NONE',
         lease_expires_at = null,
         run_after = case when attempts >= max_attempts then run_after else now() + (interval '1 minute' * power(4, greatest(attempts, 1))) end,
         finished_at = case when attempts >= max_attempts then now() else null end
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$function$;

-- Deterministic recovery of stale PROCESSING jobs.
--   external job id present        -> hand to Provider Poll (never resubmit)
--   submission_state = SUBMITTING  -> quarantine for reconciliation (never resubmit)
--   otherwise                      -> safe: return to PENDING
create or replace function video_factory.recover_stale_generation_jobs(p_worker_id text, p_limit integer default 25)
 returns table (job_id uuid, action text, external_job_id text)
 language plpgsql
 set search_path to ''
as $function$
declare
  r record;
  v_ext text;
  v_action text;
begin
  for r in
    select j.id, j.external_job_id, j.submission_state, j.attempts, j.max_attempts,
           j.production_run_id, j.episode_id,
           (select a.external_job_id
              from video_factory.generation_attempts a
             where a.generation_job_id = j.id and a.external_job_id is not null
             order by a.attempt_number desc limit 1) as attempt_ext
      from video_factory.generation_jobs j
     where j.status = 'PROCESSING'
       and j.lease_expires_at is not null
       and j.lease_expires_at < now()
     order by j.lease_expires_at
     limit greatest(p_limit, 1)
     for update skip locked
  loop
    v_ext := coalesce(r.external_job_id, r.attempt_ext);

    if v_ext is not null then
      v_action := 'RECOVERED_TO_POLLING';
      update video_factory.generation_jobs j
         set external_job_id = v_ext, status = 'WAITING_PROVIDER', submission_state = 'SUBMITTED',
             worker_id = null, lease_expires_at = null, recovery_count = j.recovery_count + 1, updated_at = now()
       where j.id = r.id;
      update video_factory.generation_attempts a
         set status = 'WAITING_PROVIDER'
       where a.generation_job_id = r.id and a.external_job_id = v_ext and a.status = 'STARTED';

    elsif r.submission_state = 'SUBMITTING' then
      v_action := 'QUARANTINED_UNCERTAIN';
      update video_factory.generation_jobs j
         set status = 'FAILED', submission_state = 'UNCERTAIN', worker_id = null, lease_expires_at = null,
             last_error = 'UNCERTAIN_SUBMISSION_REQUIRES_RECONCILIATION: worker stopped during provider submission; not resubmitted',
             finished_at = now(), recovery_count = j.recovery_count + 1, updated_at = now()
       where j.id = r.id;
      update video_factory.generation_attempts a
         set status = 'FAILED',
             error_message = 'UNCERTAIN_SUBMISSION_REQUIRES_RECONCILIATION: provider may have accepted this request',
             finished_at = now()
       where a.generation_job_id = r.id and a.status = 'STARTED';

    else
      v_action := 'RETURNED_TO_PENDING';
      update video_factory.generation_jobs j
         set status = 'PENDING', worker_id = null, lease_expires_at = null, submission_state = 'NONE',
             run_after = now(), recovery_count = j.recovery_count + 1, updated_at = now()
       where j.id = r.id;
      update video_factory.generation_attempts a
         set status = 'CANCELLED', error_message = 'stale claim recovered before provider submission', finished_at = now()
       where a.generation_job_id = r.id and a.status = 'STARTED';
    end if;

    insert into video_factory.production_events
      (production_run_id, episode_id, event_type, entity_type, entity_id, severity, message, data)
    values
      (r.production_run_id, r.episode_id, 'GENERATION_RECOVERED', 'generation_job', r.id,
       case when v_action = 'QUARANTINED_UNCERTAIN' then 'ERROR' else 'WARNING' end,
       'Stale PROCESSING job recovered: ' || v_action,
       jsonb_build_object('action', v_action, 'external_job_id', v_ext, 'recovered_by', p_worker_id,
                          'attempts', r.attempts, 'max_attempts', r.max_attempts,
                          'requires_reconciliation', v_action = 'QUARANTINED_UNCERTAIN'));

    job_id := r.id; action := v_action; external_job_id := v_ext;
    return next;
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Durable asset archival
-- ---------------------------------------------------------------------------
alter table video_factory.assets
  add column if not exists storage_state text not null default 'PROVIDER_HOSTED_NOT_YET_ARCHIVED',
  add column if not exists archive_uri text,
  add column if not exists archive_storage_provider text,
  add column if not exists archive_object_key text,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_checksum text,
  add column if not exists archive_checksum_algorithm text,
  add column if not exists archive_size_bytes bigint,
  add column if not exists archive_attempts integer not null default 0,
  add column if not exists archive_worker_id text,
  add column if not exists archive_run_after timestamptz not null default now(),
  add column if not exists archive_last_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assets_storage_state_check') then
    alter table video_factory.assets
      add constraint assets_storage_state_check
      check (storage_state in ('PROVIDER_HOSTED_NOT_YET_ARCHIVED', 'ARCHIVE_PENDING', 'ARCHIVING', 'ARCHIVED', 'ARCHIVE_FAILED', 'NOT_APPLICABLE'));
  end if;
end $$;

-- One archive object per asset: a retry reuses the same key and can never fan out.
create unique index if not exists assets_archive_object_key_uidx
  on video_factory.assets (archive_object_key)
  where archive_object_key is not null;

create index if not exists assets_archive_queue_idx
  on video_factory.assets (storage_state, archive_run_after)
  where storage_state in ('ARCHIVE_PENDING', 'ARCHIVE_FAILED');

create or replace function video_factory.claim_next_asset_for_archive(p_worker_id text, p_lease_minutes integer default 10)
 returns setof video_factory.assets
 language sql
 set search_path to ''
as $function$
  update video_factory.assets
     set storage_state = 'ARCHIVING',
         archive_worker_id = p_worker_id,
         archive_attempts = archive_attempts + 1,
         archive_run_after = now() + make_interval(mins => greatest(p_lease_minutes, 1))
   where id = (
     select a.id
       from video_factory.assets a
      where a.status = 'ACTIVE'
        and a.archive_uri is null
        and a.uri is not null
        and (
          (a.storage_state in ('ARCHIVE_PENDING', 'ARCHIVE_FAILED') and a.archive_run_after <= now())
          -- a lease that expired because the archive worker stopped mid-flight
          or (a.storage_state = 'ARCHIVING' and a.archive_run_after <= now())
        )
      order by a.archive_run_after, a.created_at
      limit 1
      for update skip locked
   )
  returning *;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Runtime role grants (table/function only; no RLS policy is weakened)
-- ---------------------------------------------------------------------------
grant update (lease_expires_at, submission_state, recovery_count)
  on video_factory.generation_jobs to video_factory_runtime;

grant update (storage_state, archive_uri, archive_storage_provider, archive_object_key, archived_at,
              archive_checksum, archive_checksum_algorithm, archive_size_bytes, archive_attempts,
              archive_worker_id, archive_run_after, archive_last_error, updated_at)
  on video_factory.assets to video_factory_runtime;

grant execute on function video_factory.recover_stale_generation_jobs(text, integer) to video_factory_runtime;
grant execute on function video_factory.claim_next_asset_for_archive(text, integer) to video_factory_runtime;

-- assets already has a role-scoped SELECT/INSERT policy; archival also needs UPDATE.
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'vf_runtime_update' and polrelid = 'video_factory.assets'::regclass) then
    create policy vf_runtime_update on video_factory.assets
      for update to video_factory_runtime using (true) with check (true);
  end if;
end $$;

-- Durable storage backend lives in providers so the control plane can configure and
-- gate it from Supabase. is_active is the archival kill switch; base_url must be set
-- (e.g. https://<project-ref>.supabase.co) before archival can claim anything.
insert into video_factory.providers (slug, name, provider_type, base_url, capabilities, config, is_active)
values ('supabase_storage', 'Supabase Storage', 'STORAGE', null, array['object_storage'],
        jsonb_build_object('bucket', 'video-factory-assets',
                           'path_template', 'episodes/{episode_id}/assets/{asset_id}.{ext}',
                           'public_read', false,
                           'cache_control', 'max-age=31536000',
                           'credential', 'VIDEO_FACTORY_SUPABASE_STORAGE',
                           'managed_by', 'video-factory'),
        false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Workflow registry row for the archive worker
-- ---------------------------------------------------------------------------
insert into video_factory.workflow_definitions
  (workflow_name, version, orchestrator, trigger_type, entrypoint, config, is_active)
values
  ('asset_archive', 1, 'N8N', 'SCHEDULED', 'asset_archive_v1',
   jsonb_build_object('contract', 'claim ARCHIVE_PENDING asset -> download provider URI -> upload to durable storage -> record archive_uri',
                      'independent_of_generation', true),
   true)
on conflict (workflow_name, version) do nothing;
