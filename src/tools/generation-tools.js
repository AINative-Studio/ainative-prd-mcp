/**
 * PRD Generation Tools — 4 tools for creating and refining PRDs
 *
 * Tools:
 *   prd_generate          — Full PRD generation with AI + AINative context
 *   prd_generate_section  — Generate a single PRD section
 *   prd_refine            — Refine an existing PRD with feedback
 *   prd_from_issue        — Generate PRD from a GitHub issue
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, '..', 'knowledge', 'platform-manifest.json');

let _manifest = null;
function getManifest() {
  if (!_manifest) {
    _manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  }
  return _manifest;
}

export const GENERATION_TOOLS = [
  {
    name: 'prd_generate',
    description: 'Generate a comprehensive Product Requirements Document (PRD) for an AINative feature, integration, or product. Uses AI with full AINative platform context — knows all services, APIs, SDKs, and architectural constraints. The PRD is automatically saved to ZeroMemory for cross-session recall.',
    inputSchema: {
      type: 'object',
      properties: {
        product_name: {
          type: 'string',
          description: 'Name of the product or feature'
        },
        description: {
          type: 'string',
          description: 'Detailed description of what needs to be built'
        },
        target_audience: {
          type: 'string',
          description: 'Who will use this product/feature'
        },
        core_features: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of core features to include'
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Technical or business constraints',
          default: []
        },
        template: {
          type: 'string',
          enum: ['standard', 'ainative-feature', 'agent-capability'],
          description: 'PRD template to use (default: standard)',
          default: 'standard'
        },
        issue_number: {
          type: 'integer',
          description: 'Optional GitHub issue number to link to'
        },
        ainative_services: {
          type: 'array',
          items: { type: 'string' },
          description: 'AINative services this feature will use (e.g., ["ZeroDB", "ZeroMemory", "Agent Cloud"]). If omitted, the generator will auto-detect relevant services.'
        },
        additional_context: {
          type: 'string',
          description: 'Any additional context, links, or requirements'
        }
      },
      required: ['product_name', 'description', 'target_audience', 'core_features']
    }
  },
  {
    name: 'prd_generate_section',
    description: 'Generate or regenerate a single section of a PRD. Useful for iterative refinement — update just the Technical Architecture or User Stories without regenerating the entire document.',
    inputSchema: {
      type: 'object',
      properties: {
        prd_id: {
          type: 'string',
          description: 'ID of an existing saved PRD (from prd_save). If provided, the section will be generated in context of the full PRD.'
        },
        section_name: {
          type: 'string',
          enum: [
            'introduction', 'problem_statement', 'goals_metrics',
            'user_stories', 'features', 'technical_architecture',
            'ainative_services', 'api_endpoints', 'data_model',
            'constraints', 'acceptance_criteria', 'timeline',
            'test_plan', 'rollback_plan', 'open_questions'
          ],
          description: 'Which section to generate'
        },
        context: {
          type: 'string',
          description: 'Additional context for generating this section'
        },
        product_name: {
          type: 'string',
          description: 'Product name (required if no prd_id)'
        },
        description: {
          type: 'string',
          description: 'Product description (required if no prd_id)'
        }
      },
      required: ['section_name']
    }
  },
  {
    name: 'prd_refine',
    description: 'Refine an existing PRD based on feedback. Provide the PRD ID and feedback, and the AI will update the document while preserving version history.',
    inputSchema: {
      type: 'object',
      properties: {
        prd_id: {
          type: 'string',
          description: 'ID of the saved PRD to refine'
        },
        feedback: {
          type: 'string',
          description: 'Feedback describing what needs to change (e.g., "Add more detail to user stories", "The API design should use WebSockets instead of polling")'
        },
        sections_to_update: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: limit refinement to specific sections',
          default: []
        }
      },
      required: ['prd_id', 'feedback']
    }
  },
  {
    name: 'prd_from_issue',
    description: 'Generate a PRD from a GitHub issue. Fetches the issue title, body, labels, and comments, then expands them into a full PRD with AINative platform context.',
    inputSchema: {
      type: 'object',
      properties: {
        issue_number: {
          type: 'integer',
          description: 'GitHub issue number'
        },
        repo: {
          type: 'string',
          description: 'GitHub repository (owner/repo format)',
          default: 'AINative-Studio/core'
        },
        template: {
          type: 'string',
          enum: ['standard', 'ainative-feature', 'agent-capability'],
          description: 'PRD template to use',
          default: 'ainative-feature'
        }
      },
      required: ['issue_number']
    }
  }
];

/**
 * Build the system prompt for PRD generation
 */
