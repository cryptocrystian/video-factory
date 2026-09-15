create or replace function video_factory.get_route_candidates(
  p_profile_slug text,
  p_routing_class text,
  p_resolution text default null,
  p_audio_included boolean default null,
  p_include_premium boolean default false
)
returns table (
  routing_rule_id uuid, rule_priority integer, rule_role text,
  canonical_model_id uuid, canonical_model_slug text, canonical_model_name text,
  quality_tier integer, provider_offer_id uuid, provider_id uuid, provider_slug text,
  provider_model_key text, endpoint_key text, pricing_basis text, unit_price numeric,
  currency text, resolution text, audio_included boolean, promotion_name text,
  reliability_score numeric, latency_score numeric, offer_capabilities jsonb
)
language sql stable set search_path = ''
as $$
  select rr.id, rr.priority, rr.role, cm.id, cm.slug, cm.name, cm.quality_tier,
         o.id, p.id, p.slug, o.provider_model_key, o.endpoint_key, o.pricing_basis,
         o.unit_price, o.currency, o.resolution, o.audio_included, o.promotion_name,
         o.reliability_score, o.latency_score, o.capabilities
  from video_factory.routing_profiles rp
  join video_factory.routing_rules rr on rr.routing_profile_id = rp.id
  join video_factory.canonical_models cm on cm.id = rr.canonical_model_id
  left join video_factory.provider_model_offers o
    on o.canonical_model_id = cm.id
   and o.is_active = true
   and (o.effective_from is null or o.effective_from <= now())
   and (o.effective_until is null or o.effective_until > now())
   and (p_resolution is null or o.resolution is null or lower(o.resolution) = lower(p_resolution))
   and (p_audio_included is null or o.audio_included is null or o.audio_included = p_audio_included)
  left join video_factory.providers p on p.id = o.provider_id and p.is_active = true
  where rp.slug = p_profile_slug and rp.is_active = true
    and rr.routing_class = p_routing_class and rr.is_active = true
    and cm.is_active = true and cm.quality_tier >= rp.minimum_quality_tier
    and (rr.role <> 'PREMIUM_EXCEPTION' or p_include_premium = true)
  order by rr.priority asc,
           o.reliability_score desc nulls last,
           case when o.unit_price is null then 1 else 0 end asc,
           o.unit_price asc nulls last,
           o.latency_score desc nulls last,
           p.slug asc nulls last;
$$;

comment on function video_factory.get_route_candidates(text,text,text,boolean,boolean) is
'Quality-first routing candidate list. Model/rule priority is evaluated before provider price.';

revoke all on function video_factory.get_route_candidates(text,text,text,boolean,boolean) from public, anon, authenticated;
