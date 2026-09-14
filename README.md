# Video Factory

Provider-agnostic AI video production factory for Synthetic Frontier and future media brands.

## Architecture

- **GitHub**: source of truth for workflow definitions, deployment code, provider adapters, and docs
- **Supabase**: durable production state in the isolated `video_factory` schema
- **n8n**: orchestration runtime
- **Providers**: interchangeable image/video/audio generation services
- **ChatGPT project**: operating/control plane for architecture and maintenance

## Isolation

The Supabase project is shared with Music Factory for cost efficiency, but Video Factory is isolated in the `video_factory` schema. Do not modify existing objects in `public` from this repo.

## Current first production

Synthetic Frontier — Episode 2: **Nobody Knows How to Build AGI**

## Repository layout

- `workflows/` — n8n workflow JSON source
- `scripts/` — deployment/export/validation tooling
- `provider-adapters/` — normalized provider integration contracts and implementations
- `config/` — factory and workflow manifests
- `docs/` — architecture and operational documentation
- `supabase/` — migration references and schema documentation

## Deployment principle

Workflows are deployed programmatically through the n8n API. Manual JSON import is fallback-only.
