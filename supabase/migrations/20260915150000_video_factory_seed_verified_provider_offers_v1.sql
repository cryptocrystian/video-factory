-- Seed only provider/model mappings verified against current public provider documentation.
-- Kie prices intentionally remain null because promotions and current effective rates are dynamic.

insert into video_factory.canonical_models (slug, name, media_type, model_family, quality_tier, capabilities, preferred_use_cases, premium_exception, is_active, metadata)
values (
  'minimax_h3', 'MiniMax H3', 'VIDEO', 'MiniMax H3', 4,
  '{"text_to_video":true,"image_to_video":true}'::jsonb,
  array['alternate_volume_video','provider_diversity'], false, true,
  '{"v1_role":"unrouted_alternative","note":"Kie upstream model; do not conflate with fal post-trained H3 Max variants"}'::jsonb
)
on conflict (slug) do update set
  name=excluded.name, media_type=excluded.media_type, model_family=excluded.model_family,
  quality_tier=excluded.quality_tier, capabilities=excluded.capabilities,
  preferred_use_cases=excluded.preferred_use_cases, premium_exception=excluded.premium_exception,
  is_active=excluded.is_active, metadata=excluded.metadata, updated_at=now();

with p as (select id from video_factory.providers where slug='fal'),
     m as (select id, slug from video_factory.canonical_models)
