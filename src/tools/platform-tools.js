/**
 * AINative Platform Discovery Tools — 3 tools
 *
 * Exposes the platform manifest so AI agents (and users) can discover
 * what AINative services, APIs, and SDKs are available when writing PRDs.
 *
 * Tools:
 *   prd_list_services   — List all AINative products/services
 *   prd_get_api_catalog — Get API endpoints for a category
 *   prd_suggest_stack   — Suggest AINative services for given requirements
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

export const PLATFORM_TOOLS = [
  {
    name: 'prd_list_services',
    description: 'List all AINative products and services with descriptions, categories, API prefixes, SDKs, and pricing tiers. Use this before writing a PRD to understand what platform capabilities are available.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category (e.g., "Data Platform", "AI Inference", "Business", "Infrastructure")',
        },
        verbose: {
          type: 'boolean',
          description: 'Include full details including features, SDKs, and endpoints (default: false)',
          default: false
        }
      }
    }
  },
  {
    name: 'prd_get_api_catalog',
    description: 'Get API endpoint details for a specific AINative service or category. Returns endpoint paths, methods, and descriptions from the OpenAPI catalog.',
    inputSchema: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description: 'Service name (e.g., "ZeroDB", "ZeroMemory", "Agent Cloud") or API prefix (e.g., "/api/v1/zerodb")'
        }
      },
      required: ['service']
    }
  },
  {
    name: 'prd_suggest_stack',
    description: 'Given a set of requirements, suggest which AINative services, APIs, and SDKs to use. Returns a recommended technology stack with justifications.',
    inputSchema: {
      type: 'object',
      properties: {
        requirements: {
          type: 'string',
          description: 'Natural language description of what you need to build'
        },
        features: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of required features/capabilities'
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Technical constraints (e.g., "must work offline", "real-time updates needed")',
          default: []
        }
      },
      required: ['requirements']
    }
  }
];

export async function executePlatformTool(toolName, args, client) {
  switch (toolName) {
    case 'prd_list_services':
      return handleListServices(args);
    case 'prd_get_api_catalog':
      return handleGetApiCatalog(args);
    case 'prd_suggest_stack':
      return handleSuggestStack(args, client);
    default:
      return null;
  }
}

function handleListServices(args) {
  const manifest = getManifest();
  let products = manifest.products;

  if (args.category) {
    products = products.filter(p =>
      p.category.toLowerCase().includes(args.category.toLowerCase())
    );
  }

  const services = products.map(p => {
    const base = {
      name: p.name,
      category: p.category,
      description: p.description
    };

    if (args.verbose) {
      return {
        ...base,
        features: p.features || [],
        api_prefix: p.api_prefix || null,
        mcp_server: p.mcp_server || null,
        sdk_packages: p.sdk_packages || [],
        pricing_tiers: p.pricing_tiers || [],
        endpoints: p.endpoints || null
      };
    }

    return base;
  });

  return {
    services,
    count: services.length,
    categories: [...new Set(products.map(p => p.category))],
    message: `${services.length} AINative services found${args.category ? ` in "${args.category}"` : ''}.`
  };
}

function handleGetApiCatalog(args) {
  const manifest = getManifest();

  // Find matching product
  const product = manifest.products.find(p =>
    p.name.toLowerCase() === args.service.toLowerCase() ||
    (p.api_prefix && args.service.startsWith(p.api_prefix))
  );

  if (!product) {
    // Try partial match
    const partial = manifest.products.filter(p =>
      p.name.toLowerCase().includes(args.service.toLowerCase()) ||
      p.category.toLowerCase().includes(args.service.toLowerCase())
    );
    if (partial.length > 0) {
      return {
        matches: partial.map(p => ({
          name: p.name,
          category: p.category,
          api_prefix: p.api_prefix,
          description: p.description
        })),
        message: `No exact match for "${args.service}". Did you mean one of these?`
      };
    }
    return { error: `Service "${args.service}" not found. Use prd_list_services to see all available services.` };
  }

  return {
    service: product.name,
    category: product.category,
    description: product.description,
    api_prefix: product.api_prefix || null,
    features: product.features || [],
    endpoints: product.endpoints || null,
    mcp_server: product.mcp_server || null,
    sdk_packages: product.sdk_packages || [],
    pricing_tiers: product.pricing_tiers || [],
    architecture_constraints: manifest.architecture.constraints,
    message: `API catalog for ${product.name} (${product.category}).`
  };
}

async function handleSuggestStack(args, client) {
  const manifest = getManifest();
  const text = `${args.requirements} ${(args.features || []).join(' ')} ${(args.constraints || []).join(' ')}`.toLowerCase();

  const suggestions = [];

  // Keyword-based matching
  const serviceKeywords = {
    'ZeroDB': { keywords: ['database', 'vector', 'storage', 'table', 'nosql', 'file', 'upload', 'embedding', 'search', 'data'], reason: 'Unified data platform for vectors, tables, files, and embeddings' },
    'ZeroMemory': { keywords: ['memory', 'context', 'remember', 'recall', 'cognitive', 'session', 'graph', 'knowledge'], reason: 'Persistent cognitive memory with GraphRAG and context management' },
    'Agent Cloud': { keywords: ['agent', 'deploy', 'autonomous', 'a2a', 'swarm', 'registry', 'orchestrat'], reason: 'Managed infrastructure for deploying and scaling AI agents' },
    'AI Kit': { keywords: ['ui', 'component', 'react', 'frontend', 'widget', 'interface', 'dashboard'], reason: 'Framework-agnostic UI toolkit for AI-powered interfaces' },
    'Chat Completions API': { keywords: ['chat', 'llm', 'inference', 'completion', 'ai model', 'generate', 'prompt'], reason: 'OpenAI-compatible chat completions with tiered routing' },
    'Live Streaming': { keywords: ['stream', 'video', 'live', 'broadcast', 'real-time video', 'viewer'], reason: 'Live streaming with Cloudflare Stream, chat, and analytics' },
    'Multimodal Generation': { keywords: ['image', 'audio', 'speech', 'transcription', 'tts', 'voice', 'video generat'], reason: 'Image/video/audio generation via fal.ai, ElevenLabs, Runway' },
    'Embeddings API': { keywords: ['embed', 'vector', 'similarity', 'semantic'], reason: 'Free embedding generation with BAAI BGE models' },
    'Echo Developer Program': { keywords: ['developer', 'revenue', 'monetiz', 'marketplace', 'sdk', 'third-party'], reason: 'Revenue sharing for developers building on AINative' },
    'Browser Agent': { keywords: ['browser', 'scrape', 'crawl', 'extract', 'web automat'], reason: 'Browser automation for extraction and validation' },
    'Sequential Thinking': { keywords: ['reason', 'think', 'plan', 'step-by-step', 'chain', 'logic'], reason: 'Structured reasoning chains with ZeroDB persistence' },
    'MCP Hosting': { keywords: ['mcp', 'tool server', 'hosted tool', 'plugin'], reason: 'Hosted MCP server infrastructure' },
    'Community Platform': { keywords: ['community', 'social', 'event', 'forum', 'group'], reason: 'Community features with events, social graph, and posts' },
    'Content Workflow': { keywords: ['content', 'blog', 'cms', 'publish', 'schedule', 'editorial'], reason: 'AI content creation and publishing workflow' },
    'AX Audit': { keywords: ['accessibility', 'audit', 'agent-friendly', 'compliance', 'score'], reason: 'Agent Accessibility scoring for websites' },
    'OpenCap Stack': { keywords: ['cap table', 'equity', 'safe', 'valuation', 'investor', 'stakeholder'], reason: 'Cap table management with dilution analysis' }
  };

  for (const [service, config] of Object.entries(serviceKeywords)) {
    if (config.keywords.some(kw => text.includes(kw))) {
      const product = manifest.products.find(p => p.name === service);
      suggestions.push({
        service,
        reason: config.reason,
        api_prefix: product?.api_prefix || null,
        mcp_server: product?.mcp_server || null,
        sdk_packages: product?.sdk_packages || []
      });
    }
  }

  // Always suggest ZeroDB for data needs
  if (!suggestions.find(s => s.service === 'ZeroDB')) {
    suggestions.push({
      service: 'ZeroDB',
      reason: 'Required: ZeroDB is mandatory for all data operations in AINative',
      api_prefix: '/api/v1/zerodb',
      mcp_server: 'ainative-zerodb-mcp-server'
    });
  }

  // AI generation for richer suggestions if available
  let aiSuggestion = null;
  if (client.isAuthenticated) {
    try {
      const response = await client.chatCompletion([
        {
          role: 'system',
          content: `You are an AINative platform architect. Given requirements, suggest the optimal stack of AINative services. Available services: ${manifest.products.map(p => p.name).join(', ')}. Be specific about which API endpoints and SDKs to use. Respond in JSON with: { "recommendations": [{ "service": "...", "usage": "...", "api_endpoints": [...] }], "architecture_notes": "..." }`
        },
        {
          role: 'user',
          content: `Requirements: ${args.requirements}\nFeatures: ${(args.features || []).join(', ')}\nConstraints: ${(args.constraints || []).join(', ')}`
        }
      ], { max_tokens: 2000, temperature: 0.5 });

      const content = response.choices?.[0]?.message?.content || response.content;
      try {
        aiSuggestion = JSON.parse(content);
      } catch {
        aiSuggestion = { raw: content };
      }
    } catch {
      // AI suggestion failed
    }
  }

  return {
    suggested_stack: suggestions,
    ai_recommendation: aiSuggestion,
    architecture_constraints: manifest.architecture.constraints,
    message: `Suggested ${suggestions.length} AINative services for your requirements.`
  };
}
