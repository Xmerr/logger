import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';
import type { ILogger, IConnectionManager, IMessageConsumer } from './types/index.js';

const mockLogger: ILogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

const mockConnectionManager: IConnectionManager = {
  state: 'disconnected',
  connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getChannel: jest.fn(),
  onStateChange: jest.fn(),
};

const mockConsumer: IMessageConsumer = {
  start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

jest.unstable_mockModule('./config/index.js', () => ({
  Config: jest.fn().mockImplementation(() => ({
    rabbitmqUrl: 'amqp://localhost',
    queueName: 'test-queue',
    logLevel: 'info',
    reconnectAttempts: 3,
    reconnectDelayMs: 1000,
    prefetchCount: 10,
  })),
}));

jest.unstable_mockModule('./logger/index.js', () => ({
  createLogger: jest.fn().mockReturnValue(mockLogger),
}));

jest.unstable_mockModule('./connection/index.js', () => ({
  ConnectionManager: jest.fn().mockImplementation(() => mockConnectionManager),
}));

jest.unstable_mockModule('./consumer/index.js', () => ({
  MessageConsumer: jest.fn().mockImplementation(() => mockConsumer),
}));

const {
  createComponents,
  startService,
  stopService,
  setupShutdownHandlers,
  main,
} = await import('./index.js');

describe('Entry Point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockConnectionManager.connect as jest.Mock).mockResolvedValue(undefined);
    (mockConnectionManager.disconnect as jest.Mock).mockResolvedValue(undefined);
    (mockConsumer.start as jest.Mock).mockResolvedValue(undefined);
    (mockConsumer.stop as jest.Mock).mockResolvedValue(undefined);
  });

  describe('createComponents', () => {
    it('should create all service components', () => {
      const components = createComponents({
        RABBITMQ_URL: 'amqp://localhost',
        QUEUE_NAME: 'test-queue',
      });

      expect(components.config).toBeDefined();
      expect(components.logger).toBeDefined();
      expect(components.connectionManager).toBeDefined();
      expect(components.consumer).toBeDefined();
    });
  });

  describe('startService', () => {
    it('should connect and start consuming', async () => {
      const components = createComponents({
        RABBITMQ_URL: 'amqp://localhost',
        QUEUE_NAME: 'test-queue',
      });

      await startService(components);

      expect(mockConnectionManager.connect).toHaveBeenCalled();
      expect(mockConsumer.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Starting AMQP Logger Service');
      expect(mockLogger.info).toHaveBeenCalledWith('AMQP Logger Service started successfully');
    });
  });

  describe('stopService', () => {
    it('should stop consumer and disconnect', async () => {
      const components = createComponents({
        RABBITMQ_URL: 'amqp://localhost',
        QUEUE_NAME: 'test-queue',
      });

      await stopService(components);

      expect(mockConsumer.stop).toHaveBeenCalled();
      expect(mockConnectionManager.disconnect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping AMQP Logger Service');
      expect(mockLogger.info).toHaveBeenCalledWith('AMQP Logger Service stopped');
    });
  });

  describe('setupShutdownHandlers', () => {
    it('should register SIGTERM handler', async () => {
      const components = createComponents({
        RABBITMQ_URL: 'amqp://localhost',
        QUEUE_NAME: 'test-queue',
      });

      const mockProcess = new EventEmitter() as NodeJS.Process;
      mockProcess.exit = jest.fn() as unknown as (code?: number) => never;

      setupShutdownHandlers(components, mockProcess);

      mockProcess.emit('SIGTERM');

      // Wait for async shutdown
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockLogger.info).toHaveBeenCalledWith('Received shutdown signal', { signal: 'SIGTERM' });
      expect(mockConsumer.stop).toHaveBeenCalled();
      expect(mockConnectionManager.disconnect).toHaveBeenCalled();
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it('should register SIGINT handler', async () => {
      const components = createComponents({
        RABBITMQ_URL: 'amqp://localhost',
        QUEUE_NAME: 'test-queue',
      });

      const mockProcess = new EventEmitter() as NodeJS.Process;
      mockProcess.exit = jest.fn() as unknown as (code?: number) => never;

      setupShutdownHandlers(components, mockProcess);

      mockProcess.emit('SIGINT');

      await new Promise((resolve) => setImmediate(resolve));

      expect(mockLogger.info).toHaveBeenCalledWith('Received shutdown signal', { signal: 'SIGINT' });
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it('should only shutdown once', async () => {
      const components = createComponents({
        RABBITMQ_URL: 'amqp://localhost',
        QUEUE_NAME: 'test-queue',
      });

      const mockProcess = new EventEmitter() as NodeJS.Process;
      mockProcess.exit = jest.fn() as unknown as (code?: number) => never;

      setupShutdownHandlers(components, mockProcess);

      mockProcess.emit('SIGTERM');
      mockProcess.emit('SIGINT');

      await new Promise((resolve) => setImmediate(resolve));

      expect(mockConsumer.stop).toHaveBeenCalledTimes(1);
    });

    it('should exit with code 1 on shutdown error', async () => {
      const components = createComponents({
        RABBITMQ_URL: 'amqp://localhost',
        QUEUE_NAME: 'test-queue',
      });

      (mockConsumer.stop as jest.Mock).mockRejectedValue(new Error('Stop failed'));

      const mockProcess = new EventEmitter() as NodeJS.Process;
      mockProcess.exit = jest.fn() as unknown as (code?: number) => never;

      setupShutdownHandlers(components, mockProcess);

      mockProcess.emit('SIGTERM');

      await new Promise((resolve) => setImmediate(resolve));

      expect(mockLogger.error).toHaveBeenCalledWith('Error during shutdown', {
        error: 'Stop failed',
      });
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('main', () => {
    it('should create components and start service', async () => {
      // Mock process to prevent actual exit
      const originalExit = process.exit;
      const originalOn = process.on.bind(process);
      process.exit = jest.fn() as unknown as (code?: number) => never;
      process.on = jest.fn().mockReturnValue(process) as typeof process.on;

      await main({
        RABBITMQ_URL: 'amqp://localhost',
        QUEUE_NAME: 'test-queue',
      });

      expect(mockConnectionManager.connect).toHaveBeenCalled();
      expect(mockConsumer.start).toHaveBeenCalled();

      process.exit = originalExit;
      process.on = originalOn;
    });

    it('should exit with code 1 on startup failure', async () => {
      (mockConnectionManager.connect as jest.Mock).mockRejectedValue(
        new Error('Connection failed')
      );

      const originalExit = process.exit;
      const originalOn = process.on.bind(process);
      const mockExit = jest.fn() as unknown as (code?: number) => never;
      process.exit = mockExit;
      process.on = jest.fn().mockReturnValue(process) as typeof process.on;

      await main({
        RABBITMQ_URL: 'amqp://localhost',
        QUEUE_NAME: 'test-queue',
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to start service', {
        error: 'Connection failed',
      });
      expect(mockExit).toHaveBeenCalledWith(1);

      process.exit = originalExit;
      process.on = originalOn;
    });
  });
});
