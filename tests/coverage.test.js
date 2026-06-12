/**
 * Comprehensive coverage tests for ainative-prd-mcp
 *
 * Mocks the ZeroDB client to test all generation-tools, memory-tools,
 * template-tools, validation-tools, and platform-tools handlers
 * that were previously uncovered due to external API dependencies.
 */

import { describe, it, before, beforeEach } from 'node:test';
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

// ---------------------------------------------------------------------------
// Skills Client
// ---------------------------------------------------------------------------

describe('SkillsClient - construction and helpers', () => {
  it('constructs with defaults', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const client = new SkillsClient();

    assert.equal(client.repo, process.env.SKILLS_REPO || 'the8genc/ai-8gent-skills');
    assert.equal(client.branch, process.env.SKILLS_BRANCH || 'main');
    assert.equal(client.zerodb, null);
  });

  it('constructs with config overrides', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const client = new SkillsClient({
      repo: 'org/skills',
      branch: 'dev',
      token: 'ghp_test',
      ttlMs: 1000
    });

    assert.equal(client.repo, 'org/skills');
    assert.equal(client.branch, 'dev');
    assert.equal(client.token, 'ghp_test');
    assert.equal(client.ttlMs, 1000);
  });

  it('_apiHeaders includes auth when token is set', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const client = new SkillsClient({ token: 'ghp_test' });
    const headers = client._apiHeaders();

    assert.equal(headers.Authorization, 'Bearer ghp_test');
    assert.equal(headers.Accept, 'application/vnd.github+json');
  });

  it('_apiHeaders has no auth when no token', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const client = new SkillsClient({ token: null });
    const headers = client._apiHeaders();

    assert.equal(headers.Authorization, undefined);
  });
});

describe('SkillsClient - parseFrontmatter', () => {
  it('parses simple key-value frontmatter', async () => {
    const { parseFrontmatter } = await import('../src/skills/skills-client.js');
    const md = `---
name: My Skill
description: A test skill
---
# Body`;

    const result = parseFrontmatter(md);
    assert.equal(result.name, 'My Skill');
    assert.equal(result.description, 'A test skill');
  });

  it('parses folded block scalar (>)', async () => {
    const { parseFrontmatter } = await import('../src/skills/skills-client.js');
    const md = `---
name: Skill
description: >
  This is a long
  folded description
---
# Body`;

    const result = parseFrontmatter(md);
    assert.equal(result.name, 'Skill');
    assert.ok(result.description.includes('This is a long'));
    assert.ok(result.description.includes('folded description'));
  });

  it('parses literal block scalar (|)', async () => {
    const { parseFrontmatter } = await import('../src/skills/skills-client.js');
    const md = `---
name: Skill
description: |
  Line one
  Line two
---
# Body`;

    const result = parseFrontmatter(md);
    assert.ok(result.description.includes('Line one'));
  });

  it('handles quoted values', async () => {
    const { parseFrontmatter } = await import('../src/skills/skills-client.js');
    const md = `---
name: "Quoted Skill"
description: 'Single quoted'
---`;

    const result = parseFrontmatter(md);
    assert.equal(result.name, 'Quoted Skill');
    assert.equal(result.description, 'Single quoted');
  });

  it('returns empty object when no frontmatter', async () => {
    const { parseFrontmatter } = await import('../src/skills/skills-client.js');
    const result = parseFrontmatter('# Just markdown\nNo frontmatter here');
    assert.deepEqual(result, {});
  });

  it('handles >- and |- block scalars', async () => {
    const { parseFrontmatter } = await import('../src/skills/skills-client.js');
    const md = `---
name: Test
description: >-
  Strip trailing
  newlines
---`;
    const result = parseFrontmatter(md);
    assert.ok(result.description.includes('Strip trailing'));
  });

  it('handles empty value after colon', async () => {
    const { parseFrontmatter } = await import('../src/skills/skills-client.js');
    const md = `---
name: Test
tags:
---`;
    const result = parseFrontmatter(md);
    assert.equal(result.name, 'Test');
    assert.equal(result.tags, '');
  });
});

