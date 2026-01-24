# LogQL Query Examples

This document provides useful LogQL queries for monitoring and analyzing messages from the RabbitMQ to Loki consumer service.

## Basic Queries

### View all logs from the consumer
```logql
{app="rabbitmq-consumer"}
```

### View logs with JSON parsing
```logql
{app="rabbitmq-consumer"} | json
```

### Filter by log level
```logql
{app="rabbitmq-consumer"} | json | level="error"
```

```logql
{app="rabbitmq-consumer"} | json | level="warn"
```

## Event Type Queries

### PR events - opened
```logql
{app="rabbitmq-consumer"} | json | event_type="pr.opened"
```

### PR events - merged
```logql
{app="rabbitmq-consumer"} | json | event_type="pr.merged"
```

### PR events - closed
```logql
{app="rabbitmq-consumer"} | json | event_type="pr.closed"
```

### Claude hook events
```logql
{app="rabbitmq-consumer"} | json | event_type="claude.hook"
```

### Unknown event types (for debugging)
```logql
{app="rabbitmq-consumer"} | json | event_type="unknown"
```

## Repository Filtering

### Filter by specific repository
```logql
{app="rabbitmq-consumer"} | json | repository="owner/repo-name"
```

### Filter by repository pattern (regex)
```logql
{app="rabbitmq-consumer"} | json | repository=~"owner/.*"
```

## Error Analysis

### All error messages
```logql
{app="rabbitmq-consumer"} |= "error"
```

### Processing errors specifically
```logql
{app="rabbitmq-consumer"} |= "Error processing message"
```

### Failed to parse JSON
```logql
{app="rabbitmq-consumer"} |= "Failed to parse message as JSON"
```

## Rate Queries (for Grafana panels)

### Message rate by event type
```logql
sum by (event_type) (rate({app="rabbitmq-consumer"} | json | event_type != "" [5m]))
```

### Total message rate
```logql
sum(rate({app="rabbitmq-consumer"} [5m]))
```

### Error rate
```logql
sum(rate({app="rabbitmq-consumer"} |= "error" [5m]))
```

### Error percentage
```logql
sum(rate({app="rabbitmq-consumer"} |= "error" [5m]))
/
sum(rate({app="rabbitmq-consumer"} [5m]))
* 100
```

## Count Queries

### Count events by type over time range
```logql
sum by (event_type) (count_over_time({app="rabbitmq-consumer"} | json | event_type != "" [1h]))
```

### Count events by repository
```logql
sum by (repository) (count_over_time({app="rabbitmq-consumer"} | json | repository != "" [1h]))
```

### Count PR actions
```logql
sum by (action) (count_over_time({app="rabbitmq-consumer"} | json | action != "" [1h]))
```

## Advanced Queries

### PR events with specific action from specific repo
```logql
{app="rabbitmq-consumer"}
| json
| event_type=~"pr\\..*"
| repository="owner/repo"
| action="opened"
```

### Claude hooks by hook type
```logql
{app="rabbitmq-consumer"}
| json
| event_type="claude.hook"
| hook_type != ""
| line_format "{{.hook_type}}: {{.msg}}"
```

### Consumer lifecycle events
```logql
{app="rabbitmq-consumer"} |= "Consumer" |~ "(started|stopped)"
```

### Connection events
```logql
{app="rabbitmq-consumer"} |~ "(Connected|Disconnected|Connection)"
```

### DLQ events
```logql
{app="rabbitmq-consumer"} |= "DLQ"
```

## Formatting Queries

### Custom log format for PR events
```logql
{app="rabbitmq-consumer"}
| json
| event_type=~"pr\\..*"
| line_format "[{{.event_type}}] {{.repository}} - {{.action}}"
```

### Extract specific fields
```logql
{app="rabbitmq-consumer"}
| json
| keep event_type, repository, action, msg
```

## Dashboard Variables

When creating Grafana dashboards, you can use these as template queries:

### Event types variable
```logql
label_values({app="rabbitmq-consumer"} | json, event_type)
```

### Repositories variable
```logql
label_values({app="rabbitmq-consumer"} | json, repository)
```

## Tips

1. **Use `| json` early**: Place JSON parsing early in the pipeline for better performance
2. **Filter before formatting**: Apply filters before using `line_format` to reduce processing
3. **Use specific labels**: When possible, filter using Loki labels rather than log content
4. **Adjust time ranges**: Use appropriate time ranges for rate calculations (1m, 5m, 15m)
5. **Label cardinality**: Be mindful of high-cardinality labels like repository names in metrics queries
