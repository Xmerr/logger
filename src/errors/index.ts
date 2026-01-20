/**
 * Custom error classes for the AMQP Logger Service.
 */

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ConnectionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class ConsumerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConsumerError';
  }
}
