/**
 * PRD Memory Tools — 4 tools for persistent PRD storage and recall
 *
 * Uses ZeroDB plan artifacts for versioned storage and ZeroMemory
 * for semantic search across all saved PRDs.
 *
 * Tools:
 *   prd_save    — Save PRD to ZeroDB as a persistent plan artifact
 *   prd_load    — Load a saved PRD by ID
 *   prd_search  — Semantic search across all saved PRDs
 *   prd_history — Get version history of a PRD (diffs)
 */

export const MEMORY_TOOLS = [
  {
    name: 'prd_save',
    description: 'Save a PRD to ZeroDB as a persistent plan artifact. Returns an ID you can use to load, update, or search for it in future sessions. Version history is tracked automatically on every update.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'PRD title (e.g., "PRD: Agent Cloud Billing")'
        },
        content: {
          type: 'string',
          description: 'Full PRD content in Markdown'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization (e.g., ["billing", "agent-cloud", "q3-2026"])',
          default: []
        }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'prd_load',
    description: 'Load a saved PRD by its artifact ID. Use at the start of a session to resume work on an existing PRD.',
    inputSchema: {
      type: 'object',
      properties: {
        prd_id: {
          type: 'string',
          description: 'Artifact ID returned by prd_save or prd_generate'
        }
      },
      required: ['prd_id']
    }
  },
  {
    name: 'prd_search',
    description: 'Semantic search across all saved PRDs. Find PRDs by topic, service name, feature description, or any natural language query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query (e.g., "PRDs about agent billing", "streaming video features")'
        },
        limit: {
          type: 'integer',
          description: 'Maximum results to return',
          default: 10,
          minimum: 1,
          maximum: 50
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'prd_history',
    description: 'Get version history for a PRD, showing how it evolved over time. Returns unified diffs between versions.',
    inputSchema: {
      type: 'object',
      properties: {
        prd_id: {
          type: 'string',
          description: 'Artifact ID of the PRD'
        }
      },
      required: ['prd_id']
    }
  }
];

export async function executeMemoryTool(toolName, args, client) {
  switch (toolName) {
    case 'prd_save':
      return handleSave(args, client);
    case 'prd_load':
      return handleLoad(args, client);
    case 'prd_search':
      return handleSearch(args, client);
    case 'prd_history':
      return handleHistory(args, client);
    default:
      return null;
  }
}

async function handleSave(args, client) {
  if (!client.isAuthenticated) {
    return { error: 'Saving PRDs requires ZeroDB credentials. Set ZERODB_API_KEY or ZERODB_USERNAME/PASSWORD.' };
  }

  // Save as plan artifact (versioned, diffable)
  const saved = await client.createPlan(args.title, args.content, 'prd');
  const prdId = saved.id || saved.artifact_id;

  // Also store a memory entry for semantic search
  const summary = args.content.substring(0, 500);
  await client.storeMemory(
    `PRD saved: "${args.title}". Summary: ${summary}`,
    'prd-generator',
    ['prd', 'saved', ...(args.tags || [])],
    { prd_id: prdId, title: args.title, type: 'prd-reference' }
  );

  return {
    prd_id: prdId,
    title: args.title,
    saved: true,
    message: `PRD saved with ID: ${prdId}. Use prd_load("${prdId}") to retrieve, prd_history("${prdId}") for versions.`
  };
}

async function handleLoad(args, client) {
  if (!client.isAuthenticated) {
    return { error: 'Loading PRDs requires ZeroDB credentials.' };
  }

  const plan = await client.getPlan(args.prd_id);

  return {
    prd_id: args.prd_id,
    title: plan.title,
    content: plan.content,
    status: plan.status || 'draft',
    type: plan.type,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    message: `PRD "${plan.title}" loaded. Status: ${plan.status || 'draft'}.`
  };
}

async function handleSearch(args, client) {
  if (!client.isAuthenticated) {
    return { error: 'Searching PRDs requires ZeroDB credentials.' };
  }

  const results = await client.searchMemory(
    `PRD ${args.query}`,
    args.limit || 10,
    'agent'
  );

  // Filter to PRD-related memories
  let prds = (results.results || []).filter(r =>
    r.metadata?.type === 'prd-reference' || r.tags?.includes('prd')
  );

  // Filter by tags if specified
  if (args.tags?.length) {
    prds = prds.filter(r =>
      args.tags.some(tag => r.metadata?.tags?.includes(tag) || r.tags?.includes(tag))
    );
  }

  return {
    results: prds.map(r => ({
      prd_id: r.metadata?.prd_id,
      title: r.metadata?.title || 'Untitled PRD',
      summary: r.content?.substring(0, 200),
      tags: r.metadata?.tags || r.tags || [],
      similarity: r.similarity || r.score,
      created_at: r.metadata?.timestamp
    })),
    count: prds.length,
    query: args.query,
    message: `Found ${prds.length} PRDs matching "${args.query}".`
  };
}

async function handleHistory(args, client) {
  if (!client.isAuthenticated) {
    return { error: 'PRD history requires ZeroDB credentials.' };
  }

  const history = await client.getPlanHistory(args.prd_id);

  return {
    prd_id: args.prd_id,
    versions: history.versions || history,
    version_count: (history.versions || history).length,
    message: `PRD has ${(history.versions || history).length} version(s).`
  };
}
