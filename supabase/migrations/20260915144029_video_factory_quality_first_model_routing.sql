create table video_factory.canonical_models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  media_type text not null check (media_type in ('IMAGE','VIDEO','AUDIO','TEXT','MULTIMODAL','OTHER')),
  model_family text,
  quality_tier integer not null default 3 check (quality_tier between 1 and 5),
  capabilities jsonb not null default '{}'::jsonb,
  preferred_use_cases text[] not null default '{}'::text[],
  premium_exception boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table video_factory.routing_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references video_factory.brands(id) on delete cascade,
  slug text not null,
  name text not null,
  selection_strategy text not null default 'QUALITY_FIRST' check (selection_strategy in ('QUALITY_FIRST','BALANCED','COST_FIRST','MANUAL')),
  minimum_quality_tier integer not null default 3 check (minimum_quality_tier between 1 and 5),
  allow_provider_fallback boolean not null default true,
  allow_model_fallback boolean not null default true,
  allow_premium_exception boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create table video_factory.routing_rules (
  id uuid primary key default gen_random_uuid(),
  routing_profile_id uuid not null references video_factory.routing_profiles(id) on delete cascade,
  routing_class text not null,
  media_type text not null check (media_type in ('IMAGE','VIDEO','AUDIO','TEXT','MULTIMODAL','OTHER')),
  canonical_model_id uuid not null references video_factory.canonical_models(id) on delete restrict,
  priority integer not null check (priority > 0),
  role text not null default 'PRIMARY' check (role in ('PRIMARY','FALLBACK','PREMIUM_EXCEPTION')),
  requirements jsonb not null default '{}'::jsonb,
  max_cost_multiplier numeric check (max_cost_multiplier is null or max_cost_multiplier > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routing_profile_id, routing_class, priority)
);

create table video_factory.provider_model_offers (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references video_factory.providers(id) on delete cascade,
  canonical_model_id uuid not null references video_factory.canonical_models(id) on delete cascade,
  provider_model_id uuid references video_factory.provider_models(id) on delete set null,
  provider_model_key text,
  endpoint_key text,
  pricing_basis text not null default 'UNKNOWN' check (pricing_basis in ('PER_SECOND','PER_IMAGE','PER_CHARACTER','PER_TOKEN','PER_REQUEST','CREDITS','UNKNOWN')),
  unit_price numeric check (unit_price is null or unit_price >= 0),
  currency text not null default 'USD',
  resolution text,
  audio_included boolean,
  promotion_name text,
  effective_from timestamptz,
  effective_until timestamptz,
  last_checked_at timestamptz,
  pricing_source text,
  quality_score numeric check (quality_score is null or (quality_score >= 0 and quality_score <= 100)),
  reliability_score numeric check (reliability_score is null or (reliability_score >= 0 and reliability_score <= 100)),
  latency_score numeric check (latency_score is null or (latency_score >= 0 and latency_score <= 100)),
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table video_factory.shots
  add column routing_profile_id uuid references video_factory.routing_profiles(id) on delete set null,
  add column routing_class text,
  add column routing_requirements jsonb not null default '{}'::jsonb;

alter table video_factory.generation_jobs
  add column canonical_model_id uuid references video_factory.canonical_models(id) on delete set null,
  add column provider_model_offer_id uuid references video_factory.provider_model_offers(id) on delete set null,
  add column routing_decision jsonb not null default '{}'::jsonb;

create index canonical_models_media_active_idx on video_factory.canonical_models(media_type, is_active);
create index routing_profiles_brand_active_idx on video_factory.routing_profiles(brand_id, is_active);
create index routing_rules_profile_class_idx on video_factory.routing_rules(routing_profile_id, routing_class, is_active, priority);
create index routing_rules_model_idx on video_factory.routing_rules(canonical_model_id);
create index provider_model_offers_model_active_idx on video_factory.provider_model_offers(canonical_model_id, is_active);
create index provider_model_offers_provider_idx on video_factory.provider_model_offers(provider_id);
create index provider_model_offers_provider_model_idx on video_factory.provider_model_offers(provider_model_id);
create index provider_model_offers_effective_idx on video_factory.provider_model_offers(effective_from, effective_until);
create index shots_routing_profile_idx on video_factory.shots(routing_profile_id);
create index generation_jobs_canonical_model_idx on video_factory.generation_jobs(canonical_model_id);
create index generation_jobs_offer_idx on video_factory.generation_jobs(provider_model_offer_id);

create trigger canonical_models_set_updated_at before update on video_factory.canonical_models for each row execute function video_factory.set_updated_at();
create trigger routing_profiles_set_updated_at before update on video_factory.routing_profiles for each row execute function video_factory.set_updated_at();
create trigger routing_rules_set_updated_at before update on video_factory.routing_rules for each row execute function video_factory.set_updated_at();
create trigger provider_model_offers_set_updated_at before update on video_factory.provider_model_offers for each row execute function video_factory.set_updated_at();

alter table video_factory.canonical_models enable row level security;
alter table video_factory.routing_profiles enable row level security;
alter table video_factory.routing_rules enable row level security;
alter table video_factory.provider_model_offers enable row level security;

revoke all on table video_factory.canonical_models from public, anon, authenticated;
revoke all on table video_factory.routing_profiles from public, anon, authenticated;
revoke all on table video_factory.routing_rules from public, anon, authenticated;
revoke all on table video_factory.provider_model_offers from public, anon, authenticated;
revoke all on all sequences in schema video_factory from public, anon, authenticated;
