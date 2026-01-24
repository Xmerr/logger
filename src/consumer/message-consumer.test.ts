import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Channel, ConsumeMessage, Replies } from 'amqplib';
import type { ILogger, DLQConfig } from '../types/index.js';
import { MessageConsumer } from './message-consumer.js';
import { MessageTransformer } from '../transformer/index.js';

describe('MessageConsumer', () => {
  let mockChannel: {
    prefetch: jest.Mock;
    assertQueue: jest.Mock;
    assertExchange: jest.Mock;
    bindQueue: jest.Mock;
    consume: jest.Mock;
    cancel: jest.Mock;
    ack: jest.Mock;
    nack: jest.Mock;
  };
  let mockConnectionManager: {
    state: 'connected';
    connect: jest.Mock;
    disconnect: jest.Mock;
    getChannel: jest.Mock;
    onStateChange: jest.Mock;
  };
  let mockLogger: ILogger;
  let mockTransformer: MessageTransformer;
  let dlqConfig: DLQConfig;
  let messageHandler: ((msg: ConsumeMessage | null) => void) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    messageHandler = null;

    mockChannel = {
      prefetch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      assertQueue: jest.fn<() => Promise<Replies.AssertQueue>>().mockResolvedValue({ queue: 'test-queue', messageCount: 0, consumerCount: 0 }),
      assertExchange: jest.fn<() => Promise<Replies.AssertExchange>>().mockResolvedValue({ exchange: 'dlx' }),
      bindQueue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      consume: jest.fn<(queue: string, handler: (msg: ConsumeMessage | null) => void) => Promise<Replies.Consume>>().mockImplementation(
        (_queue: string, handler: (msg: ConsumeMessage | null) => void) => {
          messageHandler = handler;
          return Promise.resolve({ consumerTag: 'test-consumer-tag' });
        }
      ),
      cancel: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      ack: jest.fn(),
      nack: jest.fn(),
    };

    mockConnectionManager = {
      state: 'connected',
      connect: jest.fn(),
      disconnect: jest.fn(),
      getChannel: jest.fn<() => Promise<Channel>>().mockResolvedValue(mockChannel as unknown as Channel),
      onStateChange: jest.fn(),
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };

    mockTransformer = new MessageTransformer();

    dlqConfig = {
      enabled: true,
      exchange: 'dlx',
      routingKey: 'dead-letter',
    };
  });

  describe('start', () => {
    it('should start consuming messages', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.start();

      expect(mockConnectionManager.getChannel).toHaveBeenCalled();
      expect(mockChannel.prefetch).toHaveBeenCalledWith(10);
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Function),
        { noAck: false }
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Consumer started', {
        queue: 'test-queue',
        prefetch: 10,
        dlqEnabled: true,
      });
    });

    it('should setup DLQ when enabled', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.start();

      expect(mockChannel.assertExchange).toHaveBeenCalledWith('dlx', 'direct', { durable: true });
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test-queue.dlq', { durable: true });
      expect(mockChannel.bindQueue).toHaveBeenCalledWith('test-queue.dlq', 'dlx', 'dead-letter');
      expect(mockLogger.info).toHaveBeenCalledWith('DLQ configured', {
        exchange: 'dlx',
        queue: 'test-queue.dlq',
        routingKey: 'dead-letter',
      });
    });

    it('should configure queue with DLX arguments when DLQ enabled', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.start();

      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test-queue', {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx',
          'x-dead-letter-routing-key': 'dead-letter',
        },
      });
    });

    it('should not setup DLQ when disabled', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: { enabled: false, exchange: 'dlx', routingKey: 'dead-letter' },
      });

      await consumer.start();

      expect(mockChannel.assertExchange).not.toHaveBeenCalled();
      expect(mockChannel.bindQueue).not.toHaveBeenCalled();
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test-queue', { durable: true });
    });

    it('should not start if already running', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.start();
      await consumer.start();

      expect(mockChannel.consume).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should stop consuming messages', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.start();
      await consumer.stop();

      expect(mockChannel.cancel).toHaveBeenCalledWith('test-consumer-tag');
      expect(mockLogger.info).toHaveBeenCalledWith('Consumer stopped');
    });

    it('should not stop if not running', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.stop();

      expect(mockChannel.cancel).not.toHaveBeenCalled();
    });

    it('should ignore errors during stop', async () => {
      mockChannel.cancel.mockRejectedValue(new Error('Channel closed'));

      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.start();
      await expect(consumer.stop()).resolves.not.toThrow();
    });
  });

  describe('message handling', () => {
    it('should log valid JSON messages with labels', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.start();

      const msg = createMessage({ repository: 'owner/repo', action: 'opened' });
      if (messageHandler) messageHandler(msg);

      expect(mockLogger.info).toHaveBeenCalledWith('Message received', {
        repository: 'owner/repo',
        action: 'opened',
        _labels: expect.objectContaining({
          event_type: 'pr.opened',
          repository: 'owner/repo',
          action: 'opened',
        }),
      });
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should log warning for invalid JSON and include labels', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.start();

      const msg = createMessage('not json', false);
      if (messageHandler) messageHandler(msg);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse message as JSON, logging raw content',
        expect.objectContaining({
          raw: 'not json',
          error: expect.any(String),
          _labels: expect.objectContaining({ event_type: 'unknown' }),
        })
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should handle null messages (consumer cancelled)', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      await consumer.start();
      if (messageHandler) messageHandler(null);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Received null message (consumer cancelled by server)'
      );
    });

    it('should nack messages on processing error', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      // Mock ack to throw
      mockChannel.ack.mockImplementation(() => {
        throw new Error('Ack failed');
      });

      await consumer.start();

      const msg = createMessage({ data: 'test' });
      if (messageHandler) messageHandler(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error processing message', {
        error: 'Ack failed',
        queue: 'test-queue',
      });
    });

    it('should log error if nack fails', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
        transformer: mockTransformer,
        dlq: dlqConfig,
      });

      mockChannel.ack.mockImplementation(() => {
        throw new Error('Ack failed');
      });
      mockChannel.nack.mockImplementation(() => {
        throw new Error('Nack failed');
      });

      await consumer.start();

      const msg = createMessage({ data: 'test' });
      if (messageHandler) messageHandler(msg);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to nack message', {
        error: 'Nack failed',
      });
    });
  });

  function createMessage(content: unknown, isJson = true): ConsumeMessage {
    const contentStr = isJson ? JSON.stringify(content) : (content as string);
    return {
      content: Buffer.from(contentStr),
      fields: {
        deliveryTag: 1,
        redelivered: false,
        exchange: '',
        routingKey: 'test-queue',
        consumerTag: 'test-consumer-tag',
      },
      properties: {
        contentType: undefined,
        contentEncoding: undefined,
        headers: {},
        deliveryMode: undefined,
        priority: undefined,
        correlationId: undefined,
        replyTo: undefined,
        expiration: undefined,
        messageId: undefined,
        timestamp: undefined,
        type: undefined,
        userId: undefined,
        appId: undefined,
        clusterId: undefined,
      },
    } as ConsumeMessage;
  }
});
