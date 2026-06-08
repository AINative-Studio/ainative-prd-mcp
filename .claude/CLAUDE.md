# AINative PRD Generator MCP — Usage Guide

This MCP server generates, validates, and manages Product Requirement Documents with full AINative platform awareness.

## Available Tools (18)

### Generation
| Tool | Description |
|------|-------------|
| `prd_generate` | Generate a full PRD with AI + AINative platform context |
| `prd_generate_section` | Generate a single PRD section for iterative refinement |
| `prd_refine` | Refine an existing PRD based on feedback (version history tracked) |
| `prd_from_issue` | Generate a PRD from a GitHub issue number |

### Templates
| Tool | Description |
|------|-------------|
| `prd_list_templates` | List built-in and custom PRD templates |
| `prd_get_template` | Get a template with placeholder variables |
| `prd_create_template` | Create a custom template (persisted in ZeroDB) |
| `prd_render_template` | Render a template with variable substitution (no AI) |

### Validation
| Tool | Description |
|------|-------------|
| `prd_validate` | Validate PRD against 15 quality rules + AINative constraints |
| `prd_score` | Score PRD completeness 0-100 with grade (A-F) |
| `prd_check_api_refs` | Verify all API/service references exist in the platform |

### Memory (ZeroDB-Powered)
| Tool | Description |
|------|-------------|
| `prd_save` | Save PRD as a persistent plan artifact with version tracking |
| `prd_load` | Load a saved PRD by ID (use at session start to resume work) |
| `prd_search` | Semantic search across all saved PRDs |
| `prd_history` | Get version history showing how a PRD evolved (diffs) |

### Platform Discovery
| Tool | Description |
|------|-------------|
| `prd_list_services` | List all 22 AINative products/services with APIs |
| `prd_get_api_catalog` | Get API details for a specific service |
| `prd_suggest_stack` | Suggest AINative services for given requirements |

## Behavior Rules

1. **Use `prd_list_services` first** — before writing any PRD, discover what AINative services are available so the PRD references real platform capabilities.

2. **Always save PRDs** — after generating or refining a PRD, call `prd_save` so the user can retrieve it in future sessions.

3. **Validate before finalizing** — run `prd_validate` and `prd_check_api_refs` before declaring a PRD complete.

4. **Use AINative-specific templates** — prefer `ainative-feature` or `agent-capability` templates over `standard` when the PRD is for an AINative platform feature.

5. **Architecture compliance** — all PRDs must respect AINative constraints:
   - ZeroDB mandatory for data/memory (no third-party alternatives)
   - Service layer pattern (no business logic in API handlers)
   - 80% test coverage minimum
   - TDD approach (tests first)

## Auto-Provisioning

If no `ZERODB_API_KEY` is set, the server automatically provisions a free ZeroDB instance:
- Credentials saved to `.mcp.json` and `.env`
- A **claim URL** is printed — share this with the user so they can claim ownership
- The provisioned instance works immediately for PRD storage and search

## MCP Config

```json
{
  "mcpServers": {
    "prd-generator": {
      "command": "npx",
      "args": ["-y", "ainative-prd-mcp"],
      "env": {
        "ZERODB_API_KEY": "ak_your_key",
        "ZERODB_API_URL": "https://api.ainative.studio"
      }
    }
  }
}
```

## Auth

- `ZERODB_API_KEY=ak_...` — recommended (get one: `npx zerodb-cli init`)
- `ZERODB_USERNAME` + `ZERODB_PASSWORD` — JWT auth (auto-refreshes)
- No credentials — auto-provisions a free instance on first run
