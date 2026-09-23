-- Synthetic Frontier production operating system v1
-- Adds durable creative contracts, benchmark telemetry, continuity, previs and QC fields.
-- No Music Factory public objects are modified.

create table if not exists video_factory.continuity_packages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references video_factory.brands(id) on delete cascade,
  episode_id uuid references video_factory.episodes(id) on delete cascade,
  slug text not null,
  name text not null,
  subject_type text not null check (subject_type in ('ENVIRONMENT','VEHICLE','OBJECT','CHARACTER','INFRASTRUCTURE','GRAPHIC_SYSTEM','OTHER')),
  status text not null default 'DRAFT' check (status in ('DRAFT','APPROVED','SUPERSEDED','ARCHIVED')),
  canonical_description text not null,
  geometry jsonb not null default '{}'::jsonb,
  materials jsonb not null default '{}'::jsonb,
  scale_reference jsonb not null default '{}'::jsonb,
  lighting_states jsonb not null default '[]'::jsonb,
  signature_features jsonb not null default '[]'::jsonb,
  mutation_blacklist jsonb not null default '[]'::jsonb,
  reference_asset_ids uuid[] not null default '{}'::uuid[],
  prompt_anchors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create index if not exists continuity_packages_episode_idx
  on video_factory.continuity_packages(episode_id);
create index if not exists continuity_packages_status_idx
  on video_factory.continuity_packages(status);

create table if not exists video_factory.shot_briefs (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null references video_factory.shots(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','APPROVED','SUPERSEDED')),
  story_purpose text not null,
  emotional_objective text,
  shot_class text not null check (shot_class in (
    'ESTABLISHING','DISCOVERY','INVESTIGATION','MECHANISM','SCALE_TRANSITION',
    'CONSEQUENCE','FRONTIER_WONDER','EVIDENCE','GRAPHIC_EXPLANATION','TRANSITION','OTHER'
  )),
  source_mode text not null check (source_mode in (
    'REAL_FOOTAGE','ARCHIVAL','DOCUMENT','AUTHORED_GRAPHIC','COMPOSITE_RECONSTRUCTION',
    'GENERATED_VIDEO','GENERATED_IMAGE','HYBRID','OTHER'
  )),
  provenance_class text not null check (provenance_class in ('DOCUMENTED','RECONSTRUCTION','CONCEPT','SPECULATIVE')),
  rights_class text check (rights_class in ('OWNED','LICENSED','PUBLIC_DOMAIN','FAIR_USE_EDITORIAL','PERMISSION_REQUIRED','UNKNOWN')),
  shot_tier text not null default 'B' check (shot_tier in ('A','B','C')),
  camera_position text,
  lens_character text,
  framing text,
  camera_movement text,
  subject_movement text,
  environment_movement text,
  depth_parallax text,
  lighting_start text,
  lighting_evolution text,
  focus_behavior text,
  shot_endpoint text,
  transition_in text,
  transition_out text,
  target_duration_seconds numeric check (target_duration_seconds is null or target_duration_seconds > 0),
  continuity_package_id uuid references video_factory.continuity_packages(id) on delete set null,
  capability_requirements jsonb not null default '{}'::jsonb,
  negative_constraints jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  director_notes text,
  metadata jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shot_id, version)
);

create unique index if not exists shot_briefs_one_current_idx
  on video_factory.shot_briefs(shot_id)
  where is_current;
create index if not exists shot_briefs_continuity_idx
  on video_factory.shot_briefs(continuity_package_id);
create index if not exists shot_briefs_class_idx
  on video_factory.shot_briefs(shot_class, shot_tier);