insert into video_factory.provider_model_offers
(provider_id, canonical_model_id, provider_model_key, endpoint_key, pricing_basis, unit_price, currency, resolution, audio_included, promotion_name, effective_from, effective_until, last_checked_at, pricing_source, capabilities, metadata, is_active)
select p.id, m.id, v.provider_model_key, v.endpoint_key, v.pricing_basis, v.unit_price, 'USD', v.resolution, v.audio_included, null, timestamptz '2026-09-15 00:00:00+00', null, now(), v.pricing_source, v.capabilities, v.metadata, true
from p cross join lateral (values
  ('gpt_image_2_5_sunburst','openai/gpt-image-2.5/sunburst/text-to-image','openai/gpt-image-2.5/sunburst/text-to-image','PER_IMAGE',0.03960::numeric,'1920x1080',null::boolean,'https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image','{"mode":"text_to_image","quality":"high"}'::jsonb,'{"verified_on":"2026-09-15"}'::jsonb),
  ('gpt_image_2_5_sunburst','openai/gpt-image-2.5/sunburst/text-to-image','openai/gpt-image-2.5/sunburst/text-to-image','PER_IMAGE',0.05529::numeric,'2560x1440',null::boolean,'https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image','{"mode":"text_to_image","quality":"high"}'::jsonb,'{"verified_on":"2026-09-15"}'::jsonb),
  ('gpt_image_2_5_sunburst','openai/gpt-image-2.5/sunburst/edit','openai/gpt-image-2.5/sunburst/edit','PER_IMAGE',0.03960::numeric,'1920x1080',null::boolean,'https://fal.ai/models/openai/gpt-image-2.5/sunburst/edit','{"mode":"image_edit","quality":"high"}'::jsonb,'{"verified_on":"2026-09-15","includes_one_input_image":true}'::jsonb),
  ('flux_2_max','fal-ai/flux-2-max','fal-ai/flux-2-max','UNKNOWN',null::numeric,null::text,null::boolean,'https://fal.ai/models/fal-ai/flux-2-max','{"mode":"text_to_image"}'::jsonb,'{"verified_model_mapping":true,"price_pending_sync":true,"verified_on":"2026-09-15"}'::jsonb),
  ('flux_2_max','fal-ai/flux-2-max/edit','fal-ai/flux-2-max/edit','UNKNOWN',null::numeric,null::text,null::boolean,'https://fal.ai/models/fal-ai/flux-2-max/edit','{"mode":"image_edit"}'::jsonb,'{"verified_model_mapping":true,"price_pending_sync":true,"verified_on":"2026-09-15"}'::jsonb),
  ('minimax_h3_max_turbo','minimax/h3-max-turbo/image-to-video','minimax/h3-max-turbo/image-to-video','PER_SECOND',0.04::numeric,'768p',false,'https://fal.ai/minimax-h3-max','{"mode":"image_to_video"}'::jsonb,'{"post_trained_by_fal":true,"verified_on":"2026-09-15"}'::jsonb),
  ('minimax_h3_max_turbo','minimax/h3-max-turbo/image-to-video','minimax/h3-max-turbo/image-to-video','PER_SECOND',0.08::numeric,'1080p',false,'https://fal.ai/minimax-h3-max','{"mode":"image_to_video"}'::jsonb,'{"post_trained_by_fal":true,"verified_on":"2026-09-15"}'::jsonb),
  ('minimax_h3_max_turbo','minimax/h3-max-turbo/text-to-video','minimax/h3-max-turbo/text-to-video','PER_SECOND',0.04::numeric,'768p',false,'https://fal.ai/minimax-h3-max','{"mode":"text_to_video"}'::jsonb,'{"post_trained_by_fal":true,"verified_on":"2026-09-15"}'::jsonb),
  ('minimax_h3_max','minimax/h3-max/image-to-video','minimax/h3-max/image-to-video','PER_SECOND',0.08::numeric,'768p',false,'https://fal.ai/minimax-h3-max','{"mode":"image_to_video"}'::jsonb,'{"post_trained_by_fal":true,"verified_on":"2026-09-15"}'::jsonb),
  ('minimax_h3_max','minimax/h3-max/image-to-video','minimax/h3-max/image-to-video','PER_SECOND',0.16::numeric,'1080p',false,'https://fal.ai/minimax-h3-max','{"mode":"image_to_video"}'::jsonb,'{"post_trained_by_fal":true,"verified_on":"2026-09-15"}'::jsonb),
  ('kling_3','fal-ai/kling-video/v3/pro/image-to-video','fal-ai/kling-video/v3/pro/image-to-video','PER_SECOND',0.112::numeric,'pro',false,'https://fal.ai/explore/image-to-video-apis','{"mode":"image_to_video","tier":"pro"}'::jsonb,'{"verified_on":"2026-09-15"}'::jsonb),
  ('kling_3','fal-ai/kling-video/v3/pro/image-to-video','fal-ai/kling-video/v3/pro/image-to-video','PER_SECOND',0.168::numeric,'pro',true,'https://fal.ai/explore/image-to-video-apis','{"mode":"image_to_video","tier":"pro","native_audio":true}'::jsonb,'{"verified_on":"2026-09-15"}'::jsonb),
  ('seedance_2_5','bytedance/seedance-2.5/image-to-video','bytedance/seedance-2.5/image-to-video','PER_SECOND',0.4730::numeric,'720p',true,'https://fal.ai/models/bytedance/seedance-2.5/image-to-video','{"mode":"image_to_video","native_audio":true,"duration_max_seconds":30}'::jsonb,'{"approximate_unit_rate":true,"token_formula_authoritative":true,"verified_on":"2026-09-15"}'::jsonb),
  ('seedance_2_5','bytedance/seedance-2.5/reference-to-video','bytedance/seedance-2.5/reference-to-video','PER_SECOND',0.4730::numeric,'720p',true,'https://fal.ai/models/bytedance/seedance-2.5/reference-to-video','{"mode":"reference_to_video","native_audio":true,"max_references":50,"duration_max_seconds":30}'::jsonb,'{"approximate_unit_rate":true,"token_formula_authoritative":true,"video_reference_pricing_differs":true,"verified_on":"2026-09-15"}'::jsonb),
  ('veo_3_1','fal-ai/veo3.1','fal-ai/veo3.1','PER_SECOND',0.20::numeric,'1080p',false,'https://fal.ai/veo-3.1','{"mode":"text_to_video","tier":"standard"}'::jsonb,'{"synthid":true,"verified_on":"2026-09-15"}'::jsonb),
  ('veo_3_1','fal-ai/veo3.1','fal-ai/veo3.1','PER_SECOND',0.40::numeric,'1080p',true,'https://fal.ai/veo-3.1','{"mode":"text_to_video","tier":"standard","native_audio":true}'::jsonb,'{"synthid":true,"verified_on":"2026-09-15"}'::jsonb),
  ('veo_3_1','fal-ai/veo3.1/fast','fal-ai/veo3.1/fast','PER_SECOND',0.10::numeric,'1080p',false,'https://fal.ai/veo-3.1','{"mode":"text_to_video","tier":"fast"}'::jsonb,'{"synthid":true,"verified_on":"2026-09-15"}'::jsonb),
  ('veo_3_1','fal-ai/veo3.1/fast','fal-ai/veo3.1/fast','PER_SECOND',0.15::numeric,'1080p',true,'https://fal.ai/veo-3.1','{"mode":"text_to_video","tier":"fast","native_audio":true}'::jsonb,'{"synthid":true,"verified_on":"2026-09-15"}'::jsonb),
  ('elevenlabs_multilingual_v2','fal-ai/elevenlabs/tts/multilingual-v2','fal-ai/elevenlabs/tts/multilingual-v2','PER_CHARACTER',0.0001::numeric,null::text,null::boolean,'https://fal.ai/models/fal-ai/elevenlabs/tts/multilingual-v2','{"mode":"tts"}'::jsonb,'{"equivalent_rate":"0.10 USD per 1000 characters","verified_on":"2026-09-15"}'::jsonb)
) as v(model_slug,provider_model_key,endpoint_key,pricing_basis,unit_price,resolution,audio_included,pricing_source,capabilities,metadata)
join m on m.slug=v.model_slug;

