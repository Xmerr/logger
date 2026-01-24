# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RabbitMQ to Loki consumer service that forwards messages from RabbitMQ queues to Grafana Loki with automatic label extraction. Designed for logging GitHub webhook events and Claude Code hooks.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run lint           # Run ESLint
npm test               # Run all tests
npm run test:coverage  # Run tests with coverage (90% threshold required)
npm start              # Run service (requires .env file)
npm run queue:publish  # Publish test message to RabbitMQ
```

Run a single test file:
```bash
npm test -- src/config/config.test.ts
```

Run tests matching a pattern:
```bash
npm test -- --testNamePattern="should parse"
```

## Architecture

```
Message Flow:
RabbitMQ → MessageConsumer → MessageTransformer → Pino Logger → pino-loki → Loki
                                    ↓
                              Label extraction
                          (event_type, repository, etc.)
```

### Key Components

- **`src/index.ts`**: Service orchestration via `createComponents()` and `startService()`. Wires together all dependencies.

- **`src/connection/connection-manager.ts`**: RabbitMQ connection lifecycle with exponential backoff reconnection. Implements `IConnectionManager` interface.

- **`src/consumer/message-consumer.ts`**: Consumes messages, delegates to transformer, logs via injected logger. Handles DLQ (Dead Letter Queue) routing for failed messages.

- **`src/transformer/message-transformer.ts`**: Extracts Loki labels from message content. Detects event types: `pr.opened`, `pr.closed`, `pr.merged`, `claude.hook`, `unknown`.

- **`src/logger/logger.ts`**: Wraps Pino with `pino-loki` transport for Loki integration and `pino-pretty` for local dev.

- **`src/config/config.ts`**: Environment variable parsing with validation. All config accessed through `Config` class getters.

### Dependency Injection Pattern

Components receive dependencies via constructor options:
```typescript
const consumer = new MessageConsumer({
  connectionManager,  // IConnectionManager
  logger,            // ILogger
  transformer,       // MessageTransformer
  // ...
});
```

### Custom Errors

All custom errors in `src/errors/` include structured context:
- `ConfigurationError`: Invalid env vars (includes `field` name)
- `ConnectionError`: RabbitMQ issues (includes error `code`)
- `ConsumerError`: Message processing failures

## Testing

Uses Jest with ts-jest ESM preset. Tests use the arrange-act-assert pattern.

Mocking pattern for dependencies:
```typescript
const mockLogger: ILogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
};
```

## TypeScript

- ESM modules with `.js` extensions in imports
- Strict mode enabled with `noUncheckedIndexedAccess`
- All interfaces in `src/types/index.ts`

## Environment Variables

Required: `RABBITMQ_URL`, `QUEUE_NAME`, `LOKI_HOST`

See `.env.example` for all options including Loki auth and DLQ settings.

## Notes

- `dotenv` is NOT installed - use Node's `--env-file=.env` flag or set env vars directly
- Pino transports run in worker threads - transport errors don't propagate to main thread
- Coverage threshold is 90% for branches, functions, lines, and statements
