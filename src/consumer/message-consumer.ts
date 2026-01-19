/**
 * RabbitMQ message consumption with logging.
 */

import type { Channel, ConsumeMessage } from 'amqplib';
import type { IMessageConsumer, IConnectionManager, ILogger } from '../types/index.js';

export interface MessageConsumerOptions {
  queueName: string;
  prefetchCount: number;
  connectionManager: IConnectionManager;
  logger: ILogger;
}

export class MessageConsumer implements IMessageConsumer {
  private readonly queueName: string;
  private readonly prefetchCount: number;
  private readonly connectionManager: IConnectionManager;
  private readonly logger: ILogger;
  private consumerTag: string | null = null;
  private isRunning = false;

  constructor(options: MessageConsumerOptions) {
    this.queueName = options.queueName;
    this.prefetchCount = options.prefetchCount;
    this.connectionManager = options.connectionManager;
    this.logger = options.logger.child({ component: 'MessageConsumer' });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const channel = await this.connectionManager.getChannel();
    await channel.prefetch(this.prefetchCount);

    await channel.assertQueue(this.queueName, { durable: true });

    const { consumerTag } = await channel.consume(
      this.queueName,
      (msg) => { this.handleMessage(channel, msg); },
      { noAck: false }
    );

    this.consumerTag = consumerTag;
    this.isRunning = true;
    this.logger.info('Consumer started', { queue: this.queueName, prefetch: this.prefetchCount });
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
      const parsed = this.parseMessage(content);

      if (parsed.success) {
        this.logger.info('Message received', parsed.data);
      } else {
        this.logger.warn('Failed to parse message as JSON, logging raw content', {
          raw: content,
          error: parsed.error,
        });
      }

      channel.ack(msg);
    } catch (error) {
      this.handleProcessingError(channel, msg, error as Error);
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