create table if not exists video_factory.previsualizations (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references video_factory.episodes(id) on delete cascade,
  production_run_id uuid references video_factory.production_runs(id) on delete set null,
  scene_id uuid references video_factory.scenes(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  previs_type text not null check (previs_type in ('STORYBOARD','ANIMATIC','PAPER_EDIT','OTHER')),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','APPROVED','SUPERSEDED')),
  timeline jsonb not null default '[]'::jsonb,
  asset_id uuid references video_factory.assets(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists previsualizations_episode_idx
  on video_factory.previsualizations(episode_id, previs_type, status);
create index if not exists previsualizations_scene_idx
  on video_factory.previsualizations(scene_id);

create table if not exists video_factory.premium_spend_justifications (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references video_factory.episodes(id) on delete cascade,
  scene_id uuid references video_factory.scenes(id) on delete cascade,
  shot_id uuid references video_factory.shots(id) on delete cascade,
  generation_job_id uuid references video_factory.generation_jobs(id) on delete set null,
  canonical_model_id uuid references video_factory.canonical_models(id) on delete set null,
  reason_codes text[] not null default '{}'::text[],
  narrative_importance text not null check (narrative_importance in ('CRITICAL','HIGH','MEDIUM','LOW')),
  expected_screen_seconds numeric check (expected_screen_seconds is null or expected_screen_seconds > 0),
  capability_need jsonb not null default '{}'::jsonb,
  lower_cost_alternatives jsonb not null default '[]'::jsonb,
  insufficiency_reason text,
  expected_incremental_cost numeric check (expected_incremental_cost is null or expected_incremental_cost >= 0),
  currency text not null default 'USD',
  status text not null default 'PROPOSED' check (status in ('PROPOSED','APPROVED','REJECTED','CONSUMED','CANCELLED')),
  approved_by text,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(reason_codes) > 0)
);

create index if not exists premium_spend_episode_idx
  on video_factory.premium_spend_justifications(episode_id, status);
create index if not exists premium_spend_shot_idx
  on video_factory.premium_spend_justifications(shot_id);

create table if not exists video_factory.model_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  benchmark_key text not null,
  benchmark_version integer not null default 1 check (benchmark_version > 0),
  title text not null,
  shot_class text,
  brief jsonb not null,
  status text not null default 'PLANNED' check (status in ('PLANNED','RUNNING','COMPLETED','CANCELLED')),
  max_paid_attempts_per_model integer not null default 1 check (max_paid_attempts_per_model > 0),
  budget_cap numeric check (budget_cap is null or budget_cap >= 0),
  currency text not null default 'USD',
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (benchmark_key, benchmark_version)
);

create table if not exists video_factory.model_benchmark_results (
  id uuid primary key default gen_random_uuid(),
  benchmark_run_id uuid not null references video_factory.model_benchmark_runs(id) on delete cascade,
  canonical_model_id uuid not null references video_factory.canonical_models(id) on delete cascade,
  provider_model_offer_id uuid references video_factory.provider_model_offers(id) on delete set null,
  generation_job_id uuid references video_factory.generation_jobs(id) on delete set null,
  attempt_number integer not null default 1 check (attempt_number > 0),
  status text not null default 'PENDING' check (status in ('PENDING','GENERATED','ACCEPTED','REJECTED','FAILED','CANCELLED')),
  scores jsonb not null default '{}'::jsonb,
  accepted boolean,
  failure_codes text[] not null default '{}'::text[],
  generated_seconds numeric check (generated_seconds is null or generated_seconds >= 0),
  accepted_screen_seconds numeric check (accepted_screen_seconds is null or accepted_screen_seconds >= 0),
  generation_cost numeric check (generation_cost is null or generation_cost >= 0),
  cleanup_minutes numeric check (cleanup_minutes is null or cleanup_minutes >= 0),
  latency_seconds numeric check (latency_seconds is null or latency_seconds >= 0),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists benchmark_results_run_idx
  on video_factory.model_benchmark_results(benchmark_run_id);
create index if not exists benchmark_results_model_idx
  on video_factory.model_benchmark_results(canonical_model_id, status);

alter table video_factory.qc_reviews
  add column if not exists shot_id uuid references video_factory.shots(id) on delete cascade,
  add column if not exists generation_job_id uuid references video_factory.generation_jobs(id) on delete set null,
  add column if not exists decision text,
  add column if not exists failure_codes text[] not null default '{}'::text[],
  add column if not exists dimension_scores jsonb not null default '{}'::jsonb,
  add column if not exists repair_plan jsonb not null default '{}'::jsonb,
  add column if not exists provenance_class text,
  add column if not exists rights_class text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'qc_reviews_decision_check'
      and conrelid = 'video_factory.qc_reviews'::regclass
  ) then
    alter table video_factory.qc_reviews
      add constraint qc_reviews_decision_check
      check (decision is null or decision in ('ACCEPT','REJECT','REPAIR'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'qc_reviews_provenance_class_check'
      and conrelid = 'video_factory.qc_reviews'::regclass
  ) then
    alter table video_factory.qc_reviews
      add constraint qc_reviews_provenance_class_check
      check (provenance_class is null or provenance_class in ('DOCUMENTED','RECONSTRUCTION','CONCEPT','SPECULATIVE'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'qc_reviews_rights_class_check'
      and conrelid = 'video_factory.qc_reviews'::regclass
  ) then
    alter table video_factory.qc_reviews
      add constraint qc_reviews_rights_class_check
      check (rights_class is null or rights_class in ('OWNED','LICENSED','PUBLIC_DOMAIN','FAIR_USE_EDITORIAL','PERMISSION_REQUIRED','UNKNOWN'));
  end if;
end $$;

create index if not exists qc_reviews_shot_idx on video_factory.qc_reviews(shot_id);
create index if not exists qc_reviews_generation_job_idx on video_factory.qc_reviews(generation_job_id);
create index if not exists qc_reviews_decision_idx on video_factory.qc_reviews(decision);

alter table video_factory.continuity_packages enable row level security;
alter table video_factory.shot_briefs enable row level security;
alter table video_factory.previsualizations enable row level security;
alter table video_factory.premium_spend_justifications enable row level security;
alter table video_factory.model_benchmark_runs enable row level security;
alter table video_factory.model_benchmark_results enable row level security;

revoke all on video_factory.continuity_packages from public, anon, authenticated;
revoke all on video_factory.shot_briefs from public, anon, authenticated;
revoke all on video_factory.previsualizations from public, anon, authenticated;
revoke all on video_factory.premium_spend_justifications from public, anon, authenticated;
revoke all on video_factory.model_benchmark_runs from public, anon, authenticated;
revoke all on video_factory.model_benchmark_results from public, anon, authenticated;

comment on table video_factory.shot_briefs is 'Versioned director/cinematography contract for a planned shot.';
comment on table video_factory.continuity_packages is 'Canonical recurring environment/object/character definitions for cross-shot continuity.';
comment on table video_factory.previsualizations is 'Paper edits, storyboards and animatics approved before premium production.';
comment on table video_factory.premium_spend_justifications is 'Auditable creative rationale for premium model spend.';
comment on table video_factory.model_benchmark_runs is 'Versioned benchmark briefs for model capability testing.';
comment on table video_factory.model_benchmark_results is 'Per-model benchmark quality, cost, acceptance and failure telemetry.';
