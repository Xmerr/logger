# AMQP Logger Service

A lightweight service that consumes messages from RabbitMQ queues and logs them in a structured, human-readable format for debugging, auditing, and monitoring purposes.

## Features

- Consumes messages from RabbitMQ using AMQP 0-9-1 protocol
- Pretty-printed, colorized JSON output via Pino
- Auto-reconnect with exponential backoff
- Graceful shutdown on SIGTERM/SIGINT
- Configurable log levels

## Docker Hub

The official Docker image is available on Docker Hub:

**[xmerr/amqp-logger-service](https://hub.docker.com/r/xmerr/amqp-logger-service)**

## Running with Docker

```bash
docker run -e RABBITMQ_URL=amqp://user:pass@host:5672 \
           -e QUEUE_NAME=my-queue \
           xmerr/amqp-logger-service
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RABBITMQ_URL` | Yes | - | AMQP connection URL (e.g., `amqp://user:pass@host:5672`) |
| `QUEUE_NAME` | Yes | - | Queue to consume from |
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `RECONNECT_ATTEMPTS` | No | `5` | Maximum reconnection attempts |
| `RECONNECT_DELAY_MS` | No | `1000` | Initial delay between reconnection attempts (ms) |

### Docker Compose Example

```yaml
services:
  amqp-logger:
    image: xmerr/amqp-logger-service
    environment:
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
      QUEUE_NAME: my-queue
      LOG_LEVEL: info
    depends_on:
      - rabbitmq

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
```

## Running Locally

### Prerequisites

- Node.js >= 20.0.0
- npm
- RabbitMQ instance (local or remote)

### Installation

```bash
git clone https://github.com/Xmerr/logger.git
cd logger
npm install
```

### Development

```bash
# Build TypeScript
npm run build

# Run linter
npm run lint

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Running the Service

```bash
# Set required environment variables
export RABBITMQ_URL=amqp://guest:guest@localhost:5672
export QUEUE_NAME=my-queue

# Build and run
npm run build
node dist/index.js
```

## License

ISC
