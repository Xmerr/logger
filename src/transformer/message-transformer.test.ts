import { describe, it, expect, beforeEach } from '@jest/globals';
import { MessageTransformer } from './message-transformer.js';

describe('MessageTransformer', () => {
  let transformer: MessageTransformer;

  beforeEach(() => {
    transformer = new MessageTransformer();
  });

  describe('transform', () => {
    it('should return timestamp with transformed message', () => {
      const before = Date.now();
      const result = transformer.transform('{"test": "data"}');
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should preserve original message content', () => {
      const content = '{"test": "data"}';
      const result = transformer.transform(content);

      expect(result.message).toBe(content);
    });
  });

  describe('PR events', () => {
    it('should detect pr.opened event', () => {
      const content = JSON.stringify({
        repository: 'owner/repo',
        action: 'opened',
        title: 'Test PR',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('pr.opened');
      expect(result.labels.repository).toBe('owner/repo');
      expect(result.labels.action).toBe('opened');
    });

    it('should detect pr.closed event', () => {
      const content = JSON.stringify({
        repository: 'owner/repo',
        action: 'closed',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('pr.closed');
      expect(result.labels.action).toBe('closed');
    });

    it('should detect pr.merged event', () => {
      const content = JSON.stringify({
        repository: 'owner/repo',
        action: 'merged',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('pr.merged');
      expect(result.labels.action).toBe('merged');
    });

    it('should handle uppercase action', () => {
      const content = JSON.stringify({
        repository: 'owner/repo',
        action: 'OPENED',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('pr.opened');
      expect(result.labels.action).toBe('opened');
    });

    it('should extract repo label from repository', () => {
      const content = JSON.stringify({
        repository: 'Xmerr/Square-Gardener',
        action: 'opened',
      });
      const result = transformer.transform(content);

      expect(result.labels.repo).toBe('Square-Gardener');
      expect(result.labels.repository).toBe('Xmerr/Square-Gardener');
    });

    it('should handle single-segment repository name', () => {
      const content = JSON.stringify({
        repository: 'my-repo',
        action: 'opened',
      });
      const result = transformer.transform(content);

      expect(result.labels.repo).toBe('my-repo');
      expect(result.labels.repository).toBe('my-repo');
    });

    it('should extract source label when present', () => {
      const content = JSON.stringify({
        repository: 'owner/repo',
        action: 'opened',
        source: 'GitHub',
      });
      const result = transformer.transform(content);

      expect(result.labels.source).toBe('github');
    });

    it('should not include source label when absent', () => {
      const content = JSON.stringify({
        repository: 'owner/repo',
        action: 'opened',
      });
      const result = transformer.transform(content);

      expect(result.labels.source).toBeUndefined();
    });
  });

  describe('CI workflow events', () => {
    it('should detect ci.workflow event', () => {
      const content = JSON.stringify({
        workflow: 'Build and Deploy',
        repository: 'Xmerr/logger',
        source: 'github',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('ci.workflow');
      expect(result.labels.workflow).toBe('Build and Deploy');
      expect(result.labels.repository).toBe('Xmerr/logger');
      expect(result.labels.repo).toBe('logger');
      expect(result.labels.source).toBe('github');
    });

    it('should extract status and conclusion when present', () => {
      const content = JSON.stringify({
        workflow: 'Tests',
        status: 'completed',
        conclusion: 'success',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('ci.workflow');
      expect(result.labels.status).toBe('completed');
      expect(result.labels.conclusion).toBe('success');
    });

    it('should handle workflow without optional fields', () => {
      const content = JSON.stringify({
        workflow: 'Simple Job',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('ci.workflow');
      expect(result.labels.workflow).toBe('Simple Job');
      expect(result.labels.repository).toBeUndefined();
      expect(result.labels.source).toBeUndefined();
    });

    it('should lowercase source, status, and conclusion', () => {
      const content = JSON.stringify({
        workflow: 'Build',
        source: 'GitHub',
        status: 'COMPLETED',
        conclusion: 'FAILURE',
      });
      const result = transformer.transform(content);

      expect(result.labels.source).toBe('github');
      expect(result.labels.status).toBe('completed');
      expect(result.labels.conclusion).toBe('failure');
    });
  });

  describe('Claude hook events', () => {
    it('should detect claude hook event by type field', () => {
      const content = JSON.stringify({
        type: 'claude.code.pre_commit',
        data: { test: 'value' },
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('claude.hook');
      expect(result.labels.hook_type).toBe('claude.code.pre_commit');
    });

    it('should detect claude hook event by hook_type field', () => {
      const content = JSON.stringify({
        hook_type: 'pre_commit',
        repository: 'owner/repo',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('claude.hook');
      expect(result.labels.hook_type).toBe('pre_commit');
      expect(result.labels.repository).toBe('owner/repo');
    });

    it('should detect claude hook event by source field', () => {
      const content = JSON.stringify({
        source: 'claude',
        event: 'some_event',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('claude.hook');
    });
  });

  describe('unknown events', () => {
    it('should label unknown JSON as unknown', () => {
      const content = JSON.stringify({ some: 'data' });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('unknown');
    });

    it('should label invalid JSON as unknown', () => {
      const content = 'not valid json';
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('unknown');
    });

    it('should label PR event with unknown action as unknown', () => {
      const content = JSON.stringify({
        repository: 'owner/repo',
        action: 'reviewed',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('unknown');
    });
  });

  describe('default labels', () => {
    it('should include default labels', () => {
      transformer = new MessageTransformer({
        defaultLabels: { app: 'test', env: 'dev' },
      });
      const result = transformer.transform('{"test": "data"}');

      expect(result.labels.app).toBe('test');
      expect(result.labels.env).toBe('dev');
    });

    it('should merge default labels with extracted labels', () => {
      transformer = new MessageTransformer({
        defaultLabels: { app: 'test' },
      });
      const content = JSON.stringify({
        repository: 'owner/repo',
        action: 'opened',
      });
      const result = transformer.transform(content);

      expect(result.labels.app).toBe('test');
      expect(result.labels.event_type).toBe('pr.opened');
    });

    it('should allow extracted labels to override default labels', () => {
      transformer = new MessageTransformer({
        defaultLabels: { event_type: 'default' },
      });
      const content = JSON.stringify({
        repository: 'owner/repo',
        action: 'opened',
      });
      const result = transformer.transform(content);

      expect(result.labels.event_type).toBe('pr.opened');
    });
  });
});
