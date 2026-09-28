-- Add verified text-to-video offers required by B01 CREATIVE benchmark.
-- Pricing/capabilities verified against fal model pages on 2026-09-28.

update video_factory.canonical_models
set capabilities = capabilities || '{"text_to_video":true}'::jsonb,
    updated_at=now()
where slug='kling_3';

insert into video_factory.provider_model_offers
(provider_id,canonical_model_id,provider_model_key,endpoint_key,pricing_basis,unit_price,currency,resolution,audio_included,
 promotion_name,effective_from,effective_until,last_checked_at,pricing_source,capabilities,metadata,is_active)
select
 '0e74434e-2b9c-4469-ab20-b4833b0f2d14',
 '923fced3-9546-4977-b8af-82b236a8dafa',
 'minimax/h3-max/text-to-video','minimax/h3-max/text-to-video','PER_SECOND',0.08,'USD','1080p',false,
 'H3 Max launch promo 50% off',null,'2026-09-30T23:59:59Z',now(),
 'https://fal.ai/models/minimax/h3-max/text-to-video',
 '{"text_to_video":true,"duration_min":1,"duration_max":15,"aspect_ratio_16_9":true}'::jsonb,
 '{"benchmark_eligible":true,"price_note":"fal page states $0.08/s at 1080p during launch promo; $0.16/s after promo"}'::jsonb,true
where not exists (
 select 1 from video_factory.provider_model_offers
 where provider_id='0e74434e-2b9c-4469-ab20-b4833b0f2d14'
   and provider_model_key='minimax/h3-max/text-to-video'
   and resolution='1080p' and coalesce(audio_included,false)=false
);

insert into video_factory.provider_model_offers
(provider_id,canonical_model_id,provider_model_key,endpoint_key,pricing_basis,unit_price,currency,resolution,audio_included,
 last_checked_at,pricing_source,capabilities,metadata,is_active)
select
 '0e74434e-2b9c-4469-ab20-b4833b0f2d14',
 'bfadbcba-7f64-4adb-b068-e5d39443b4b2',
 'fal-ai/kling-video/v3/pro/text-to-video','fal-ai/kling-video/v3/pro/text-to-video','PER_SECOND',0.112,'USD',null,false,
 now(),'https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video',
 '{"text_to_video":true,"multi_shot":true,"duration_min":3,"duration_max":15,"native_audio_optional":true}'::jsonb,
 '{"benchmark_eligible":true,"tier":"pro"}'::jsonb,true
where not exists (
 select 1 from video_factory.provider_model_offers
 where provider_id='0e74434e-2b9c-4469-ab20-b4833b0f2d14'
   and provider_model_key='fal-ai/kling-video/v3/pro/text-to-video'
   and coalesce(audio_included,false)=false
);

insert into video_factory.provider_model_offers
(provider_id,canonical_model_id,provider_model_key,endpoint_key,pricing_basis,unit_price,currency,resolution,audio_included,
 last_checked_at,pricing_source,capabilities,metadata,is_active)
select
 '0e74434e-2b9c-4469-ab20-b4833b0f2d14',
 '69f77293-c41e-4740-bb81-127fb51c52e4',
 'bytedance/seedance-2.5/us/text-to-video','bytedance/seedance-2.5/us/text-to-video','PER_SECOND',1.164,'USD','1080p',false,
 now(),'https://fal.ai/models/bytedance/seedance-2.5/us/text-to-video',
 '{"text_to_video":true,"duration_min":4,"duration_max":30,"native_audio_optional":true,"high_bitrate":true}'::jsonb,
 '{"benchmark_eligible":true,"price_note":"approximate 16:9 1080p per-second rate shown by fal; token billing is authoritative"}'::jsonb,true
where not exists (
 select 1 from video_factory.provider_model_offers
 where provider_id='0e74434e-2b9c-4469-ab20-b4833b0f2d14'
   and provider_model_key='bytedance/seedance-2.5/us/text-to-video'
   and resolution='1080p' and coalesce(audio_included,false)=false
);
