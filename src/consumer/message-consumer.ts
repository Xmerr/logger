/**
 * RabbitMQ message consumption with logging and DLQ support.
 */

import type { Channel, ConsumeMessage } from 'amqplib';
import type { IMessageConsumer, IConnectionManager, ILogger, DLQConfig } from '../types/index.js';
import type { MessageTransformer } from '../transformer/index.js';

export interface MessageConsumerOptions {
  queueName: string;
  prefetchCount: number;
  connectionManager: IConnectionManager;
  logger: ILogger;
  transformer: MessageTransformer;
  dlq: DLQConfig;
}

export class MessageConsumer implements IMessageConsumer {
  private readonly queueName: string;
  private readonly prefetchCount: number;
  private readonly connectionManager: IConnectionManager;
  private readonly logger: ILogger;
  private readonly transformer: MessageTransformer;
  private readonly dlq: DLQConfig;
  private consumerTag: string | null = null;
  private isRunning = false;

  constructor(options: MessageConsumerOptions) {
    this.queueName = options.queueName;
    this.prefetchCount = options.prefetchCount;
    this.connectionManager = options.connectionManager;
    this.logger = options.logger.child({ component: 'MessageConsumer' });
    this.transformer = options.transformer;
    this.dlq = options.dlq;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const channel = await this.connectionManager.getChannel();
    await channel.prefetch(this.prefetchCount);

    if (this.dlq.enabled) {
      await this.setupDLQ(channel);
    }

    const queueOptions: Record<string, unknown> = { durable: true };
    if (this.dlq.enabled) {
      queueOptions.arguments = {
        'x-dead-letter-exchange': this.dlq.exchange,
        'x-dead-letter-routing-key': this.dlq.routingKey,
      };
    }

    await channel.assertQueue(this.queueName, queueOptions);

    const { consumerTag } = await channel.consume(
      this.queueName,
      (msg) => { this.handleMessage(channel, msg); },
      { noAck: false }
    );

    this.consumerTag = consumerTag;
    this.isRunning = true;
    this.logger.info('Consumer started', {
      queue: this.queueName,
      prefetch: this.prefetchCount,
      dlqEnabled: this.dlq.enabled,
    });
  }

  private async setupDLQ(channel: Channel): Promise<void> {
    const dlqName = `${this.queueName}.dlq`;

    await channel.assertExchange(this.dlq.exchange, 'direct', { durable: true });
    await channel.assertQueue(dlqName, { durable: true });
    await channel.bindQueue(dlqName, this.dlq.exchange, this.dlq.routingKey);

    this.logger.info('DLQ configured', {
      exchange: this.dlq.exchange,
      queue: dlqName,
      routingKey: this.dlq.routingKey,
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.consumerTag) {
      return;
    }

    try {
      const channel = await this.connectionManager.getChannel();
      await channel.cancel(this.consumerTag);
    } catch {
      // Ignore errors during stop - connection may already be closed
    }

    this.consumerTag = null;
    this.isRunning = false;
    this.logger.info('Consumer stopped');
  }

  private handleMessage(channel: Channel, msg: ConsumeMessage | null): void {
    if (!msg) {
      this.logger.warn('Received null message (consumer cancelled by server)');
      return;
    }

    try {
      const content = msg.content.toString();
      const transformed = this.transformer.transform(content);

      this.logMessage(transformed.labels, content);
      channel.ack(msg);
    } catch (error) {
      this.handleProcessingError(channel, msg, error as Error);
    }
  }

  private logMessage(labels: Record<string, string>, content: string): void {
    const parsed = this.parseMessage(content);

    if (parsed.success) {
      this.logger.info('Message received', { ...parsed.data, _labels: labels });
    } else {
      this.logger.warn('Failed to parse message as JSON, logging raw content', {
        raw: content,
        error: parsed.error,
        _labels: labels,
      });
    }
  }

  private parseMessage(content: string): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private handleProcessingError(channel: Channel, msg: ConsumeMessage, error: Error): void {
    this.logger.error('Error processing message', {
      error: error.message,
      queue: this.queueName,
    });

    // Reject message with requeue=false to send to dead-letter queue if configured
    try {
      channel.nack(msg, false, false);
    } catch (nackError) {
      this.logger.error('Failed to nack message', { error: (nackError as Error).message });
    }
  }
}
