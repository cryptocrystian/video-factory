update video_factory.provider_model_offers o
set resolution = null,
    metadata = o.metadata || '{"resolution_is_request_dependent":true}'::jsonb,
    updated_at = now()
from video_factory.providers p, video_factory.canonical_models cm
where o.provider_id = p.id
  and o.canonical_model_id = cm.id
  and cm.slug = 'kling_3'
  and p.slug in ('fal','kie');
