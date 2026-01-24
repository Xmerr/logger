/**
 * Message transformer for extracting Loki labels from RabbitMQ messages.
 */

import type { EventType, TransformedMessage, PREvent, WorkflowEvent } from '../types/index.js';

export interface MessageTransformerOptions {
  defaultLabels?: Record<string, string>;
}

export class MessageTransformer {
  private readonly defaultLabels: Record<string, string>;

  constructor(options: MessageTransformerOptions = {}) {
    this.defaultLabels = options.defaultLabels ?? {};
  }

  transform(content: string): TransformedMessage {
    const timestamp = Date.now();

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const labels = this.extractLabels(parsed);

      return {
        labels: { ...this.defaultLabels, ...labels },
        message: content,
        timestamp,
      };
    } catch {
      return {
        labels: { ...this.defaultLabels, event_type: 'unknown' },
        message: content,
        timestamp,
      };
    }
  }

  private extractLabels(data: Record<string, unknown>): Record<string, string> {
    const labels: Record<string, string> = {};
    const eventType = this.detectEventType(data);

    labels.event_type = eventType;

    if (this.isPREvent(data)) {
      this.extractPRLabels(data, labels);
    } else if (this.isWorkflowEvent(data)) {
      this.extractWorkflowLabels(data, labels);
    } else if (this.isClaudeHookEvent(data)) {
      this.extractClaudeHookLabels(data, labels);
    }

    return labels;
  }

  private detectEventType(data: Record<string, unknown>): EventType {
    if (this.isPREvent(data)) {
      const action = data.action.toLowerCase();
      if (action === 'opened') return 'pr.opened';
      if (action === 'closed') return 'pr.closed';
      return 'pr.merged';
    }

    if (this.isWorkflowEvent(data)) {
      return 'ci.workflow';
    }

    if (this.isClaudeHookEvent(data)) {
      return 'claude.hook';
    }

    return 'unknown';
  }

  private isPREvent(data: Record<string, unknown>): data is PREvent {
    if (typeof data.repository !== 'string' || typeof data.action !== 'string') {
      return false;
    }
    return ['opened', 'closed', 'merged'].includes(data.action.toLowerCase());
  }

  private isWorkflowEvent(data: Record<string, unknown>): data is WorkflowEvent {
    return typeof data.workflow === 'string';
  }

  private isClaudeHookEvent(data: Record<string, unknown>): boolean {
    if (typeof data.type === 'string' && data.type.toLowerCase().includes('claude')) {
      return true;
    }
    if (typeof data.hook_type === 'string') {
      return true;
    }
    if (typeof data.source === 'string' && data.source.toLowerCase() === 'claude') {
      return true;
    }
    return false;
  }

  private extractPRLabels(data: PREvent, labels: Record<string, string>): void {
    labels.repository = data.repository;
    labels.action = data.action.toLowerCase();

    // Extract repo name (last segment after /)
    const repoParts = data.repository.split('/');
    labels.repo = repoParts[repoParts.length - 1] ?? data.repository;

    // Extract source if present
    if (typeof data.source === 'string') {
      labels.source = data.source.toLowerCase();
    }
  }

  private extractWorkflowLabels(data: WorkflowEvent, labels: Record<string, string>): void {
    labels.workflow = data.workflow;

    if (typeof data.repository === 'string') {
      labels.repository = data.repository;
      const repoParts = data.repository.split('/');
      labels.repo = repoParts[repoParts.length - 1] ?? data.repository;
    }

    if (typeof data.source === 'string') {
      labels.source = data.source.toLowerCase();
    }

    if (typeof data.status === 'string') {
      labels.status = data.status.toLowerCase();
    }

    if (typeof data.conclusion === 'string') {
      labels.conclusion = data.conclusion.toLowerCase();
    }
  }

  private extractClaudeHookLabels(
    data: Record<string, unknown>,
    labels: Record<string, string>
  ): void {
    if (typeof data.hook_type === 'string') {
      labels.hook_type = data.hook_type;
    } else if (typeof data.type === 'string') {
      labels.hook_type = data.type;
    }

    if (typeof data.repository === 'string') {
      labels.repository = data.repository;
    }
  }
}