describe('SkillsClient - stripFrontmatter', () => {
  it('strips frontmatter from markdown', async () => {
    const { stripFrontmatter } = await import('../src/skills/skills-client.js');
    const md = `---
name: Test
---
# Body Content`;

    const result = stripFrontmatter(md);
    assert.ok(result.startsWith('# Body Content'));
    assert.ok(!result.includes('---'));
  });

  it('returns full content when no frontmatter', async () => {
    const { stripFrontmatter } = await import('../src/skills/skills-client.js');
    const md = '# Just a doc';
    const result = stripFrontmatter(md);
    assert.equal(result, '# Just a doc');
  });
});

describe('SkillsClient - syncToZeroDB', () => {
  it('throws when zerodb is not authenticated', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const client = new SkillsClient({ zerodb: { isAuthenticated: false } });

    await assert.rejects(
      () => client.syncToZeroDB(),
      /credentials/i
    );
  });

  it('throws when zerodb is null', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const client = new SkillsClient({ zerodb: null });

    await assert.rejects(
      () => client.syncToZeroDB(),
      /credentials/i
    );
  });
});

describe('SkillsClient - searchSkills with ZeroDB hits', () => {
  it('returns zerodb results when available', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const mockZerodb = {
      isAuthenticated: true,
      searchMemory: async () => ({
        results: [{
          metadata: {
            type: 'skill',
            skill_slug: 'test-skill',
            skill_name: 'Test Skill',
            description: 'A test skill',
            references: ['ref.md']
          },
          similarity: 0.9
        }]
      })
    };

    const client = new SkillsClient({ zerodb: mockZerodb });
    const result = await client.searchSkills('test');

    assert.equal(result.source, 'zerodb');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].slug, 'test-skill');
  });

  it('falls back to GitHub keyword match when ZeroDB search fails', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const mockZerodb = {
      isAuthenticated: true,
      searchMemory: async () => { throw new Error('ZeroDB down'); }
    };

    // We need to also mock _tree and getRaw for the GitHub fallback
    const client = new SkillsClient({ zerodb: mockZerodb });
    // Pre-fill the cache to avoid real GitHub call
    client._listCache = {
      at: Date.now(),
      skills: [
        { name: 'Test Skill', slug: 'test-skill', description: 'testing skills', path: 'skills/test-skill/SKILL.md', references: [] },
        { name: 'Other', slug: 'other', description: 'something else', path: 'skills/other/SKILL.md', references: [] }
      ]
    };

    const result = await client.searchSkills('test skill');
    assert.equal(result.source, 'github');
    assert.ok(result.results.length >= 1);
    assert.equal(result.results[0].slug, 'test-skill');
  });

  it('falls back to GitHub when ZeroDB returns no skill-type results', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const mockZerodb = {
      isAuthenticated: true,
      searchMemory: async () => ({
        results: [{ metadata: { type: 'prd-reference' }, content: 'not a skill' }]
      })
    };

    const client = new SkillsClient({ zerodb: mockZerodb });
    client._listCache = {
      at: Date.now(),
      skills: [
        { name: 'Memory Skill', slug: 'memory', description: 'memory management', path: 'skills/memory/SKILL.md', references: [] }
      ]
    };

    const result = await client.searchSkills('memory');
    assert.equal(result.source, 'github');
  });

  it('falls back to GitHub when zerodb is not authenticated', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const client = new SkillsClient({ zerodb: { isAuthenticated: false } });
    client._listCache = {
      at: Date.now(),
      skills: [
        { name: 'Build', slug: 'build', description: 'build tool', path: 'skills/build/SKILL.md', references: [] }
      ]
    };

    const result = await client.searchSkills('build');
    assert.equal(result.source, 'github');
  });
});

