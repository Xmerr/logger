/**
 * Configuration management for the AMQP Logger Service.
 */

import type { AppConfig, LogLevel, LokiConfig, DLQConfig } from '../types/index.js';
import { ConfigurationError } from '../errors/index.js';

const VALID_LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const DEFAULT_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_PREFETCH_COUNT = 10;
const DEFAULT_DLQ_ENABLED = true;
const DEFAULT_DLQ_EXCHANGE = 'dlx';
const DEFAULT_DLQ_ROUTING_KEY = 'dead-letter';

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

    const loki = this.getLokiConfig(env);
    const dlq = this.getDLQConfig(env);

    return {
      rabbitmqUrl,
      queueName,
      logLevel,
      reconnectAttempts,
      reconnectDelayMs,
      prefetchCount,
      loki,
      dlq,
    };
  }

  private getDLQConfig(env: Record<string, string | undefined>): DLQConfig {
    const enabledStr = env.DLQ_ENABLED?.trim().toLowerCase();
    const enabled =
      enabledStr === undefined || enabledStr === ''
        ? DEFAULT_DLQ_ENABLED
        : enabledStr === 'true';

    const exchange = env.DLQ_EXCHANGE?.trim() ?? DEFAULT_DLQ_EXCHANGE;
    const routingKey = env.DLQ_ROUTING_KEY?.trim() ?? DEFAULT_DLQ_ROUTING_KEY;

    return { enabled, exchange, routingKey };
  }

  private getLokiConfig(
    env: Record<string, string | undefined>
  ): LokiConfig | undefined {
    const host = env.LOKI_HOST?.trim();
    if (!host) {
      return undefined;
    }

    const username = env.LOKI_USERNAME?.trim();
    const password = env.LOKI_PASSWORD?.trim();
    const labelsStr = env.LOKI_LABELS?.trim();

    const config: LokiConfig = { host };

    if (username && password) {
      config.basicAuth = { username, password };
    } else if (username || password) {
      throw new ConfigurationError(
        'Both LOKI_USERNAME and LOKI_PASSWORD must be provided for basic auth',
        username ? 'LOKI_PASSWORD' : 'LOKI_USERNAME'
      );
    }

    if (labelsStr) {
      config.labels = this.parseLabels(labelsStr);
    }

    return config;
  }

  private parseLabels(labelsStr: string): Record<string, string> {
    const labels: Record<string, string> = {};
    const pairs = labelsStr.split(',');

    for (const pair of pairs) {
      const [key, value] = pair.split('=').map((s) => s.trim());
      if (key && value) {
        labels[key] = value;
      } else if (pair.trim()) {
        throw new ConfigurationError(
          `Invalid label format: "${pair}". Expected "key=value"`,
          'LOKI_LABELS',
          { provided: labelsStr }
        );
      }
    }

    return labels;
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

  get loki(): LokiConfig | undefined {
    return this.config.loki;
  }

  get dlq(): DLQConfig {
    return this.config.dlq;
  }

  toJSON(): AppConfig {
    return { ...this.config };
  }
}
