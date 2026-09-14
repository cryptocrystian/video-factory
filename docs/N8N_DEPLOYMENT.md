# n8n Deployment Model

Video Factory treats n8n workflows as code.

## Source of truth

- GitHub repo: workflow definitions and deployment tooling
- n8n: execution runtime
- Supabase `video_factory.workflow_definitions`: runtime workflow ID registry

## Required local/VPS environment variables

Create `.env.local` outside source control with:

- `N8N_BASE_URL`
- `N8N_API_KEY`
- `FACTORY_NAMESPACE=video_factory`
- `WORKFLOW_PREFIX=VF -`
- `VIDEO_FACTORY_DB_URL`

Provider credentials remain in n8n credentials or secure environment variables. Do not commit credentials into workflow JSON.

## Commands

```bash
npm install
npm run check:n8n
npm run validate:workflows
npm run deploy:n8n
npm run export:n8n
```

## Deploy behavior

`deploy:n8n.mjs`:

1. Loads `config/factory-manifest.json`.
2. Refuses to deploy workflow names outside the `VF -` namespace.
3. Lists current n8n workflows using the public API.
4. Creates missing managed workflows or updates matching managed workflows.
5. Activates only workflows whose manifest entry explicitly has `activateOnDeploy: true`.
6. Writes the resulting n8n workflow ID back to `video_factory.workflow_definitions.external_workflow_id`.

The public n8n API is authenticated using the `X-N8N-API-KEY` header.

## Safety rules

- Never deploy or update a workflow that does not start with `VF -`.
- Never embed n8n, Supabase, provider, or database credentials in committed workflow JSON.
- Never point the deployment registry at the Music Factory domain tables.
- All database queries used by Video Factory workflows must explicitly qualify the `video_factory` schema.
- Activation is opt-in during early development.

## Current deployment sequence

1. Establish API connectivity with `npm run check:n8n`.
2. Build `VF - Episode Production v1`.
3. Validate source JSON.
4. Deploy via API.
5. Confirm `external_workflow_id` is written to Supabase.
6. Repeat for generation, polling, rendering, and publishing workers.
