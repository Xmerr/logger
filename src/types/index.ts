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
