# External Production Skills

These sources are installed as pinned Git submodules for review and selective integration into Video Factory.

Video Factory remains the orchestration and control plane. External skills may not bypass provider routing, spend authorization, cost ledger, polling, archival, provenance, or QC.

| Local path | Upstream | Pinned commit | Relevant skill path | Use |
|---|---|---|---|---|
| `smixs-visual-skills` | `smixs/visual-skills` | `92be33a5a73325fb3d8e0c73b22744b114e2a90e` | `video/`, `image/` | directing, cinematography, storyboards, model-specific prompting |
| `creative-director` | `smixs/creative-director-skill` | `ac06eb255371da35d1db0a146dbfcca8c8857543` | `creative-director/` | ideation and narrative development |
| `director-story-to-video` | `artokun/comfyui-mcp` | `1d5b12b1b499a7358ac614ffb41b736a0817f855` | `plugin/skills/director/` | Hero Frame, continuity, state and scene retry architecture |
| `remotion-skills` | `remotion-dev/skills` | `9682e994989f951c75912fbc49aa10332a512685` | repository skills | deterministic graphics and render guidance |
| `kie-video-generator` | `dandacompany/dantelabs-agentic-school` | `9e86720814ebe6ff3aa321db26a94d8d2a7958bb` | `plugins/common/skills/kie-video-generator/` | Kie model/API reference only; production calls remain inside Video Factory |

## Hero Frame

The Hero Frame / Story-to-Video architecture is the Director skill in `artokun/comfyui-mcp`; it is not treated as a second competing runtime director.

## Clone

```bash
git clone --recurse-submodules https://github.com/cryptocrystian/video-factory.git
git submodule update --init --recursive
```

## Policy

- Preserve upstream licensing and attribution.
- External router/model recommendations are priors until Video Factory benchmarks them.
- Do not run multiple competing director/router skills blindly.
- Paid generation still requires Video Factory authorization and logging.
