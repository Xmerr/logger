/**
 * Configuration management for the AMQP Logger Service.
 */

import type { AppConfig, LogLevel } from '../types/index.js';
import { ConfigurationError } from '../errors/index.js';

const VALID_LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const DEFAULT_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_PREFETCH_COUNT = 10;

export class Config {
  private readonly config: AppConfig;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.config = this.parse(env);
  }

  private parse(env: Record<string, string | undefined>): AppConfig {
    const rabbitmqUrl = this.getRequiredString(env, 'RABBITMQ_URL');
    const queueName = this.getRequiredString(env, 'QUEUE_NAME');
    const logLevel = this.getLogLevel(env, 'LOG_LEVEL', DEFAULT_LOG_LEVEL);
    const reconnectAttempts = this.getPositiveInt(
      env,
      'RECONNECT_ATTEMPTS',
      DEFAULT_RECONNECT_ATTEMPTS
    );
    const reconnectDelayMs = this.getPositiveInt(
      env,
      'RECONNECT_DELAY_MS',
      DEFAULT_RECONNECT_DELAY_MS
    );
    const prefetchCount = this.getPositiveInt(
      env,
      'PREFETCH_COUNT',
      DEFAULT_PREFETCH_COUNT
    );

    return {
      rabbitmqUrl,
      queueName,
      logLevel,
      reconnectAttempts,
      reconnectDelayMs,
      prefetchCount,
    };
  }

  private getRequiredString(
    env: Record<string, string | undefined>,
    key: string
  ): string {
    const value = env[key];
    if (!value || value.trim() === '') {
      throw new ConfigurationError(
        `Missing required environment variable: ${key}`,
        key
      );
    }
    return value.trim();
  }

  private getLogLevel(
    env: Record<string, string | undefined>,
    key: string,
    defaultValue: LogLevel
  ): LogLevel {
    const value = env[key];
    if (!value) {
      return defaultValue;
    }

    const normalized = value.toLowerCase().trim() as LogLevel;
    if (!VALID_LOG_LEVELS.includes(normalized)) {
      throw new ConfigurationError(
        `Invalid log level: ${value}. Must be one of: ${VALID_LOG_LEVELS.join(', ')}`,
        key,
        { provided: value, valid: VALID_LOG_LEVELS }
      );
    }
    return normalized;
  }

  private getPositiveInt(
    env: Record<string, string | undefined>,
    key: string,
    defaultValue: number
  ): number {
    const value = env[key];
    if (!value) {
      return defaultValue;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new ConfigurationError(
        `Invalid value for ${key}: must be a positive integer`,
        key,
        { provided: value }
      );
    }
    return parsed;
  }

  get rabbitmqUrl(): string {
    return this.config.rabbitmqUrl;
  }

  get queueName(): string {
    return this.config.queueName;
  }

  get logLevel(): LogLevel {
    return this.config.logLevel;
  }

  get reconnectAttempts(): number {
    return this.config.reconnectAttempts;
  }

  get reconnectDelayMs(): number {
    return this.config.reconnectDelayMs;
  }

  get prefetchCount(): number {
    return this.config.prefetchCount;
  }

  toJSON(): AppConfig {
    return { ...this.config };
  }
}
