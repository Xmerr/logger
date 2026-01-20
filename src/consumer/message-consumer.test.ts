import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Channel, ConsumeMessage, Replies } from 'amqplib';
import type { ILogger } from '../types/index.js';
import { MessageConsumer } from './message-consumer.js';

describe('MessageConsumer', () => {
  let mockChannel: {
    prefetch: jest.Mock;
    assertQueue: jest.Mock;
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
  let messageHandler: ((msg: ConsumeMessage | null) => void) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    messageHandler = null;

    mockChannel = {
      prefetch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      assertQueue: jest.fn<() => Promise<Replies.AssertQueue>>().mockResolvedValue({ queue: 'test-queue', messageCount: 0, consumerCount: 0 }),
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
  });

  describe('start', () => {
    it('should start consuming messages', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
      });

      await consumer.start();

      expect(mockConnectionManager.getChannel).toHaveBeenCalled();
      expect(mockChannel.prefetch).toHaveBeenCalledWith(10);
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test-queue', { durable: true });
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Function),
        { noAck: false }
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Consumer started', {
        queue: 'test-queue',
        prefetch: 10,
      });
    });

    it('should not start if already running', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
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
      });

      await consumer.start();
      await expect(consumer.stop()).resolves.not.toThrow();
    });
  });

  describe('message handling', () => {
    it('should log valid JSON messages', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
      });

      await consumer.start();

      const msg = createMessage({ level: 'info', message: 'test' });
      if (messageHandler) messageHandler(msg);

      expect(mockLogger.info).toHaveBeenCalledWith('Message received', {
        level: 'info',
        message: 'test',
      });
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should log warning for invalid JSON and log raw content', async () => {
      const consumer = new MessageConsumer({
        queueName: 'test-queue',
        prefetchCount: 10,
        connectionManager: mockConnectionManager,
        logger: mockLogger,
      });

      await consumer.start();

      const msg = createMessage('not json', false);
      if (messageHandler) messageHandler(msg);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse message as JSON, logging raw content',
        expect.objectContaining({
          raw: 'not json',
          error: expect.any(String),
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
