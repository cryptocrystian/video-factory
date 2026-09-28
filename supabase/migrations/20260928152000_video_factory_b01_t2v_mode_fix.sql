-- Ensure text-to-video offers advertise the routing mode expected by the runtime.
update video_factory.provider_model_offers
set capabilities = capabilities || '{"mode":"text_to_video"}'::jsonb,
    updated_at=now()
where provider_id='0e74434e-2b9c-4469-ab20-b4833b0f2d14'
  and provider_model_key in (
    'minimax/h3-max/text-to-video',
    'fal-ai/kling-video/v3/pro/text-to-video',
    'bytedance/seedance-2.5/us/text-to-video'
  );