describe('SkillsClient - listSkills cache', () => {
  it('returns cached results when within TTL', async () => {
    const { SkillsClient } = await import('../src/skills/skills-client.js');
    const client = new SkillsClient({ ttlMs: 60000 });

    const cachedSkills = [
      { name: 'Cached', slug: 'cached', description: 'cached skill', path: 'skills/cached/SKILL.md', references: [] }
    ];
    client._listCache = { at: Date.now(), skills: cachedSkills };

    const result = await client.listSkills();
    assert.equal(result.length, 1);
    assert.equal(result[0].slug, 'cached');
  });
});

// ---------------------------------------------------------------------------
// Skill Tools (executeSkillTool)
// ---------------------------------------------------------------------------

describe('Skill Tools - executeSkillTool', () => {
  // Helper to create a mock skills client
  function createMockSkillsClient(overrides = {}) {
    return {
      repo: 'test/repo',
      branch: 'main',
      zerodb: { isAuthenticated: false },
      listSkills: async () => [
        { name: 'Test Skill', slug: 'test-skill', description: 'A test', path: 'skills/test-skill/SKILL.md', references: ['ref.md'] }
      ],
      getSkill: async () => ({
        name: 'Test Skill',
        slug: 'test-skill',
        description: 'A test',
        path: 'skills/test-skill/SKILL.md',
        body: '# Test Skill\nBody content',
        content: '---\nname: Test Skill\n---\n# Test Skill\nBody content',
        references: ['ref.md'],
        source: 'https://github.com/test/repo/blob/main/skills/test-skill/SKILL.md'
      }),
      getReference: async () => '# Reference content',
      searchSkills: async () => ({
        source: 'github',
        results: [{ slug: 'test-skill', name: 'Test Skill', description: 'A test', score: 1 }]
      }),
      syncToZeroDB: async () => ({ synced: ['test-skill'], count: 1, repo: 'test/repo', branch: 'main' }),
      ...overrides
    };
  }

  it('returns error when skills client is not initialized', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const result = await executeSkillTool('skill_list', {}, {});
    assert.ok(result.error);
    assert.ok(result.error.includes('not initialized'));
  });

  it('returns error when context is null', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const result = await executeSkillTool('skill_list', {}, null);
    assert.ok(result.error);
  });

  it('skill_list returns skills from mock client', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const skills = createMockSkillsClient();
    const result = await executeSkillTool('skill_list', {}, { skills });

    assert.equal(result.count, 1);
    assert.equal(result.skills[0].slug, 'test-skill');
    assert.equal(result.repo, 'test/repo');
    assert.ok(result.message.includes('1 skill(s)'));
  });

  it('skill_list with refresh flag', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    let refreshCalled = false;
    const skills = createMockSkillsClient({
      listSkills: async ({ refresh }) => {
        refreshCalled = refresh;
        return [];
      }
    });

    const result = await executeSkillTool('skill_list', { refresh: true }, { skills });
    assert.equal(refreshCalled, true);
    assert.equal(result.count, 0);
    assert.ok(result.message.includes('No skills found'));
  });

  it('skill_get returns skill content', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const skills = createMockSkillsClient();
    const result = await executeSkillTool('skill_get', { skill: 'test-skill' }, { skills });

    assert.equal(result.slug, 'test-skill');
    assert.ok(result.body);
  });

  it('skill_get with references', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const skills = createMockSkillsClient({
      getSkill: async (id, { withReferences }) => ({
        name: 'Test',
        slug: 'test',
        body: 'body',
        references: ['ref.md'],
        reference_contents: withReferences ? { 'ref.md': '# Ref' } : undefined
      })
    });

    const result = await executeSkillTool('skill_get', { skill: 'test', with_references: true }, { skills });
    assert.ok(result.reference_contents);
  });

  it('skill_get_reference returns reference content', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const skills = createMockSkillsClient();
    const result = await executeSkillTool('skill_get_reference', { skill: 'test-skill', reference: 'ref.md' }, { skills });

    assert.equal(result.skill, 'test-skill');
    assert.equal(result.reference, 'ref.md');
    assert.equal(result.content, '# Reference content');
  });

  it('skill_search returns search results', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const skills = createMockSkillsClient();
    const result = await executeSkillTool('skill_search', { query: 'testing' }, { skills });

    assert.equal(result.query, 'testing');
    assert.equal(result.source, 'github');
    assert.ok(result.count >= 1);
  });

  it('skill_search includes hint when zerodb has no mirror', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const skills = createMockSkillsClient();
    skills.zerodb = { isAuthenticated: true };
    const result = await executeSkillTool('skill_search', { query: 'test' }, { skills });

    assert.ok(result.message.includes('skill_sync'));
  });

  it('skill_sync syncs skills', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const skills = createMockSkillsClient();
    const result = await executeSkillTool('skill_sync', {}, { skills });

    assert.equal(result.count, 1);
    assert.ok(result.message.includes('Synced 1'));
  });

  it('skill_sync with specific slug', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const skills = createMockSkillsClient();
    const result = await executeSkillTool('skill_sync', { skill: 'test-skill' }, { skills });

    assert.equal(result.count, 1);
  });

  it('returns null for unknown tool name', async () => {
    const { executeSkillTool } = await import('../src/tools/skill-tools.js');
    const skills = createMockSkillsClient();
    const result = await executeSkillTool('unknown_tool', {}, { skills });
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// Server (createMcpServer)
// ---------------------------------------------------------------------------

describe('Server - createMcpServer', () => {
  let handlers;
  const mockSkills = {
    repo: 'test/repo',
    branch: 'main',
    zerodb: { isAuthenticated: false },
    listSkills: async () => [
      { name: 'Test Skill', slug: 'test-skill', description: 'desc', path: 'skills/test-skill/SKILL.md', references: ['ref.md'] }
    ],
    getSkill: async () => ({
      name: 'Test Skill',
      slug: 'test-skill',
      description: 'desc',
      body: '# Body',
      content: '---\nname: Test\n---\n# Body',
      references: ['ref.md'],
      source: 'https://github.com/test/repo'
    }),
    getReference: async () => '# Ref',
    searchSkills: async () => ({ source: 'github', results: [{ slug: 'test-skill', name: 'Test', score: 1 }] }),
    syncToZeroDB: async () => ({ synced: ['test-skill'], count: 1, repo: 'test/repo', branch: 'main' })
  };

  before(async () => {
    const { createMcpServer } = await import('../src/server.js');
    const server = createMcpServer({
      client: createMockClient(),
      skills: mockSkills,
      serverName: 'test-server',
      version: '0.0.1'
    });
    handlers = server._requestHandlers;
  });

  it('creates server with all tools registered', async () => {
    const { ALL_TOOLS } = await import('../src/server.js');
    assert.ok(ALL_TOOLS.length >= 23);
    assert.ok(handlers.has('tools/list'));
    assert.ok(handlers.has('tools/call'));
    assert.ok(handlers.has('prompts/list'));
    assert.ok(handlers.has('prompts/get'));
  });

  it('tools/list returns all tool definitions', async () => {
    const handler = handlers.get('tools/list');
    const result = await handler({ method: 'tools/list' });
    assert.ok(result.tools.length >= 23);
    assert.ok(result.tools.every(t => t.name && t.description && t.inputSchema));
  });

  it('tools/call executes a PRD tool (prd_list_services)', async () => {
    const handler = handlers.get('tools/call');
    const result = await handler({ method: 'tools/call', params: { name: 'prd_list_services', arguments: {} } });
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.count >= 15);
  });

  it('tools/call executes a skill tool (skill_list)', async () => {
    const handler = handlers.get('tools/call');
    const result = await handler({ method: 'tools/call', params: { name: 'skill_list', arguments: {} } });
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.count, 1);
  });

  it('tools/call returns error for unknown tool', async () => {
    const handler = handlers.get('tools/call');
    const result = await handler({ method: 'tools/call', params: { name: 'nonexistent_tool', arguments: {} } });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.error.includes('Unknown tool'));
  });

  it('tools/call handles tool that returns null', async () => {
    // generation tools returns null for unknown names within the executor
    const handler = handlers.get('tools/call');
    // prd_validate with no content/prd_id should throw
    const result = await handler({ method: 'tools/call', params: { name: 'prd_validate', arguments: {} } });
    // This should be an error since resolveContent throws
    assert.equal(result.isError, true);
  });

  it('prompts/list returns skill-based prompts', async () => {
    const handler = handlers.get('prompts/list');
    const result = await handler({ method: 'prompts/list' });
    assert.equal(result.prompts.length, 1);
    assert.equal(result.prompts[0].name, 'test-skill');
    assert.ok(result.prompts[0].arguments.length === 1);
  });

  it('prompts/list handles skills fetch failure gracefully', async () => {
    const { createMcpServer } = await import('../src/server.js');
    const failServer = createMcpServer({
      client: createMockClient(),
      skills: { ...mockSkills, listSkills: async () => { throw new Error('rate limited'); } },
      serverName: 'fail-test',
      version: '0.0.1'
    });
    const handler = failServer._requestHandlers.get('prompts/list');
    const result = await handler({ method: 'prompts/list' });
    assert.deepEqual(result.prompts, []);
  });

  it('prompts/get returns skill body as prompt', async () => {
    const handler = handlers.get('prompts/get');
    const result = await handler({ method: 'prompts/get', params: { name: 'test-skill', arguments: {} } });
    assert.ok(result.messages[0].content.text.includes('# Body'));
  });

  it('prompts/get appends task input', async () => {
    const handler = handlers.get('prompts/get');
    const result = await handler({ method: 'prompts/get', params: { name: 'test-skill', arguments: { input: 'Do task X' } } });
    assert.ok(result.messages[0].content.text.includes('Do task X'));
    assert.ok(result.messages[0].content.text.includes('## Task'));
  });

  it('prompts/get includes reference file hints', async () => {
    const handler = handlers.get('prompts/get');
    const result = await handler({ method: 'prompts/get', params: { name: 'test-skill', arguments: {} } });
    assert.ok(result.messages[0].content.text.includes('ref.md'));
    assert.ok(result.messages[0].content.text.includes('skill_get_reference'));
  });

  it('tools/call error result includes hint for credentials errors', async () => {
    const { createMcpServer } = await import('../src/server.js');
    const errorServer = createMcpServer({
      client: createMockClient(),
      skills: {
        ...mockSkills,
        getSkill: async () => { throw new Error('credentials missing'); }
      },
      serverName: 'hint-test',
      version: '0.0.1'
    });
    const handler = errorServer._requestHandlers.get('tools/call');
    const result = await handler({ method: 'tools/call', params: { name: 'skill_get', arguments: { skill: 'x' } } });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.hint);
    assert.ok(parsed.hint.includes('ZERODB_API_KEY'));
  });

  it('prompts/get for skill with no references omits hint', async () => {
    const { createMcpServer } = await import('../src/server.js');
    const noRefServer = createMcpServer({
      client: createMockClient(),
      skills: {
        ...mockSkills,
        getSkill: async () => ({
          name: 'No Ref', slug: 'no-ref', description: 'no refs',
          body: '# Body', content: '# Body', references: [],
          source: 'https://github.com/test/repo'
        })
      },
      serverName: 'no-ref-test',
      version: '0.0.1'
    });
    const handler = noRefServer._requestHandlers.get('prompts/get');
    const result = await handler({ method: 'prompts/get', params: { name: 'no-ref', arguments: {} } });
    assert.ok(!result.messages[0].content.text.includes('skill_get_reference'));
  });
});