with p as (select id from video_factory.providers where slug='kie'),
     m as (select id, slug from video_factory.canonical_models)
insert into video_factory.provider_model_offers
(provider_id, canonical_model_id, provider_model_key, endpoint_key, pricing_basis, unit_price, currency, resolution, audio_included, promotion_name, effective_from, effective_until, last_checked_at, pricing_source, capabilities, metadata, is_active)
select p.id, m.id, v.provider_model_key, 'https://api.kie.ai/api/v1/jobs/createTask', 'UNKNOWN', null, 'USD', v.resolution, v.audio_included, null, now(), null, now(), v.pricing_source, v.capabilities,
       v.metadata || '{"price_pending_sync":true,"dynamic_pricing":true}'::jsonb, true
from p cross join lateral (values
  ('gpt_image_2_5_sunburst','gpt-image-2-5-sunburst-text-to-image','2K',null::boolean,'https://docs.kie.ai/43286810e0','{"mode":"text_to_image","callback":true}'::jsonb,'{"verified_on":"2026-09-15"}'::jsonb),
  ('gpt_image_2_5_sunburst','gpt-image-2-5-sunburst-image-to-image','2K',null::boolean,'https://docs.kie.ai/43287109e0','{"mode":"image_to_image","callback":true}'::jsonb,'{"verified_on":"2026-09-15"}'::jsonb),
  ('minimax_h3','minimax-h3/text-to-video',null::text,false,'https://docs.kie.ai','{"mode":"text_to_video","callback":true}'::jsonb,'{"verified_on":"2026-09-15","not_equivalent_to_fal_h3_max":true}'::jsonb),
  ('kling_3','kling-3.0/video','pro',false,'https://docs.kie.ai/market/kling/kling-3-0','{"mode":"video","multi_shot":true,"first_last_frame":true,"elements":true,"callback":true}'::jsonb,'{"verified_on":"2026-09-15"}'::jsonb),
  ('seedance_2_5','bytedance/seedance-2-5','720p',false,'https://docs.kie.ai/market/bytedance/seedance-2-5','{"mode":"multimodal_video","reference_images":true,"reference_video":true,"reference_audio":true,"callback":true}'::jsonb,'{"verified_on":"2026-09-15"}'::jsonb),
  ('elevenlabs_multilingual_v2','elevenlabs/text-to-speech-multilingual-v2',null::text,null::boolean,'https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2','{"mode":"tts","callback":true}'::jsonb,'{"verified_on":"2026-09-15"}'::jsonb),
  ('veo_3_1','veo-3-1','1080p',true,'https://docs.kie.ai/veo3-api/generate-veo-3-video','{"mode":"video","quality_fast_lite_variants":true,"callback":true}'::jsonb,'{"verified_on":"2026-09-15","provider_optimized_wrapper":true,"pricing_claim":"25% of Google direct pricing; exact current unit price pending sync"}'::jsonb)
) as v(model_slug,provider_model_key,resolution,audio_included,pricing_source,capabilities,metadata)
join m on m.slug=v.model_slug;