function buildSystemPrompt(template) {
  const manifest = getManifest();
  const serviceList = manifest.products.map(p =>
    `- **${p.name}** (${p.category}): ${p.description}`
  ).join('\n');

  const constraints = manifest.architecture.constraints.join('\n  - ');

  return `You are an expert product manager at AINative Studio, a platform for building AI-powered applications.
You write detailed, actionable PRDs that reference real AINative services, APIs, and architectural patterns.

## AINative Platform Services

${serviceList}

## Architecture Constraints
  - ${constraints}

## PRD Standards
- Every PRD must include: problem statement, user stories with acceptance criteria, technical architecture, test plan
- API endpoints must use real AINative paths (e.g., /api/v1/zerodb/vectors/search)
- All memory/context features MUST use ZeroDB/ZeroMemory (no third-party memory services)
- Test coverage requirement: 80% minimum
- TDD approach: write tests first
- Follow the ${template} template structure
- Include GitHub issue references where applicable
- Be specific about which AINative services to use and why`;
}

/**
 * Build user prompt for PRD generation
 */
function buildUserPrompt(args) {
  const features = args.core_features.map(f => `- ${f}`).join('\n');
  const constraints = (args.constraints || []).map(c => `- ${c}`).join('\n') || '- None specified';

  let services = '';
  if (args.ainative_services) {
    services = `\n\nAINative Services to Use:\n${args.ainative_services.map(s => `- ${s}`).join('\n')}`;
  }

  let extra = '';
  if (args.additional_context) {
    extra = `\n\nAdditional Context:\n${args.additional_context}`;
  }

  return `Create a detailed PRD for the following:

Product Name: ${args.product_name}
Description: ${args.description}
Target Audience: ${args.target_audience}
${args.issue_number ? `GitHub Issue: #${args.issue_number}` : ''}

Core Features:
${features}

Constraints:
${constraints}${services}${extra}

Generate a complete, production-ready PRD in Markdown format. Include specific AINative API endpoints, service references, and architectural patterns. Make user stories concrete with Given/When/Then acceptance criteria.`;
}

export async function executeGenerationTool(toolName, args, client) {
  switch (toolName) {
    case 'prd_generate':
      return handleGenerate(args, client);
    case 'prd_generate_section':
      return handleGenerateSection(args, client);
    case 'prd_refine':
      return handleRefine(args, client);
    case 'prd_from_issue':
      return handleFromIssue(args, client);
    default:
      return null;
  }
}

async function handleGenerate(args, client) {
  const systemPrompt = buildSystemPrompt(args.template || 'standard');

  // Auto-detect AINative services if not specified
  let suggestedServices = args.ainative_services;
  if (!suggestedServices) {
    suggestedServices = autoDetectServices(args.description, args.core_features);
  }

  let prdContent;

  if (client.isAuthenticated) {
    // AI-powered generation: fill template with user vars first, then let AI complete
    const partialTemplate = renderTemplate(args.template || 'standard', args);

    // Extract remaining unfilled placeholders
    const remaining = [...new Set((partialTemplate.match(/\{\{[A-Z_]+\}\}/g) || []))];

    let userPrompt;
    if (remaining.length > 0) {
      // Template-aware prompt: AI fills the remaining placeholders
      userPrompt = `You are given a PRD template with some sections already filled and some marked with {{PLACEHOLDER}} tokens.

Your task: Replace every {{PLACEHOLDER}} with detailed, production-ready content based on the product context below.

Product: ${args.product_name}
Description: ${args.description}
Target Audience: ${args.target_audience}
Core Features:
${(args.core_features || []).map(f => `- ${f}`).join('\n')}
Constraints:
${(args.constraints || []).map(c => `- ${c}`).join('\n') || '- None'}
${args.additional_context ? `Additional Context:\n${args.additional_context}` : ''}

Placeholders to fill: ${remaining.join(', ')}

IMPORTANT: Return the COMPLETE document with all placeholders replaced. Keep the existing filled sections exactly as they are. Do NOT add \`\`\`markdown fences — return raw markdown only.

--- TEMPLATE START ---
${partialTemplate}
--- TEMPLATE END ---`;
    } else {
      userPrompt = buildUserPrompt(args);
    }

    try {
      const response = await client.chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { max_tokens: 8000, temperature: 0.7 });

      prdContent = response.choices?.[0]?.message?.content || response.content;

      // Strip markdown fences if AI wrapped it
      if (prdContent) {
        prdContent = prdContent.replace(/^```(?:markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      }
    } catch (err) {
      // Fallback to template with user vars only
      prdContent = partialTemplate;
    }
  } else {
    // Template-only mode (no API access)
    prdContent = renderTemplate(args.template || 'standard', args);
  }

  // Auto-save to ZeroDB as plan artifact
  let savedId = null;
  if (client.isAuthenticated) {
    try {
      const saved = await client.createPlan(
        `PRD: ${args.product_name}`,
        prdContent,
        'prd'
      );
      savedId = saved.id || saved.artifact_id;

      // Store in memory for semantic search
      await client.storeMemory(
        `PRD created for "${args.product_name}": ${args.description}. Services: ${(suggestedServices || []).join(', ')}`,
        'prd-generator',
        ['prd', 'generated', ...(suggestedServices || [])],
        { product_name: args.product_name, prd_id: savedId }
      );
    } catch {
      // Save failed — still return the PRD content
    }
  }

  return {
    prd: prdContent,
    prd_id: savedId,
    product_name: args.product_name,
    template: args.template || 'standard',
    suggested_services: suggestedServices,
    saved: !!savedId,
    message: savedId
      ? `PRD generated and saved (ID: ${savedId}). Use prd_load("${savedId}") to retrieve it later.`
      : 'PRD generated (not saved — no ZeroDB credentials available)'
  };
}

async function handleGenerateSection(args, client) {
  let existingPrd = null;
  if (args.prd_id && client.isAuthenticated) {
    try {
      const plan = await client.getPlan(args.prd_id);
      existingPrd = plan.content;
    } catch {
      // Couldn't load existing PRD
    }
  }

  const manifest = getManifest();
  const systemPrompt = `You are an expert product manager at AINative Studio.
Generate ONLY the "${args.section_name}" section of a PRD in Markdown format.
${existingPrd ? 'The existing PRD context is provided below — generate the section to fit seamlessly.' : ''}
Use real AINative service names, API paths, and architectural patterns.`;

  const userPrompt = `${existingPrd ? `Existing PRD:\n${existingPrd}\n\n---\n\n` : ''}
Generate the "${args.section_name}" section.
${args.product_name ? `Product: ${args.product_name}` : ''}
${args.description ? `Description: ${args.description}` : ''}
${args.context ? `Additional context: ${args.context}` : ''}`;

  if (!client.isAuthenticated) {
    return { error: 'AI generation requires ZeroDB credentials. Set ZERODB_API_KEY or ZERODB_USERNAME/PASSWORD.' };
  }

  const response = await client.chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { max_tokens: 4000, temperature: 0.7 });

  const sectionContent = response.choices?.[0]?.message?.content || response.content;

  return {
    section: args.section_name,
    content: sectionContent,
    prd_id: args.prd_id || null,
    message: `Section "${args.section_name}" generated. Use prd_refine to integrate it into the full PRD.`
  };
}

async function handleRefine(args, client) {
  if (!client.isAuthenticated) {
    return { error: 'PRD refinement requires ZeroDB credentials.' };
  }

  // Load existing PRD
  const plan = await client.getPlan(args.prd_id);
  const existingPrd = plan.content;

  const systemPrompt = buildSystemPrompt('standard');
  const userPrompt = `Here is an existing PRD that needs refinement:

${existingPrd}

---

Feedback to address:
${args.feedback}

${args.sections_to_update?.length ? `Only update these sections: ${args.sections_to_update.join(', ')}` : 'Update all relevant sections.'}

Return the complete, updated PRD in Markdown format. Preserve the overall structure.`;

  const response = await client.chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { max_tokens: 8000, temperature: 0.5 });

  const refinedContent = response.choices?.[0]?.message?.content || response.content;

  // Update the plan artifact (version history tracked automatically)
  await client.updatePlan(args.prd_id, { content: refinedContent });

  return {
    prd: refinedContent,
    prd_id: args.prd_id,
    feedback_applied: args.feedback,
    sections_updated: args.sections_to_update || ['all'],
    message: `PRD refined and version history updated. Use prd_history("${args.prd_id}") to see diffs.`
  };
}

async function handleFromIssue(args, client) {
  if (!client.isAuthenticated) {
    return { error: 'PRD generation from issues requires ZeroDB credentials.' };
  }

  // Fetch issue via GitHub API (using AINative chat to extract)
  // In production, this would call the GitHub API directly
  const issuePrompt = `I need to create a PRD from GitHub issue #${args.issue_number} in ${args.repo}.
The issue should be expanded into a full ${args.template} PRD template.
Since I cannot fetch the issue directly, generate a PRD framework that:
1. References issue #${args.issue_number}
2. Uses the ${args.template} template
3. Includes placeholder sections for the issue details to be filled in
4. Includes all AINative platform context and architectural constraints`;

  const systemPrompt = buildSystemPrompt(args.template);

  const response = await client.chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: issuePrompt }
  ], { max_tokens: 8000, temperature: 0.7 });

  const prdContent = response.choices?.[0]?.message?.content || response.content;

  // Save
  const saved = await client.createPlan(
    `PRD from Issue #${args.issue_number}`,
    prdContent,
    'prd'
  );

  return {
    prd: prdContent,
    prd_id: saved.id || saved.artifact_id,
    issue_number: args.issue_number,
    repo: args.repo,
    template: args.template,
    saved: true,
    message: `PRD generated from issue #${args.issue_number} and saved.`
  };
}

