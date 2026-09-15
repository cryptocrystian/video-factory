insert into video_factory.canonical_models (slug, name, media_type, model_family, quality_tier, capabilities, preferred_use_cases, premium_exception, is_active, metadata)
values
  ('gpt_image_2_5_sunburst','GPT Image 2.5 Sunburst','IMAGE','GPT Image',5,'{"instruction_fidelity":true,"editing":true,"typography":true,"reference_inputs":true}'::jsonb,array['hero_frames','title_frames','editorial_graphics','precision_edits'],false,true,'{"v1_role":"primary_image"}'::jsonb),
  ('flux_2_max','FLUX 2 Max','IMAGE','FLUX',4,'{"photorealism":true,"reference_inputs":true}'::jsonb,array['photorealism','reference_diversity','image_fallback'],false,true,'{"v1_role":"secondary_image"}'::jsonb),
  ('minimax_h3_max_turbo','MiniMax H3 Max Turbo','VIDEO','MiniMax H3',4,'{"text_to_video":true,"image_to_video":true,"first_last_frame":true}'::jsonb,array['standard_cinematic_motion','volume_video'],false,true,'{"v1_role":"workhorse_video"}'::jsonb),
  ('minimax_h3_max','MiniMax H3 Max','VIDEO','MiniMax H3',4,'{"text_to_video":true,"image_to_video":true,"first_last_frame":true}'::jsonb,array['standard_cinematic_motion','quality_fallback'],false,true,'{"v1_role":"workhorse_quality_fallback"}'::jsonb),
  ('kling_3','Kling 3','VIDEO','Kling',5,'{"image_to_video":true,"multi_shot":true,"first_last_frame":true,"reference_inputs":true,"native_audio":true}'::jsonb,array['multi_shot','precise_motion','first_last_frame','complex_motion'],false,true,'{"v1_role":"motion_specialist"}'::jsonb),
  ('seedance_2_5','Seedance 2.5','VIDEO','Seedance',5,'{"text_to_video":true,"image_to_video":true,"multimodal_references":true,"long_take":true}'::jsonb,array['multimodal_reference','long_take','complex_hero_scene'],false,true,'{"v1_role":"multimodal_specialist"}'::jsonb),
  ('elevenlabs_multilingual_v2','ElevenLabs Multilingual v2','AUDIO','ElevenLabs',5,'{"tts":true,"voice_consistency":true,"multilingual":true}'::jsonb,array['documentary_narration'],false,true,'{"v1_role":"primary_narration"}'::jsonb),
  ('veo_3_1','Veo 3.1','VIDEO','Veo',5,'{"text_to_video":true,"image_to_video":true,"premium_generation":true,"native_audio":true}'::jsonb,array['premium_exception','prestige_hero_shot'],true,true,'{"v1_role":"premium_exception","requires_explicit_approval":true}'::jsonb)
on conflict (slug) do update set
  name = excluded.name,
  media_type = excluded.media_type,
  model_family = excluded.model_family,
  quality_tier = excluded.quality_tier,
  capabilities = excluded.capabilities,
  preferred_use_cases = excluded.preferred_use_cases,
  premium_exception = excluded.premium_exception,
  is_active = excluded.is_active,
  metadata = excluded.metadata,
  updated_at = now();

insert into video_factory.providers (slug, name, provider_type, capabilities, config, is_active)
values
  ('fal','fal','MULTIMODAL',array['image','video','audio'],'{"role":"production_aggregator","credentials":"external"}'::jsonb,true),
  ('kie','Kie','MULTIMODAL',array['image','video','audio'],'{"role":"production_aggregator","credentials":"external","pricing":"dynamic_promotions_expected"}'::jsonb,true)
on conflict (slug) do update set
  name = excluded.name,
  provider_type = excluded.provider_type,
  capabilities = excluded.capabilities,
  config = excluded.config,
  is_active = excluded.is_active,
  updated_at = now();

update video_factory.providers
set is_active = false,
    config = config || '{"role":"interactive_mcp_prototype","production_api":false}'::jsonb,
    updated_at = now()
where slug = 'higgsfield';

update video_factory.provider_models pm
set is_active = false, updated_at = now()
from video_factory.providers p
where pm.provider_id = p.id and p.slug = 'higgsfield';

insert into video_factory.provider_adapters (provider_id, adapter_mode, auth_secret_ref, submit_operation, poll_operation, cancel_operation, supports_webhooks, supports_cancel, request_mapping, response_mapping, event_mapping, timeout_seconds, poll_interval_seconds, max_poll_minutes, config, is_active)
select p.id, 'ASYNC',
       case p.slug when 'fal' then 'VIDEO_FACTORY_FAL' when 'kie' then 'VIDEO_FACTORY_KIE' end,
       'submit', 'poll', 'cancel', true, false,
       '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
       900, 15, 30,
       jsonb_build_object('managed_by','video-factory','activation_requires_verified_credentials',true),
       false
from video_factory.providers p
where p.slug in ('fal','kie')
on conflict (provider_id) do update set
  adapter_mode = excluded.adapter_mode,
  auth_secret_ref = excluded.auth_secret_ref,
  submit_operation = excluded.submit_operation,
  poll_operation = excluded.poll_operation,
  cancel_operation = excluded.cancel_operation,
  supports_webhooks = excluded.supports_webhooks,
  supports_cancel = excluded.supports_cancel,
  config = excluded.config,
  is_active = false,
  updated_at = now();

