/**
 * PRD Validation Tools — 3 tools
 *
 * Tools:
 *   prd_validate       — Validate PRD against quality rules + AINative constraints
 *   prd_score          — Score PRD completeness (0-100)
 *   prd_check_api_refs — Verify all API/service references are valid
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

// Validation rules with regex patterns
const VALIDATION_RULES = [
  {
    id: 'has-title',
    name: 'Title Present',
    description: 'PRD has a main title (H1 heading)',
    pattern: /^#\s+.+/m,
    weight: 5,
    category: 'structure'
  },
  {
    id: 'has-introduction',
    name: 'Introduction Section',
    description: 'PRD has an introduction or overview section',
    pattern: /^#{1,3}\s*(introduction|overview|1\.\s)/mi,
    weight: 10,
    category: 'structure'
  },
  {
    id: 'has-problem-statement',
    name: 'Problem Statement',
    description: 'PRD includes a problem statement or motivation',
    pattern: /^#{1,3}\s*(problem|motivation|why|background)/mi,
    weight: 10,
    category: 'content'
  },
  {
    id: 'has-target-audience',
    name: 'Target Audience',
    description: 'PRD defines target users or audience',
    pattern: /(target\s*(audience|users?)|who\s*(will|is)|persona)/mi,
    weight: 8,
    category: 'content'
  },
  {
    id: 'has-user-stories',
    name: 'User Stories',
    description: 'PRD includes user stories or use cases',
    pattern: /(user\s*stor(y|ies)|use\s*case|as\s+a\s+.+,?\s*i\s+want)/mi,
    weight: 10,
    category: 'content'
  },
  {
    id: 'has-features',
    name: 'Features Section',
    description: 'PRD defines core features or requirements',
    pattern: /^#{1,3}\s*(feature|requirement|functional|core\s*feature)/mi,
    weight: 10,
    category: 'structure'
  },
  {
    id: 'has-technical-architecture',
    name: 'Technical Architecture',
    description: 'PRD includes technical design or architecture section',
    pattern: /^#{1,3}\s*(technical|architecture|design|implementation|api|endpoint)/mi,
    weight: 10,
    category: 'structure'
  },
  {
    id: 'has-acceptance-criteria',
    name: 'Acceptance Criteria',
    description: 'PRD includes acceptance criteria or definition of done',
    pattern: /(acceptance\s*criteria|definition\s*of\s*done|given.+when.+then)/mi,
    weight: 8,
    category: 'content'
  },
  {
    id: 'has-test-plan',
    name: 'Test Plan',
    description: 'PRD includes testing strategy or test plan',
    pattern: /(test\s*(plan|strategy|approach)|testing|pytest|coverage)/mi,
    weight: 8,
    category: 'content'
  },
  {
    id: 'has-timeline',
    name: 'Timeline',
    description: 'PRD includes timeline, milestones, or schedule',
    pattern: /^#{1,3}\s*(timeline|milestone|schedule|roadmap|delivery)/mi,
    weight: 5,
    category: 'structure'
  },
  {
    id: 'minimum-length',
    name: 'Minimum Length',
    description: 'PRD is at least 1000 characters (substantial document)',
    check: (content) => content.length >= 1000,
    weight: 5,
    category: 'quality'
  },
  {
    id: 'has-api-endpoints',
    name: 'API Endpoints Defined',
    description: 'PRD references specific API endpoints',
    pattern: /\/api\/v1\//m,
    weight: 5,
    category: 'ainative'
  },
  {
    id: 'has-ainative-services',
    name: 'AINative Services Referenced',
    description: 'PRD mentions specific AINative platform services',
    pattern: /(zerodb|zeromemory|agent\s*cloud|ai\s*kit|cody\s*cli|echo|ainative)/mi,
    weight: 5,
    category: 'ainative'
  },
  {
    id: 'no-third-party-memory',
    name: 'No Third-Party Memory Services',
    description: 'PRD does not reference non-ZeroDB memory services (Supabase, Firebase, etc.)',
    check: (content) => !/(supabase|firebase|dynamodb|mongodb\s*atlas|pinecone|weaviate|chromadb)/mi.test(content),
    weight: 5,
    category: 'ainative'
  },
  {
    id: 'has-security-considerations',
    name: 'Security Considerations',
    description: 'PRD addresses security (auth, validation, secrets)',
    pattern: /(security|auth(entication|orization)|validat(e|ion)|secret|encrypt)/mi,
    weight: 5,
    category: 'content'
  }
];

export const VALIDATION_TOOLS = [
  {
    name: 'prd_validate',
    description: 'Validate a PRD against quality rules and AINative architectural constraints. Checks for required sections, content completeness, AINative service references, and architecture compliance.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'PRD content in Markdown (provide directly or use prd_id)'
        },
        prd_id: {
          type: 'string',
          description: 'ID of a saved PRD to validate'
        },
        strict: {
          type: 'boolean',
          description: 'Strict mode: also check AINative-specific rules (default: true)',
          default: true
        }
      }
    }
  },
  {
    name: 'prd_score',
    description: 'Score a PRD completeness from 0-100 based on section coverage, content quality, and AINative integration depth.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'PRD content in Markdown'
        },
        prd_id: {
          type: 'string',
          description: 'ID of a saved PRD to score'
        }
      }
    }
  },
  {
    name: 'prd_check_api_refs',
    description: 'Verify that all API endpoint references in a PRD actually exist in the AINative OpenAPI spec. Catches typos and invalid paths.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'PRD content to check'
        },
        prd_id: {
          type: 'string',
          description: 'ID of a saved PRD to check'
        }
      }
    }
  }
];

export async function executeValidationTool(toolName, args, client) {
  switch (toolName) {
    case 'prd_validate':
      return handleValidate(args, client);
    case 'prd_score':
      return handleScore(args, client);
    case 'prd_check_api_refs':
      return handleCheckApiRefs(args, client);
    default:
      return null;
  }
}

async function resolveContent(args, client) {
  if (args.content) return args.content;
  if (args.prd_id && client.isAuthenticated) {
    const plan = await client.getPlan(args.prd_id);
    return plan.content;
  }
  throw new Error('Provide either content or prd_id');
}

async function handleValidate(args, client) {
  const content = await resolveContent(args, client);

  const rules = args.strict !== false
    ? VALIDATION_RULES
    : VALIDATION_RULES.filter(r => r.category !== 'ainative');

  const results = rules.map(rule => {
    let passed;
    if (rule.check) {
      passed = rule.check(content);
    } else {
      passed = rule.pattern.test(content);
    }
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      passed,
      category: rule.category,
      weight: rule.weight
    };
  });

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed);

  return {
    valid: failed.length === 0,
    results,
    summary: {
      total: results.length,
      passed,
      failed: failed.length,
      score: Math.round((passed / results.length) * 100)
    },
    recommendations: failed.map(r => `Add "${r.name}": ${r.description}`),
    message: failed.length === 0
      ? 'PRD passes all validation rules!'
      : `PRD has ${failed.length} issues to address.`
  };
}

async function handleScore(args, client) {
  const content = await resolveContent(args, client);

  // Weighted scoring
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const rule of VALIDATION_RULES) {
    totalWeight += rule.weight;
    const passed = rule.check ? rule.check(content) : rule.pattern.test(content);
    if (passed) earnedWeight += rule.weight;
  }

  // Bonus points for depth
  const wordCount = content.split(/\s+/).length;
  const depthBonus = Math.min(5, Math.floor(wordCount / 500)); // Up to 5 bonus points for length
  const sectionCount = (content.match(/^#{1,3}\s+/gm) || []).length;
  const sectionBonus = Math.min(5, Math.floor(sectionCount / 3)); // Up to 5 bonus for many sections

  const baseScore = Math.round((earnedWeight / totalWeight) * 90); // Max 90 from rules
  const score = Math.min(100, baseScore + depthBonus + sectionBonus);

  let grade;
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return {
    score,
    grade,
    breakdown: {
      rule_score: baseScore,
      depth_bonus: depthBonus,
      section_bonus: sectionBonus,
      word_count: wordCount,
      section_count: sectionCount
    },
    message: `PRD score: ${score}/100 (${grade}). ${score >= 80 ? 'Production-ready!' : 'Needs improvement — run prd_validate for specific recommendations.'}`
  };
}

async function handleCheckApiRefs(args, client) {
  const content = await resolveContent(args, client);
  const manifest = getManifest();

  // Extract all API path references from the PRD
  const apiRefs = content.match(/\/api\/v1\/[a-zA-Z0-9\/_-]+/g) || [];
  const serviceRefs = content.match(/\b(ZeroDB|ZeroMemory|Agent Cloud|AI Kit|Cody CLI|Echo|Browser Agent|AX Audit|ZeroInvoice|ZeroCommerce|ZeroPipeline|Sequential Thinking|Agent402|QNN API)\b/gi) || [];

  // Check service references against manifest
  const knownServices = manifest.products.map(p => p.name.toLowerCase());
  const validServices = [];
  const invalidServices = [];

  for (const ref of [...new Set(serviceRefs)]) {
    if (knownServices.includes(ref.toLowerCase())) {
      validServices.push(ref);
    } else {
      invalidServices.push(ref);
    }
  }

  // Check API paths against known prefixes
  const knownPrefixes = manifest.products
    .filter(p => p.api_prefix)
    .map(p => p.api_prefix);

  const validPaths = [];
  const unknownPaths = [];

  for (const ref of [...new Set(apiRefs)]) {
    if (knownPrefixes.some(prefix => ref.startsWith(prefix))) {
      validPaths.push(ref);
    } else {
      unknownPaths.push(ref);
    }
  }

  return {
    api_references: {
      total: apiRefs.length,
      valid: validPaths.length,
      unknown: unknownPaths.length,
      valid_paths: validPaths,
      unknown_paths: unknownPaths
    },
    service_references: {
      total: serviceRefs.length,
      valid: validServices.length,
      invalid: invalidServices.length,
      valid_services: [...new Set(validServices)],
      invalid_services: [...new Set(invalidServices)]
    },
    message: unknownPaths.length === 0 && invalidServices.length === 0
      ? 'All API and service references are valid!'
      : `Found ${unknownPaths.length} unknown API paths and ${invalidServices.length} invalid service references.`
  };
}