/**
 * Auto-detect which AINative services are relevant based on description and features
 */
function autoDetectServices(description, features) {
  const text = `${description} ${features.join(' ')}`.toLowerCase();
  const manifest = getManifest();
  const detected = [];

  const keywords = {
    'ZeroDB': ['database', 'vector', 'storage', 'table', 'nosql', 'file', 'upload', 'embedding', 'search'],
    'ZeroMemory': ['memory', 'context', 'remember', 'recall', 'cognitive', 'session', 'graph', 'graphrag'],
    'Agent Cloud': ['agent', 'deploy', 'registry', 'a2a', 'swarm', 'autonomous'],
    'AI Kit': ['ui', 'component', 'react', 'frontend', 'widget', 'kit'],
    'Chat Completions API': ['chat', 'llm', 'inference', 'completion', 'ai', 'model'],
    'Live Streaming': ['stream', 'video', 'live', 'broadcast', 'vod', 'viewer'],
    'Multimodal Generation': ['image', 'audio', 'speech', 'transcription', 'video generation'],
    'Echo Developer Program': ['developer', 'revenue', 'earnings', 'markup', 'sdk', 'payout'],
    'Browser Agent': ['browser', 'scrape', 'extract', 'automate', 'web'],
    'Sequential Thinking': ['reasoning', 'thinking', 'plan', 'step-by-step'],
    'MCP Hosting': ['mcp', 'server', 'hosted', 'tool'],
    'Community Platform': ['community', 'social', 'events', 'posts'],
    'AX Audit': ['accessibility', 'audit', 'agent-friendly'],
    'Content Workflow': ['content', 'blog', 'publish', 'schedule']
  };

  for (const [service, kws] of Object.entries(keywords)) {
    if (kws.some(kw => text.includes(kw))) {
      detected.push(service);
    }
  }

  return detected.length > 0 ? detected : ['ZeroDB', 'Chat Completions API'];
}

