/**
 * Shared types and interfaces for the AMQP Logger Service.
 */

import type { Channel } from 'amqplib';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LokiConfig {
  host: string;
  basicAuth?: {
    username: string;
    password: string;
  };
  labels?: Record<string, string>;
}

export interface AppConfig {
  rabbitmqUrl: string;
  queueName: string;
  logLevel: LogLevel;
  reconnectAttempts: number;
  reconnectDelayMs: number;
  prefetchCount: number;
  loki?: LokiConfig;
  dlq: DLQConfig;
}

export interface ILogger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): ILogger;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export type StateChangeCallback = (state: ConnectionState) => void;

export interface IConnectionManager {
  readonly state: ConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getChannel(): Promise<Channel>;
  onStateChange(callback: StateChangeCallback): void;
}

export interface IMessageConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type EventType = 'pr.opened' | 'pr.closed' | 'pr.merged' | 'ci.workflow' | 'claude.hook' | 'unknown';

export interface WorkflowEvent {
  workflow: string;
  repository?: string;
  source?: string;
  status?: string;
  conclusion?: string;
  [key: string]: unknown;
}

export interface TransformedMessage {
  labels: Record<string, string>;
  message: string;
  timestamp: number;
}

export interface PREvent {
  repository: string;
  action: string;
  source?: string;
  [key: string]: unknown;
}

export interface DLQConfig {
  enabled: boolean;
  exchange: string;
  routingKey: string;
}
