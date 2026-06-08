/**
 * PRD Template Management Tools — 4 tools
 *
 * Tools:
 *   prd_list_templates   — List available PRD templates
 *   prd_get_template     — Get a template by name
 *   prd_create_template  — Create a custom template (stored in ZeroDB)
 *   prd_render_template  — Render a template with variable substitution
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

const BUILTIN_TEMPLATES = {
  'standard': {
    name: 'standard',
    description: 'General-purpose PRD template with all standard sections',
    sections: ['Introduction', 'Problem Statement', 'Goals & Metrics', 'User Stories', 'Core Features', 'Technical Architecture', 'Constraints', 'Acceptance Criteria', 'Timeline', 'Open Questions'],
    builtin: true
  },
  'ainative-feature': {
    name: 'ainative-feature',
    description: 'AINative-specific feature PRD with service integration, architecture compliance checklist, and TDD test plan',
    sections: ['Overview', 'Platform Context', 'User Stories', 'Technical Requirements', 'Architecture Compliance', 'Test Plan', 'Acceptance Criteria', 'Rollback Plan', 'Timeline', 'Open Questions'],
    builtin: true
  },
  'agent-capability': {
    name: 'agent-capability',
    description: 'PRD for AI agent capabilities and MCP servers — tools, memory strategy, sequential thinking, hosting',
    sections: ['Capability Overview', 'MCP Server Design', 'AINative Integration', 'Sequential Thinking', 'Hosting & Deployment', 'Testing Strategy', 'Publishing', 'Open Questions'],
    builtin: true
  }
};

export const TEMPLATE_TOOLS = [
  {
    name: 'prd_list_templates',
    description: 'List all available PRD templates (built-in and custom). Each template has a specific structure optimized for different types of products and features.',
    inputSchema: {
      type: 'object',
      properties: {
        include_custom: {
          type: 'boolean',
          description: 'Include custom templates stored in ZeroDB (default: true)',
          default: true
        }
      }
    }
  },
  {
    name: 'prd_get_template',
    description: 'Get a PRD template by name. Returns the full Markdown template with placeholder variables.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Template name (e.g., "standard", "ainative-feature", "agent-capability")'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'prd_create_template',
    description: 'Create a custom PRD template. Stored persistently in ZeroDB so it survives across sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Template name (lowercase, hyphens allowed)'
        },
        description: {
          type: 'string',
          description: 'What this template is for'
        },
        content: {
          type: 'string',
          description: 'Markdown template content with {{PLACEHOLDER}} variables'
        },
        sections: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of section names in this template'
        }
      },
      required: ['name', 'description', 'content']
    }
  },
  {
    name: 'prd_render_template',
    description: 'Render a template with variable substitution (no AI, pure placeholder replacement). Fast and deterministic.',
    inputSchema: {
      type: 'object',
      properties: {
        template_name: {
          type: 'string',
          description: 'Template to render'
        },
        variables: {
          type: 'object',
          description: 'Key-value pairs for placeholder substitution (e.g., {"PRODUCT_NAME": "My Feature", "TARGET_AUDIENCE": "Developers"})',
          additionalProperties: { type: 'string' }
        }
      },
      required: ['template_name', 'variables']
    }
  }
];

export async function executeTemplateTool(toolName, args, client) {
  switch (toolName) {
    case 'prd_list_templates':
      return handleListTemplates(args, client);
    case 'prd_get_template':
      return handleGetTemplate(args, client);
    case 'prd_create_template':
      return handleCreateTemplate(args, client);
    case 'prd_render_template':
      return handleRenderTemplate(args, client);
    default:
      return null;
  }
}

async function handleListTemplates(args, client) {
  const templates = Object.values(BUILTIN_TEMPLATES);

  // Load custom templates from ZeroDB if available
  if (args.include_custom !== false && client.isAuthenticated) {
    try {
      const results = await client.searchMemory('custom prd template', 20, 'agent');
      const customs = (results.results || [])
        .filter(r => r.metadata?.type === 'prd-template')
        .map(r => ({
          name: r.metadata.template_name,
          description: r.metadata.description || 'Custom template',
          sections: r.metadata.sections || [],
          builtin: false
        }));
      templates.push(...customs);
    } catch {
      // Custom template search failed
    }
  }

  return {
    templates,
    count: templates.length,
    builtin_count: Object.keys(BUILTIN_TEMPLATES).length
  };
}

async function handleGetTemplate(args, client) {
  // Check built-in templates
  const templatePath = join(TEMPLATES_DIR, `${args.name}.md`);
  if (existsSync(templatePath)) {
    const content = readFileSync(templatePath, 'utf8');
    const meta = BUILTIN_TEMPLATES[args.name] || { name: args.name, builtin: true };
    return {
      name: args.name,
      content,
      ...meta,
      placeholders: extractPlaceholders(content)
    };
  }

  // Check custom templates in ZeroDB
  if (client.isAuthenticated) {
    try {
      const results = await client.searchMemory(`custom template ${args.name}`, 5, 'agent');
      const match = (results.results || []).find(r => r.metadata?.template_name === args.name);
      if (match) {
        return {
          name: args.name,
          content: match.content,
          description: match.metadata?.description,
          sections: match.metadata?.sections || [],
          builtin: false,
          placeholders: extractPlaceholders(match.content)
        };
      }
    } catch {
      // Search failed
    }
  }

  return { error: `Template "${args.name}" not found. Use prd_list_templates to see available templates.` };
}

async function handleCreateTemplate(args, client) {
  if (!client.isAuthenticated) {
    return { error: 'Creating custom templates requires ZeroDB credentials.' };
  }

  await client.storeMemory(
    args.content,
    'prd-generator',
    ['prd-template', 'custom', args.name],
    {
      type: 'prd-template',
      template_name: args.name,
      description: args.description,
      sections: args.sections || extractSections(args.content)
    }
  );

  return {
    success: true,
    name: args.name,
    description: args.description,
    placeholders: extractPlaceholders(args.content),
    message: `Custom template "${args.name}" saved to ZeroDB. Use prd_render_template or prd_generate with template="${args.name}" to use it.`
  };
}

async function handleRenderTemplate(args, client) {
  const templateResult = await handleGetTemplate({ name: args.template_name }, client);
  if (templateResult.error) return templateResult;

  let content = templateResult.content;
  for (const [key, value] of Object.entries(args.variables || {})) {
    const placeholder = key.startsWith('{{') ? key : `{{${key.toUpperCase()}}}`;
    content = content.replaceAll(placeholder, value);
  }

  // Find remaining unfilled placeholders
  const remaining = extractPlaceholders(content);

  return {
    content,
    template: args.template_name,
    variables_applied: Object.keys(args.variables || {}),
    unfilled_placeholders: remaining,
    message: remaining.length > 0
      ? `Template rendered with ${remaining.length} unfilled placeholders: ${remaining.join(', ')}`
      : 'Template fully rendered — all placeholders filled.'
  };
}

function extractPlaceholders(content) {
  const matches = content.match(/\{\{[A-Z_0-9]+\}\}/g) || [];
  return [...new Set(matches)];
}

function extractSections(content) {
  const matches = content.match(/^##\s+.+$/gm) || [];
  return matches.map(m => m.replace(/^##\s+\d*\.?\d*\s*/, '').trim());
}