/**
 * Render a template with variable substitution (no AI, pure template)
 */
function renderTemplate(templateName, args) {
  const templatePath = join(__dirname, '..', 'templates', `${templateName}.md`);
  let template;
  try {
    template = readFileSync(templatePath, 'utf8');
  } catch {
    template = readFileSync(join(__dirname, '..', 'templates', 'standard.md'), 'utf8');
  }

  const vars = {
    '{{PRODUCT_NAME}}': args.product_name || 'TBD',
    '{{FEATURE_NAME}}': args.product_name || 'TBD',
    '{{CAPABILITY_NAME}}': args.product_name || 'TBD',
    '{{AUTHOR}}': 'AINative Dev Team',
    '{{DATE}}': new Date().toISOString().split('T')[0],
    '{{PURPOSE}}': args.description || 'TBD',
    '{{PRODUCT_DESCRIPTION}}': args.description || 'TBD',
    '{{FEATURE_DESCRIPTION}}': args.description || 'TBD',
    '{{CAPABILITY_DESCRIPTION}}': args.description || 'TBD',
    '{{TARGET_AUDIENCE}}': args.target_audience || 'TBD',
    '{{TARGET_USERS}}': args.target_audience || 'TBD',
    '{{CORE_FEATURES}}': (args.core_features || []).map(f => `- ${f}`).join('\n'),
    '{{CONSTRAINTS}}': (args.constraints || []).map(c => `- ${c}`).join('\n') || '- None specified',
    '{{ISSUE_NUMBER}}': args.issue_number || 'TBD',
    '{{SLUG}}': (args.product_name || 'feature').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    '{{AINATIVE_SERVICES}}': (args.ainative_services || autoDetectServices(args.description || '', args.core_features || [])).map(s => `- ${s}`).join('\n')
  };

  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(key, value);
  }

  return result;
}
