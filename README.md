# RabbitMQ to Loki Consumer

A lightweight service that consumes messages from RabbitMQ queues and forwards them to Grafana Loki with automatic label extraction. Designed for logging GitHub webhook events, Claude Code hooks, and other structured messages.

## Features

- Consumes messages from RabbitMQ using AMQP 0-9-1 protocol
- Automatic label extraction for Loki based on message content
- Detects event types: PR events (opened/closed/merged), Claude hooks
- Dead Letter Queue (DLQ) support for failed messages
- Auto-reconnect with exponential backoff
- Graceful shutdown on SIGTERM/SIGINT
- Configurable log levels and static labels

## Quick Start

### Docker Compose (Recommended)

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your configuration:
   ```bash
   RABBITMQ_URL=amqp://user:password@rabbitmq:5672
   QUEUE_NAME=github-events
   LOKI_HOST=http://loki:3100
   ```

3. Start the service:
   ```bash
   docker compose up -d
   ```

### Docker Run

```bash
docker run -d \
  -e RABBITMQ_URL=amqp://user:pass@host:5672 \
  -e QUEUE_NAME=my-queue \
  -e LOKI_HOST=http://loki:3100 \
  --name rabbitmq-loki-consumer \
  xmer/amqp-logger-service
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RABBITMQ_URL` | Yes | - | AMQP connection URL |
| `QUEUE_NAME` | Yes | - | Queue to consume from |
| `LOKI_HOST` | Yes | - | Loki push API endpoint (e.g., `http://loki:3100`) |
| `LOKI_USERNAME` | No | - | Loki basic auth username |
| `LOKI_PASSWORD` | No | - | Loki basic auth password |
| `LOKI_LABELS` | No | - | Static labels (comma-separated `key=value`) |
| `DLQ_ENABLED` | No | `true` | Enable Dead Letter Queue |
| `DLQ_EXCHANGE` | No | `dlx` | DLX exchange name |
| `DLQ_ROUTING_KEY` | No | `dead-letter` | DLQ routing key |
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `PREFETCH_COUNT` | No | `10` | RabbitMQ prefetch count |
| `RECONNECT_ATTEMPTS` | No | `5` | Max reconnection attempts |
| `RECONNECT_DELAY_MS` | No | `1000` | Initial reconnect delay (ms) |

## Message Formats

The consumer automatically extracts Loki labels based on message structure.

### PR Events

Messages with `repository` and `action` fields are detected as PR events:

```json
{
  "repository": "owner/repo-name",
  "action": "opened",
  "title": "Add new feature",
  "author": "username"
}
```

Extracted labels:
- `event_type`: `pr.opened`, `pr.closed`, or `pr.merged`
- `repository`: Repository name
- `action`: PR action

### Claude Hook Events

Messages with Claude-related type fields are detected as hook events:

```json
{
  "type": "claude.code.pre_commit",
  "repository": "owner/repo",
  "data": { ... }
}
```

Or:

```json
{
  "hook_type": "pre_commit",
  "source": "claude",
  "payload": { ... }
}
```

Extracted labels:
- `event_type`: `claude.hook`
- `hook_type`: The hook type if present
- `repository`: Repository if present

### Unknown Events

Any other JSON message will be labeled with `event_type: unknown` but still forwarded to Loki.

## Dead Letter Queue

When DLQ is enabled (default), failed messages are routed to a dead letter queue for later inspection:

- Exchange: Configured via `DLQ_EXCHANGE` (default: `dlx`)
- Queue: `<QUEUE_NAME>.dlq`
- Routing Key: Configured via `DLQ_ROUTING_KEY` (default: `dead-letter`)

Messages are sent to DLQ when:
- Processing throws an unhandled exception
- Manual acknowledgment fails

## Grafana Setup

### Import Dashboard

1. In Grafana, go to Dashboards > Import
2. Upload `grafana/dashboard.json` or paste its contents
3. Select your Loki data source
4. Click Import

### Example LogQL Queries

View all consumer logs:
```logql
{app="rabbitmq-consumer"} | json
```

Filter by event type:
```logql
{app="rabbitmq-consumer"} | json | event_type="pr.opened"
```

Message rate by event type:
```logql
sum by (event_type) (rate({app="rabbitmq-consumer"} | json [5m]))
```

See `grafana/logql-queries.md` for more examples.

## QNAP NAS Deployment

For QNAP NAS with Container Station:

1. Create a project directory:
   ```bash
   mkdir -p /share/Container/rabbitmq-loki-consumer
   cd /share/Container/rabbitmq-loki-consumer
   ```

2. Copy `compose.yml` and `.env.example` to the directory

3. Configure `.env` with your settings

4. Ensure the network exists:
   ```bash
   docker network create network
   ```

5. Deploy:
   ```bash
   docker compose up -d
   ```

## Development

### Prerequisites

- Node.js >= 20.0.0
- npm
- RabbitMQ instance
- Loki instance (for testing)

### Installation

```bash
git clone https://github.com/Xmerr/logger.git
cd logger
npm install
```

### Commands

```bash
npm run build          # Build TypeScript
npm run lint           # Run linter
npm test               # Run tests
npm run test:coverage  # Run tests with coverage
```

### Running Locally

```bash
export RABBITMQ_URL=amqp://guest:guest@localhost:5672
export QUEUE_NAME=test-queue
export LOKI_HOST=http://localhost:3100

npm run build
node dist/cli.js
```

## Architecture

```
src/
├── config/          # Environment configuration
├── connection/      # RabbitMQ connection management
├── consumer/        # Message consumption and DLQ
├── transformer/     # Message label extraction
├── logger/          # Pino + Loki transport
├── errors/          # Custom error classes
├── types/           # TypeScript interfaces
├── index.ts         # Service orchestration
└── cli.ts           # CLI entry point
```

## License

ISC