update video_factory.provider_adapters pa
set is_active = false,
    auth_secret_ref = null,
    config = pa.config || '{"mode":"MCP_INTERACTIVE_ONLY","production_api":false}'::jsonb,
    updated_at = now()
from video_factory.providers p
where pa.provider_id = p.id and p.slug = 'higgsfield';

insert into video_factory.routing_profiles (brand_id, slug, name, selection_strategy, minimum_quality_tier, allow_provider_fallback, allow_model_fallback, allow_premium_exception, config, is_active)
select b.id, 'synthetic-frontier-v1', 'Synthetic Frontier Quality-First v1', 'QUALITY_FIRST', 4, true, true, false,
       '{"selection_order":["quality_threshold","capability_match","provider_reliability","effective_price","latency"],"provider_policy":{"allow_promotions":true,"discounts_may_break_provider_ties":true,"never_lower_model_quality_for_discount":true},"asset_policy":{"reuse_approved_assets":true,"regenerate_only_when_required":true},"premium_exception":{"requires_explicit_approval":true}}'::jsonb,
       true
from video_factory.brands b
where b.slug = 'synthetic-frontier'
on conflict (brand_id, slug) do update set
  name = excluded.name,
  selection_strategy = excluded.selection_strategy,
  minimum_quality_tier = excluded.minimum_quality_tier,
  allow_provider_fallback = excluded.allow_provider_fallback,
  allow_model_fallback = excluded.allow_model_fallback,
  allow_premium_exception = excluded.allow_premium_exception,
  config = excluded.config,
  is_active = excluded.is_active,
  updated_at = now();

with rp as (
  select id from video_factory.routing_profiles where slug='synthetic-frontier-v1' and brand_id=(select id from video_factory.brands where slug='synthetic-frontier')
), desired(routing_class, media_type, model_slug, priority, role, requirements, max_cost_multiplier) as (
  values
    ('STATIC_HERO','IMAGE','gpt_image_2_5_sunburst',1,'PRIMARY','{"quality_floor":"premium","use_for":["hero","title","editorial_graphic"]}'::jsonb,null::numeric),
    ('STATIC_HERO','IMAGE','flux_2_max',2,'FALLBACK','{"quality_floor":"high"}'::jsonb,null::numeric),
    ('STANDARD_CINEMATIC_MOTION','VIDEO','minimax_h3_max_turbo',1,'PRIMARY','{"quality_floor":"high","volume_eligible":true}'::jsonb,null::numeric),
    ('STANDARD_CINEMATIC_MOTION','VIDEO','minimax_h3_max',2,'FALLBACK','{"quality_floor":"high","use_when":"turbo_quality_gate_fails"}'::jsonb,null::numeric),
    ('STANDARD_CINEMATIC_MOTION','VIDEO','kling_3',3,'FALLBACK','{"quality_floor":"premium"}'::jsonb,null::numeric),
    ('PRECISE_MULTI_SHOT','VIDEO','kling_3',1,'PRIMARY','{"requires_any":["multi_shot","first_last_frame","precise_motion"]}'::jsonb,null::numeric),
    ('PRECISE_MULTI_SHOT','VIDEO','seedance_2_5',2,'FALLBACK','{"quality_floor":"premium"}'::jsonb,null::numeric),
    ('HEAVY_MULTIMODAL','VIDEO','seedance_2_5',1,'PRIMARY','{"requires_any":["multimodal_references","long_take","complex_hero_scene"]}'::jsonb,null::numeric),
    ('HEAVY_MULTIMODAL','VIDEO','kling_3',2,'FALLBACK','{"quality_floor":"premium"}'::jsonb,null::numeric),
    ('PREMIUM_EXCEPTION','VIDEO','veo_3_1',1,'PREMIUM_EXCEPTION','{"requires_explicit_approval":true,"only_when_other_routes_fail_quality_gate":true}'::jsonb,null::numeric),
    ('NARRATION','AUDIO','elevenlabs_multilingual_v2',1,'PRIMARY','{"quality_floor":"premium","voice_consistency_required":true}'::jsonb,null::numeric)
)
insert into video_factory.routing_rules (routing_profile_id, routing_class, media_type, canonical_model_id, priority, role, requirements, max_cost_multiplier, is_active)
select rp.id, d.routing_class, d.media_type, cm.id, d.priority, d.role, d.requirements, d.max_cost_multiplier, true
from desired d cross join rp join video_factory.canonical_models cm on cm.slug=d.model_slug
on conflict (routing_profile_id, routing_class, priority) do update set
  media_type = excluded.media_type,
  canonical_model_id = excluded.canonical_model_id,
  role = excluded.role,
  requirements = excluded.requirements,
  max_cost_multiplier = excluded.max_cost_multiplier,
  is_active = true,
  updated_at = now();

update video_factory.brands b
set config = b.config || jsonb_build_object('routing', jsonb_build_object('profile','synthetic-frontier-v1','doctrine','QUALITY_FIRST','cost_role','provider_tiebreaker_after_quality_and_reliability','premium_exception_requires_approval',true)),
    updated_at = now()
where b.slug='synthetic-frontier';
