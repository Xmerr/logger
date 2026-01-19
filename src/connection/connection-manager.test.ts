import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import type { Connection, Channel } from 'amqplib';
import type { ILogger, ConnectionState } from '../types/index.js';
import { ConnectionError } from '../errors/index.js';

class MockConnection extends EventEmitter {
  createChannel = jest.fn<() => Promise<Channel>>();
  close = jest.fn<() => Promise<void>>();
}

class MockChannel extends EventEmitter {
  close = jest.fn<() => Promise<void>>();
}

const mockConnect = jest.fn<() => Promise<Connection>>();

jest.unstable_mockModule('amqplib', () => ({
  default: { connect: mockConnect },
  connect: mockConnect,
}));

const { ConnectionManager } = await import('./connection-manager.js');

describe('ConnectionManager', () => {
  let mockConnection: MockConnection;
  let mockChannel: MockChannel;
  let mockLogger: ILogger;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockConnection = new MockConnection();
    mockChannel = new MockChannel();
    mockConnection.createChannel.mockResolvedValue(mockChannel as unknown as Channel);
    mockConnection.close.mockResolvedValue();
    mockChannel.close.mockResolvedValue();
    mockConnect.mockResolvedValue(mockConnection as unknown as Connection);

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in disconnected state', () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      expect(manager.state).toBe('disconnected');
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();

      expect(manager.state).toBe('connected');
      expect(mockConnect).toHaveBeenCalledWith('amqp://localhost');
    });

    it('should do nothing if already connected', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();
      await manager.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should retry with exponential backoff on failure', async () => {
      mockConnect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(mockConnection as unknown as Connection);

      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 5,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      const connectPromise = manager.connect();

      // First retry: 100ms delay
      await jest.advanceTimersByTimeAsync(100);
      // Second retry: 200ms delay
      await jest.advanceTimersByTimeAsync(200);

      await connectPromise;

      expect(mockConnect).toHaveBeenCalledTimes(3);
      expect(manager.state).toBe('connected');
    });

    it('should throw ConnectionError after max attempts', async () => {
      mockConnect.mockRejectedValue(new Error('Connection refused'));

      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      // Start connection and immediately set up the catch handler to prevent unhandled rejection warning
      let caughtError: unknown;
      const connectPromise = manager.connect().catch((e: unknown) => {
        caughtError = e;
      });

      // Run all pending timers
      await jest.runAllTimersAsync();
      await connectPromise;

      expect(caughtError).toBeInstanceOf(ConnectionError);
      expect((caughtError as Error).message).toBe('Failed to connect after 3 attempts');
      expect(manager.state).toBe('disconnected');
    });

    it('should notify state change callbacks', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      const states: ConnectionState[] = [];
      manager.onStateChange((state) => states.push(state));

      await manager.connect();

      expect(states).toEqual(['connecting', 'connected']);
    });
  });

  describe('disconnect', () => {
    it('should close connection and channel', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();
      await manager.getChannel();
      await manager.disconnect();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
      expect(manager.state).toBe('disconnected');
    });

    it('should handle disconnect when not connected', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.disconnect();

      expect(manager.state).toBe('disconnected');
    });

    it('should ignore errors during shutdown', async () => {
      mockChannel.close.mockRejectedValue(new Error('Close failed'));
      mockConnection.close.mockRejectedValue(new Error('Close failed'));

      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();
      await manager.getChannel();

      await expect(manager.disconnect()).resolves.not.toThrow();
    });
  });

  describe('getChannel', () => {
    it('should create and return a channel', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();
      const channel = await manager.getChannel();

      expect(channel).toBe(mockChannel);
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should reuse existing channel', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();
      const channel1 = await manager.getChannel();
      const channel2 = await manager.getChannel();

      expect(channel1).toBe(channel2);
      expect(mockConnection.createChannel).toHaveBeenCalledTimes(1);
    });

    it('should throw if not connected', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await expect(manager.getChannel()).rejects.toThrow(ConnectionError);
      await expect(manager.getChannel()).rejects.toThrow(
        'Not connected to RabbitMQ'
      );
    });
  });

  describe('connection events', () => {
    it('should handle connection error events', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();
      mockConnection.emit('error', new Error('Network error'));

      expect(mockLogger.error).toHaveBeenCalledWith('Connection error', {
        error: 'Network error',
      });
    });

    it('should handle unexpected connection close', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();
      expect(manager.state).toBe('connected');

      mockConnection.emit('close');

      expect(manager.state).toBe('disconnected');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Connection closed unexpectedly'
      );
    });
  });

  describe('channel events', () => {
    it('should handle channel error events', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();
      await manager.getChannel();
      mockChannel.emit('error', new Error('Channel error'));

      expect(mockLogger.error).toHaveBeenCalledWith('Channel error', {
        error: 'Channel error',
      });
    });

    it('should handle unexpected channel close', async () => {
      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 3,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      await manager.connect();
      await manager.getChannel();
      mockChannel.emit('close');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Channel closed unexpectedly'
      );
    });
  });

  describe('exponential backoff', () => {
    it('should calculate correct backoff delays', async () => {
      mockConnect
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(mockConnection as unknown as Connection);

      const manager = new ConnectionManager({
        url: 'amqp://localhost',
        reconnectAttempts: 5,
        reconnectDelayMs: 100,
        logger: mockLogger,
      });

      const connectPromise = manager.connect();

      // Check backoff: 100ms (2^0), 200ms (2^1), 400ms (2^2)
      await jest.advanceTimersByTimeAsync(100);
      expect(mockConnect).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(200);
      expect(mockConnect).toHaveBeenCalledTimes(3);

      await jest.advanceTimersByTimeAsync(400);
      expect(mockConnect).toHaveBeenCalledTimes(4);

      await connectPromise;
    });
  });
});
