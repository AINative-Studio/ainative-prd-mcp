/**
 * Comprehensive coverage tests for ainative-prd-mcp
 *
 * Mocks the ZeroDB client to test all generation-tools, memory-tools,
 * template-tools, validation-tools, and platform-tools handlers
 * that were previously uncovered due to external API dependencies.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function createMockClient(overrides = {}) {
  return {
    isAuthenticated: true,
    chatCompletion: async () => ({
      choices: [{ message: { content: '# Mock PRD\n## Introduction\nTest generated content' } }]
    }),
    createPlan: async () => ({ id: 'plan-123', artifact_id: 'plan-123' }),
    getPlan: async () => ({
      id: 'plan-123',
      title: 'Test PRD',
      content: '# Test PRD\n## Introduction\nExisting content',
      status: 'draft',
      type: 'prd',
      created_at: '2026-01-01',
      updated_at: '2026-01-01'
    }),
    updatePlan: async () => ({ id: 'plan-123' }),
    getPlanHistory: async () => ({ versions: [{ version: 1 }, { version: 2 }] }),
    storeMemory: async () => ({ id: 'mem-1' }),
    searchMemory: async () => ({
      results: [{
        metadata: { prd_id: 'plan-123', title: 'Test PRD', type: 'prd-reference' },
        content: 'PRD saved: "Test PRD". Summary: test content',
        tags: ['prd'],
        similarity: 0.95
      }]
    }),
    ...overrides
  };
}

function createUnauthenticatedClient() {
  return { isAuthenticated: false };
}

// ---------------------------------------------------------------------------
// Generation Tools
// ---------------------------------------------------------------------------

describe('Generation Tools - handleGenerate', () => {
  it('generates PRD with AI when authenticated', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient();

    const result = await executeGenerationTool('prd_generate', {
      product_name: 'Test Feature',
      description: 'A test feature for agents',
      target_audience: 'Developers',
      core_features: ['Feature A', 'Feature B'],
      template: 'standard'
    }, client);

    assert.ok(result.prd);
    assert.equal(result.product_name, 'Test Feature');
    assert.equal(result.prd_id, 'plan-123');
    assert.equal(result.saved, true);
    assert.ok(result.message.includes('plan-123'));
    assert.equal(result.template, 'standard');
  });

  it('auto-detects services from description', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient();

    const result = await executeGenerationTool('prd_generate', {
      product_name: 'Memory Agent',
      description: 'An agent that remembers context and stores embeddings in a vector database',
      target_audience: 'AI developers',
      core_features: ['memory recall', 'embedding search']
    }, client);

    assert.ok(result.suggested_services);
    assert.ok(result.suggested_services.includes('ZeroMemory'));
    assert.ok(result.suggested_services.includes('ZeroDB'));
  });

  it('uses explicit ainative_services when provided', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient();

    const result = await executeGenerationTool('prd_generate', {
      product_name: 'Custom Stack',
      description: 'Something',
      target_audience: 'Devs',
      core_features: ['x'],
      ainative_services: ['Agent Cloud', 'MCP Hosting']
    }, client);

    assert.deepEqual(result.suggested_services, ['Agent Cloud', 'MCP Hosting']);
  });

  it('falls back to template when AI fails', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient({
      chatCompletion: async () => { throw new Error('API down'); }
    });

    const result = await executeGenerationTool('prd_generate', {
      product_name: 'Fallback Test',
      description: 'Testing fallback',
      target_audience: 'Devs',
      core_features: ['feature1']
    }, client);

    assert.ok(result.prd);
    assert.ok(result.prd.includes('Fallback Test'));
  });

  it('uses template-only mode when unauthenticated', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeGenerationTool('prd_generate', {
      product_name: 'Template Only',
      description: 'No auth test',
      target_audience: 'Users',
      core_features: ['feature1'],
      template: 'ainative-feature'
    }, client);

    assert.ok(result.prd);
    assert.equal(result.saved, false);
    assert.equal(result.prd_id, null);
    assert.ok(result.message.includes('not saved'));
  });

  it('handles save failure gracefully', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient({
      createPlan: async () => { throw new Error('Save failed'); }
    });

    const result = await executeGenerationTool('prd_generate', {
      product_name: 'Save Fail',
      description: 'Test save failure',
      target_audience: 'Devs',
      core_features: ['x']
    }, client);

    assert.ok(result.prd);
    assert.equal(result.saved, false);
  });

  it('generates with additional_context and constraints', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient();

    const result = await executeGenerationTool('prd_generate', {
      product_name: 'Full Args',
      description: 'Testing all args',
      target_audience: 'Devs',
      core_features: ['f1', 'f2'],
      constraints: ['Must be fast', 'No external deps'],
      additional_context: 'This links to issue #999',
      issue_number: 999
    }, client);

    assert.ok(result.prd);
    assert.equal(result.product_name, 'Full Args');
  });

  it('returns null for unknown tool name', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const result = await executeGenerationTool('unknown_tool', {}, createMockClient());
    assert.equal(result, null);
  });
});

describe('Generation Tools - handleGenerateSection', () => {
  it('generates section with existing PRD context', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient();

    const result = await executeGenerationTool('prd_generate_section', {
      section_name: 'technical_architecture',
      prd_id: 'plan-123',
      context: 'Focus on WebSocket design'
    }, client);

    assert.equal(result.section, 'technical_architecture');
    assert.ok(result.content);
    assert.equal(result.prd_id, 'plan-123');
  });

  it('generates section without prd_id', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient();

    const result = await executeGenerationTool('prd_generate_section', {
      section_name: 'user_stories',
      product_name: 'New Product',
      description: 'A new product'
    }, client);

    assert.equal(result.section, 'user_stories');
    assert.ok(result.content);
    assert.equal(result.prd_id, null);
  });

  it('returns error when unauthenticated', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeGenerationTool('prd_generate_section', {
      section_name: 'introduction'
    }, client);

    assert.ok(result.error);
    assert.ok(result.error.includes('credentials'));
  });

  it('handles getPlan failure gracefully when loading existing PRD', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient({
      getPlan: async () => { throw new Error('Not found'); }
    });

    const result = await executeGenerationTool('prd_generate_section', {
      section_name: 'features',
      prd_id: 'nonexistent'
    }, client);

    // Should still generate the section even if loading existing PRD fails
    assert.ok(result.content);
  });
});

describe('Generation Tools - handleRefine', () => {
  it('refines PRD with feedback', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient();

    const result = await executeGenerationTool('prd_refine', {
      prd_id: 'plan-123',
      feedback: 'Add more detail to user stories'
    }, client);

    assert.ok(result.prd);
    assert.equal(result.prd_id, 'plan-123');
    assert.equal(result.feedback_applied, 'Add more detail to user stories');
    assert.deepEqual(result.sections_updated, ['all']);
  });

  it('refines specific sections only', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient();

    const result = await executeGenerationTool('prd_refine', {
      prd_id: 'plan-123',
      feedback: 'Use WebSockets',
      sections_to_update: ['technical_architecture', 'api_endpoints']
    }, client);

    assert.deepEqual(result.sections_updated, ['technical_architecture', 'api_endpoints']);
  });

  it('returns error when unauthenticated', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeGenerationTool('prd_refine', {
      prd_id: 'plan-123',
      feedback: 'test'
    }, client);

    assert.ok(result.error);
    assert.ok(result.error.includes('credentials'));
  });
});

describe('Generation Tools - handleFromIssue', () => {
  it('generates PRD from issue number', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createMockClient();

    const result = await executeGenerationTool('prd_from_issue', {
      issue_number: 42,
      repo: 'AINative-Studio/core',
      template: 'ainative-feature'
    }, client);

    assert.ok(result.prd);
    assert.equal(result.prd_id, 'plan-123');
    assert.equal(result.issue_number, 42);
    assert.equal(result.repo, 'AINative-Studio/core');
    assert.equal(result.saved, true);
  });

  it('returns error when unauthenticated', async () => {
    const { executeGenerationTool } = await import('../src/tools/generation-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeGenerationTool('prd_from_issue', {
      issue_number: 42
    }, client);

    assert.ok(result.error);
  });
});

// ---------------------------------------------------------------------------
// Memory Tools
// ---------------------------------------------------------------------------

describe('Memory Tools - handleSave', () => {
  it('saves PRD and stores memory entry', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createMockClient();

    const result = await executeMemoryTool('prd_save', {
      title: 'My PRD',
      content: '# My PRD\nContent here',
      tags: ['billing', 'q3']
    }, client);

    assert.equal(result.prd_id, 'plan-123');
    assert.equal(result.title, 'My PRD');
    assert.equal(result.saved, true);
    assert.ok(result.message.includes('plan-123'));
  });

  it('returns error when unauthenticated', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeMemoryTool('prd_save', {
      title: 'Test',
      content: 'Test'
    }, client);

    assert.ok(result.error);
    assert.ok(result.error.includes('credentials'));
  });
});

describe('Memory Tools - handleLoad', () => {
  it('loads PRD by ID', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createMockClient();

    const result = await executeMemoryTool('prd_load', {
      prd_id: 'plan-123'
    }, client);

    assert.equal(result.prd_id, 'plan-123');
    assert.equal(result.title, 'Test PRD');
    assert.ok(result.content);
    assert.equal(result.status, 'draft');
    assert.equal(result.type, 'prd');
    assert.ok(result.message.includes('Test PRD'));
  });

  it('returns error when unauthenticated', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeMemoryTool('prd_load', {
      prd_id: 'plan-123'
    }, client);

    assert.ok(result.error);
  });
});

describe('Memory Tools - handleSearch', () => {
  it('searches PRDs with query', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createMockClient();

    const result = await executeMemoryTool('prd_search', {
      query: 'billing agent',
      limit: 5
    }, client);

    assert.ok(result.results.length >= 1);
    assert.equal(result.results[0].prd_id, 'plan-123');
    assert.equal(result.results[0].title, 'Test PRD');
    assert.ok(result.message.includes('billing agent'));
  });

  it('filters by tags', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createMockClient({
      searchMemory: async () => ({
        results: [
          {
            metadata: { prd_id: 'p1', title: 'Tagged', type: 'prd-reference', tags: ['billing'] },
            content: 'tagged prd',
            tags: ['prd', 'billing']
          },
          {
            metadata: { prd_id: 'p2', title: 'Untagged', type: 'prd-reference' },
            content: 'untagged prd',
            tags: ['prd']
          }
        ]
      })
    });

    const result = await executeMemoryTool('prd_search', {
      query: 'test',
      tags: ['billing']
    }, client);

    assert.equal(result.count, 1);
    assert.equal(result.results[0].prd_id, 'p1');
  });

  it('returns error when unauthenticated', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeMemoryTool('prd_search', { query: 'test' }, client);
    assert.ok(result.error);
  });
});

describe('Memory Tools - handleHistory', () => {
  it('returns version history', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createMockClient();

    const result = await executeMemoryTool('prd_history', {
      prd_id: 'plan-123'
    }, client);

    assert.equal(result.prd_id, 'plan-123');
    assert.equal(result.version_count, 2);
    assert.ok(result.message.includes('2 version(s)'));
  });

  it('handles history as flat array (no .versions wrapper)', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createMockClient({
      getPlanHistory: async () => [{ version: 1 }]
    });

    const result = await executeMemoryTool('prd_history', {
      prd_id: 'plan-123'
    }, client);

    assert.equal(result.version_count, 1);
  });

  it('returns error when unauthenticated', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeMemoryTool('prd_history', { prd_id: 'x' }, client);
    assert.ok(result.error);
  });

  it('returns null for unknown tool name', async () => {
    const { executeMemoryTool } = await import('../src/tools/memory-tools.js');
    const result = await executeMemoryTool('unknown', {}, createMockClient());
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// Template Tools
// ---------------------------------------------------------------------------

describe('Template Tools - handleListTemplates', () => {
  it('lists built-in templates', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeTemplateTool('prd_list_templates', {}, client);

    assert.ok(result.count >= 3);
    assert.equal(result.builtin_count, 3);
    assert.ok(result.templates.some(t => t.name === 'standard'));
    assert.ok(result.templates.some(t => t.name === 'ainative-feature'));
    assert.ok(result.templates.some(t => t.name === 'agent-capability'));
  });

  it('includes custom templates from ZeroDB when authenticated', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createMockClient({
      searchMemory: async () => ({
        results: [{
          metadata: {
            type: 'prd-template',
            template_name: 'my-custom',
            description: 'Custom template',
            sections: ['Intro', 'Features']
          },
          content: '# Custom\n{{PRODUCT_NAME}}'
        }]
      })
    });

    const result = await executeTemplateTool('prd_list_templates', { include_custom: true }, client);

    assert.ok(result.templates.some(t => t.name === 'my-custom'));
    assert.ok(result.count >= 4);
  });

  it('handles custom template search failure gracefully', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createMockClient({
      searchMemory: async () => { throw new Error('Search failed'); }
    });

    const result = await executeTemplateTool('prd_list_templates', {}, client);
    assert.ok(result.count >= 3); // Still returns built-in templates
  });
});

describe('Template Tools - handleGetTemplate', () => {
  it('gets built-in standard template', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeTemplateTool('prd_get_template', { name: 'standard' }, client);

    assert.equal(result.name, 'standard');
    assert.ok(result.content);
    assert.ok(result.placeholders.length > 0);
    assert.ok(result.placeholders.includes('{{PRODUCT_NAME}}'));
  });

  it('finds custom template from ZeroDB', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createMockClient({
      searchMemory: async () => ({
        results: [{
          metadata: {
            type: 'prd-template',  // must be 'prd-template' type
            template_name: 'my-custom',
            description: 'My custom template',
            sections: ['Intro']
          },
          content: '# {{PRODUCT_NAME}}\nCustom content'
        }]
      })
    });

    const result = await executeTemplateTool('prd_get_template', { name: 'my-custom' }, client);

    assert.equal(result.name, 'my-custom');
    assert.ok(result.content.includes('Custom content'));
    assert.equal(result.builtin, false);
  });

  it('returns error for non-existent template', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createMockClient({
      searchMemory: async () => ({ results: [] })
    });

    const result = await executeTemplateTool('prd_get_template', { name: 'nonexistent' }, client);
    assert.ok(result.error);
    assert.ok(result.error.includes('not found'));
  });

  it('handles ZeroDB search failure on custom template lookup', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createMockClient({
      searchMemory: async () => { throw new Error('down'); }
    });

    const result = await executeTemplateTool('prd_get_template', { name: 'nonexistent' }, client);
    assert.ok(result.error);
  });
});

describe('Template Tools - handleCreateTemplate', () => {
  it('creates custom template', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createMockClient();

    const result = await executeTemplateTool('prd_create_template', {
      name: 'my-template',
      description: 'Test template',
      content: '# {{PRODUCT_NAME}}\n## Overview\n{{PURPOSE}}',
      sections: ['Overview']
    }, client);

    assert.equal(result.success, true);
    assert.equal(result.name, 'my-template');
    assert.ok(result.placeholders.includes('{{PRODUCT_NAME}}'));
    assert.ok(result.placeholders.includes('{{PURPOSE}}'));
  });

  it('extracts sections from content when not provided', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createMockClient();

    const result = await executeTemplateTool('prd_create_template', {
      name: 'auto-sections',
      description: 'Auto section detection',
      content: '# Title\n## Introduction\n## Features\n## Timeline'
    }, client);

    assert.equal(result.success, true);
  });

  it('returns error when unauthenticated', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeTemplateTool('prd_create_template', {
      name: 'x',
      description: 'x',
      content: 'x'
    }, client);

    assert.ok(result.error);
  });
});

describe('Template Tools - handleRenderTemplate', () => {
  it('renders template with variable substitution', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeTemplateTool('prd_render_template', {
      template_name: 'standard',
      variables: {
        PRODUCT_NAME: 'My Product',
        TARGET_AUDIENCE: 'Developers'
      }
    }, client);

    assert.ok(result.content);
    assert.ok(result.content.includes('My Product'));
    assert.ok(result.content.includes('Developers'));
    assert.ok(result.variables_applied.includes('PRODUCT_NAME'));
    // Some placeholders may remain unfilled
    assert.ok(Array.isArray(result.unfilled_placeholders));
  });

  it('reports unfilled placeholders', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeTemplateTool('prd_render_template', {
      template_name: 'standard',
      variables: {} // no variables provided
    }, client);

    assert.ok(result.unfilled_placeholders.length > 0);
    assert.ok(result.message.includes('unfilled'));
  });

  it('returns error for non-existent template', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const client = createMockClient({
      searchMemory: async () => ({ results: [] })
    });

    const result = await executeTemplateTool('prd_render_template', {
      template_name: 'nonexistent',
      variables: {}
    }, client);

    assert.ok(result.error);
  });

  it('returns null for unknown tool name', async () => {
    const { executeTemplateTool } = await import('../src/tools/template-tools.js');
    const result = await executeTemplateTool('unknown', {}, createMockClient());
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// Validation Tools
// ---------------------------------------------------------------------------

describe('Validation Tools - handleScore', () => {
  it('scores a comprehensive PRD highly', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');

    const prd = `# Agent Billing PRD

## 1. Introduction
Agent billing for the AINative platform.

## 2. Problem Statement
Agents need usage tracking and billing.

## 3. Target Audience
Developers and AI agents.

## 4. User Stories
As a developer, I want to track agent usage.

## 5. Core Features and Requirements
- Metered billing
- Usage dashboards

## 6. Technical Architecture
POST /api/v1/billing/usage

Uses ZeroDB for storage.
ZeroMemory for context.

## 7. Acceptance Criteria
Given usage data, When billed, Then invoice generated.

## 8. Test Plan
Run pytest with 80% coverage.

## 9. Timeline
Phase 1: 2 weeks. Phase 2: 1 week.

## 10. Security
Authentication required. Input validation on all endpoints.

${'x'.repeat(800)}`;

    const client = createUnauthenticatedClient();
    const result = await executeValidationTool('prd_score', { content: prd }, client);

    assert.ok(result.score >= 70, `Score too low: ${result.score}`);
    assert.ok(['A', 'B', 'C'].includes(result.grade));
    assert.ok(result.breakdown.rule_score > 0);
    assert.ok(result.breakdown.word_count > 0);
    assert.ok(result.breakdown.section_count > 0);
  });

  it('scores a minimal PRD poorly', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');
    const client = createUnauthenticatedClient();

    const result = await executeValidationTool('prd_score', {
      content: 'Just a short document.'
    }, client);

    assert.ok(result.score < 50);
    assert.ok(['D', 'F'].includes(result.grade));
  });

  it('resolves content from prd_id', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');
    const client = createMockClient({
      getPlan: async () => ({
        content: '# Test\n## Introduction\nContent\n## Problem Statement\nProblem'
      })
    });

    const result = await executeValidationTool('prd_score', { prd_id: 'plan-123' }, client);
    assert.ok(typeof result.score === 'number');
  });

  it('throws when no content or prd_id provided', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');
    const client = createUnauthenticatedClient();

    await assert.rejects(
      () => executeValidationTool('prd_score', {}, client),
      /content|prd_id/i
    );
  });
});

describe('Validation Tools - handleCheckApiRefs', () => {
  it('validates correct API references', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');
    const client = createUnauthenticatedClient();

    const content = `# PRD
Uses /api/v1/zerodb/vectors/search for search.
Uses /api/v1/chat/completions for AI.
References ZeroDB and ZeroMemory services.`;

    const result = await executeValidationTool('prd_check_api_refs', { content }, client);

    assert.ok(result.api_references.total >= 2);
    assert.ok(result.service_references.total >= 2);
    assert.ok(result.service_references.valid_services.length >= 1);
  });

  it('detects unknown API paths', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');
    const client = createUnauthenticatedClient();

    const content = `# PRD
Uses /api/v1/nonexistent/endpoint for nothing.`;

    const result = await executeValidationTool('prd_check_api_refs', { content }, client);
    assert.ok(result.api_references.unknown >= 1);
    assert.ok(result.api_references.unknown_paths.length >= 1);
  });

  it('resolves content from prd_id for API check', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');
    const client = createMockClient({
      getPlan: async () => ({
        content: '# PRD\nUses /api/v1/zerodb/tables for data. References ZeroDB.'
      })
    });

    const result = await executeValidationTool('prd_check_api_refs', { prd_id: 'plan-123' }, client);
    assert.ok(typeof result.api_references.total === 'number');
  });

  it('returns null for unknown tool name', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');
    const result = await executeValidationTool('unknown', {}, createMockClient());
    assert.equal(result, null);
  });
});

describe('Validation Tools - non-strict mode', () => {
  it('skips ainative rules when strict is false', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');
    const client = createUnauthenticatedClient();

    const content = `# PRD
## Introduction
Test PRD.
## Problem Statement
Problem here.
## User Stories
As a user, I want something.
## Features
Feature 1.
## Technical Architecture
Design.
## Acceptance Criteria
Given/When/Then
## Test Plan
pytest coverage
## Timeline
2 weeks
${'x'.repeat(1000)}`;

    const resultStrict = await executeValidationTool('prd_validate', { content, strict: true }, client);
    const resultNonStrict = await executeValidationTool('prd_validate', { content, strict: false }, client);

    // Non-strict should have fewer total rules
    assert.ok(resultNonStrict.results.length < resultStrict.results.length);
  });
});

// ---------------------------------------------------------------------------
// Platform Tools - additional coverage
// ---------------------------------------------------------------------------

describe('Platform Tools - verbose listing', () => {
  it('returns full details in verbose mode', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const result = await executePlatformTool('prd_list_services', { verbose: true }, {});

    const zerodb = result.services.find(s => s.name === 'ZeroDB');
    assert.ok(zerodb.features);
    assert.ok(zerodb.api_prefix !== undefined);
    assert.ok(Array.isArray(zerodb.sdk_packages));
  });
});

describe('Platform Tools - API catalog edge cases', () => {
  it('returns partial matches when no exact match', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const result = await executePlatformTool('prd_get_api_catalog', { service: 'zero' }, {});

    // Should find partial matches for "zero" (ZeroDB, ZeroMemory, etc.)
    assert.ok(result.matches || result.service);
    if (result.matches) {
      assert.ok(result.matches.length > 0);
    }
  });

  it('returns error for completely unknown service', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const result = await executePlatformTool('prd_get_api_catalog', { service: 'xyznonexistent' }, {});
    assert.ok(result.error);
  });

  it('returns null for unknown tool name', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const result = await executePlatformTool('unknown', {}, {});
    assert.equal(result, null);
  });
});

describe('Platform Tools - suggest stack with AI', () => {
  it('includes AI recommendation when authenticated', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const client = createMockClient({
      chatCompletion: async () => ({
        choices: [{ message: { content: '{"recommendations": [{"service": "ZeroDB", "usage": "data storage"}], "architecture_notes": "Use ZeroDB"}' } }]
      })
    });

    const result = await executePlatformTool('prd_suggest_stack', {
      requirements: 'Build a database app',
      features: ['storage', 'search'],
      constraints: ['must be fast']
    }, client);

    assert.ok(result.ai_recommendation);
    assert.ok(result.suggested_stack.length >= 1);
  });

  it('handles AI suggestion failure gracefully', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const client = createMockClient({
      chatCompletion: async () => { throw new Error('AI down'); }
    });

    const result = await executePlatformTool('prd_suggest_stack', {
      requirements: 'Build something with agents'
    }, client);

    // Should still return keyword-based suggestions
    assert.ok(result.suggested_stack.length >= 1);
    assert.equal(result.ai_recommendation, null);
  });

  it('handles non-JSON AI response', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const client = createMockClient({
      chatCompletion: async () => ({
        choices: [{ message: { content: 'This is not valid JSON but useful text' } }]
      })
    });

    const result = await executePlatformTool('prd_suggest_stack', {
      requirements: 'Build a chat agent'
    }, client);

    assert.ok(result.ai_recommendation);
    assert.ok(result.ai_recommendation.raw); // falls back to raw text
  });
});

// ---------------------------------------------------------------------------
// ZeroDB Client
// ---------------------------------------------------------------------------

describe('ZeroDBClient', () => {
  it('constructs with defaults', async () => {
    const { ZeroDBClient } = await import('../src/client/zerodb-client.js');
    // Save and clear env to test true defaults
    const savedKey = process.env.ZERODB_API_KEY;
    const savedProject = process.env.ZERODB_PROJECT_ID;
    delete process.env.ZERODB_API_KEY;
    delete process.env.ZERODB_PROJECT_ID;
    try {
      const client = new ZeroDBClient();
      assert.equal(client.baseUrl, 'https://api.ainative.studio');
      assert.equal(client.apiKey, null);
      assert.equal(client.isAuthenticated, false);
    } finally {
      if (savedKey) process.env.ZERODB_API_KEY = savedKey;
      if (savedProject) process.env.ZERODB_PROJECT_ID = savedProject;
    }
  });

  it('constructs with config overrides', async () => {
    const { ZeroDBClient } = await import('../src/client/zerodb-client.js');
    const client = new ZeroDBClient({
      baseUrl: 'https://custom.api',
      apiKey: 'ak_test',
      projectId: 'proj-1'
    });

    assert.equal(client.baseUrl, 'https://custom.api');
    assert.equal(client.apiKey, 'ak_test');
    assert.equal(client.projectId, 'proj-1');
    assert.equal(client.isAuthenticated, true);
  });

  it('isAuthenticated returns true with apiKey', async () => {
    const { ZeroDBClient } = await import('../src/client/zerodb-client.js');
    const client = new ZeroDBClient({ apiKey: 'ak_test' });
    assert.equal(client.isAuthenticated, true);
  });

  it('isAuthenticated returns true with token', async () => {
    const { ZeroDBClient } = await import('../src/client/zerodb-client.js');
    const client = new ZeroDBClient();
    client.token = 'jwt-token';
    assert.equal(client.isAuthenticated, true);
  });

  it('getHeaders includes api key', async () => {
    const { ZeroDBClient } = await import('../src/client/zerodb-client.js');
    const client = new ZeroDBClient({ apiKey: 'ak_test', projectId: 'proj-1' });
    const headers = client.getHeaders();

    assert.equal(headers['x-api-key'], 'ak_test');
    assert.equal(headers['x-project-id'], 'proj-1');
    assert.equal(headers['Content-Type'], 'application/json');
  });

  it('getHeaders includes bearer token when no api key', async () => {
    const { ZeroDBClient } = await import('../src/client/zerodb-client.js');
    // Must clear env to ensure no apiKey is picked up
    const savedKey = process.env.ZERODB_API_KEY;
    delete process.env.ZERODB_API_KEY;
    try {
      const client = new ZeroDBClient();
      client.token = 'jwt-test';
      const headers = client.getHeaders();

      assert.equal(headers['Authorization'], 'Bearer jwt-test');
      assert.equal(headers['x-api-key'], undefined);
    } finally {
      if (savedKey) process.env.ZERODB_API_KEY = savedKey;
    }
  });

  it('refreshIfNeeded does nothing when token is fresh', async () => {
    const { ZeroDBClient } = await import('../src/client/zerodb-client.js');
    const client = new ZeroDBClient();
    client.token = 'jwt-test';
    client.tokenExpiry = Date.now() + 60000; // expires in 60s

    // Should not throw (no authenticate method to call)
    await client.refreshIfNeeded();
  });

  it('loadCredentials handles missing file gracefully', async () => {
    const { ZeroDBClient } = await import('../src/client/zerodb-client.js');
    const client = new ZeroDBClient();
    // This should not throw even if credentials file does not exist
    client.loadCredentials();
    // apiKey remains null if no file
  });
});
