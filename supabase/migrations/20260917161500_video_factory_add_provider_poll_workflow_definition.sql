insert into video_factory.workflow_definitions (
  workflow_name,
  version,
  orchestrator,
  trigger_type,
  entrypoint,
  config,
  is_active
)
values (
  'provider_poll',
  1,
  'N8N',
  'MANUAL',
  'provider_poll_v1',
  jsonb_build_object(
    'adapter_contract', 'poll WAITING_PROVIDER jobs -> normalize result -> persist asset/lineage/cost -> complete or fail',
    'retry_via_database', true
  ),
  true
)
on conflict (workflow_name, version) do nothing;
