# AMQP Logger Service Specification

## Status: Draft
## Version: 1.0
## Last Updated: 2026-01-19

---

## 1. Overview

### 1.1 Problem Statement

There is a need to consume messages from RabbitMQ queues and log them in a structured, human-readable format for debugging, auditing, and monitoring purposes. The solution must be containerized, well-tested, and integrate with CI/CD pipelines.

**Impact**: Without this service, developers lack visibility into message flow through AMQP queues, making debugging and monitoring difficult.

### 1.2 Goals

1. Consume messages from RabbitMQ queues and log them to stdout/stderr
2. Produce colorized, pretty-printed JSON logs that are easy to read
3. Achieve 100% test coverage with enforcement in CI
4. Provide a production-ready Docker image published to Docker Hub
5. Implement robust connection handling with auto-reconnect

### 1.3 Non-Goals

1. Reading/querying logs (write-only service)
2. Message transformation or routing
3. Long-term log storage (that's the aggregator's job)
4. Web UI or API endpoints
5. Multi-broker support (RabbitMQ only for v1.0)

---

## 2. Background

### 2.1 Context

This is a greenfield project for a lightweight, single-purpose service that consumes AMQP messages and logs them. It follows the Unix philosophy of doing one thing well.

### 2.2 Current State

No existing solution - new project.

### 2.3 Prior Art

- **Logstash**: Too heavy for this use case
- **Filebeat**: Primarily file-based, not AMQP-native
- **Custom scripts**: Lack testing, reliability, and container support

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-1 | Connect to RabbitMQ using AMQP 0-9-1 protocol | Must | Via amqplib |
| FR-2 | Consume messages from configured queue(s) | Must | Queue name via env var |
| FR-3 | Log messages as pretty-printed, colorized JSON | Must | Via pino + pino-pretty |
| FR-4 | Auto-acknowledge messages after successful logging | Must | Prevent message loss |
| FR-5 | Support configurable log levels (debug/info/warn/error) | Must | Via LOG_LEVEL env var |
| FR-6 | Handle JSON parse failures gracefully | Must | Log raw + warning |
| FR-7 | Auto-reconnect on connection failure | Must | Exponential backoff |
| FR-8 | Graceful shutdown on SIGTERM/SIGINT | Should | Clean connection close |

### 3.2 Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-1 | Testing | Unit test coverage | 100% |
| NFR-2 | Performance | Message processing latency | < 10ms |
| NFR-3 | Reliability | Auto-reconnect with backoff | Max 5 retries, then exit |
| NFR-4 | Observability | Structured logging for all operations | All logs in JSON format |
| NFR-5 | Build | Docker image size | < 200MB |

### 3.3 Constraints

- Must use Node.js with TypeScript
- Must use Pino for logging
- Must use GitHub Actions for CI/CD
- Must publish to Docker Hub
- Must enforce 100% coverage before PR merge AND before Docker push

### 3.4 Assumptions

- RabbitMQ is already running and accessible
- Queue already exists (service does not create queues)
- Messages are expected to be JSON (but handles non-JSON gracefully)

---

## 4. Design

### 4.1 Proposed Solution

A lightweight TypeScript service using:
- **amqplib** for RabbitMQ connection
- **Pino** + **pino-pretty** for structured, colorized logging
- **Docker** multi-stage build for small image size
- **Jest** for testing with coverage enforcement

### 4.2 Architecture Overview

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   RabbitMQ      │─────▶│  AMQP Logger    │─────▶│  Stdout/Stderr  │
│   (Queue)       │ AMQP │  Service        │ JSON │  (Container)    │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                │
                                ▼
                         Log Aggregator
                         (External)
```

### 4.3 Key Components

| Component | Responsibility | Notes |
|-----------|---------------|-------|
| ConnectionManager | Handle RabbitMQ connection lifecycle | Reconnect logic, backoff |
| MessageConsumer | Consume and process messages | Ack handling |
| Logger | Format and output logs | Pino wrapper |
| Config | Environment variable parsing | Validation |

### 4.4 Configuration (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| RABBITMQ_URL | Yes | - | amqp://user:pass@host:port |
| QUEUE_NAME | Yes | - | Queue to consume from |
| LOG_LEVEL | No | info | debug/info/warn/error |
| RECONNECT_ATTEMPTS | No | 5 | Max reconnect attempts |
| RECONNECT_DELAY_MS | No | 1000 | Initial backoff delay |

### 4.5 Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Winston | Popular, flexible | Slower than Pino, more config | Pino is faster, simpler |
| Go implementation | Smaller binary | Different toolchain | User prefers TypeScript |
| Bunyan | Good JSON support | Less active, no pretty output | Pino has better ecosystem |

---

## 5. Implementation

### 5.1 Phases / Milestones

| Phase | Description | Deliverables |
|-------|-------------|--------------|
| 1 | Project setup | package.json, tsconfig, eslint, jest config |
| 2 | Core implementation | ConnectionManager, MessageConsumer, Logger |
| 3 | Testing | Unit tests with 100% coverage |
| 4 | Docker | Dockerfile, .dockerignore |
| 5 | CI/CD | GitHub Actions workflows |

### 5.2 Dependencies

| Dependency | Type | Purpose |
|------------|------|---------|
| amqplib | npm | RabbitMQ client |
| pino | npm | Logging |
| pino-pretty | npm | Log formatting |
| typescript | npm (dev) | Type safety |
| jest | npm (dev) | Testing |
| @types/* | npm (dev) | Type definitions |

### 5.3 GitHub Actions Workflows

**PR Workflow** (`.github/workflows/pr.yml`):
- Trigger: Pull requests to main
- Jobs: lint, test (with 100% coverage gate), build
- Must pass before merge

**Release Workflow** (`.github/workflows/release.yml`):
- Trigger: Push to main / tags
- Jobs: test (100% coverage), build Docker, push to Docker Hub
- Coverage must pass before Docker build

### 5.4 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 100% coverage hard to maintain | Medium | Medium | Write testable code, mock external deps |
| RabbitMQ connection instability | Low | High | Robust reconnect logic |

---

## 6. Success Criteria

### 6.1 Acceptance Criteria

- [ ] Service connects to RabbitMQ and consumes messages
- [ ] Messages logged as pretty-printed, colorized JSON
- [ ] 100% test coverage achieved and enforced
- [ ] Docker image builds and runs successfully
- [ ] PR workflow blocks merge on test/coverage failure
- [ ] Release workflow blocks Docker push on test/coverage failure
- [ ] Auto-reconnect works when RabbitMQ connection drops
- [ ] Graceful shutdown on SIGTERM

### 6.2 Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Test Coverage | 100% | Jest coverage report |
| Docker Image Size | < 200MB | docker images |
| Startup Time | < 2s | Manual testing |

---

## 7. Appendix

### 7.1 Glossary

| Term | Definition |
|------|------------|
| AMQP | Advanced Message Queuing Protocol |
| DLQ | Dead Letter Queue |
| Pino | Fast Node.js JSON logger |

### 7.2 References

- [amqplib documentation](https://amqp-node.github.io/amqplib/)
- [Pino documentation](https://getpino.io/)
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)

### 7.3 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-19 | Claude | Initial draft |
