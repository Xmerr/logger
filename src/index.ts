/**
 * AMQP Logger Service entry point.
 * Orchestrates all components and handles graceful shutdown.
 */

import { Config } from './config/index.js';
import { createLogger } from './logger/index.js';
import { ConnectionManager } from './connection/index.js';
import { MessageConsumer } from './consumer/index.js';
import { MessageTransformer } from './transformer/index.js';
import type { ILogger, IConnectionManager, IMessageConsumer } from './types/index.js';

export interface ServiceComponents {
  config: Config;
  logger: ILogger;
  connectionManager: IConnectionManager;
  consumer: IMessageConsumer;
}

export function createComponents(env?: Record<string, string | undefined>): ServiceComponents {
  const config = new Config(env);

  // Debug: Print Loki config
  console.log('DEBUG: Loki config:', JSON.stringify(config.loki, null, 2));

  const logger = createLogger({
    level: config.logLevel,
    pretty: process.env.NODE_ENV !== 'production',
    loki: config.loki,
  });

  const connectionManager = new ConnectionManager({
    url: config.rabbitmqUrl,
    reconnectAttempts: config.reconnectAttempts,
    reconnectDelayMs: config.reconnectDelayMs,
    logger,
  });

  const transformer = new MessageTransformer({
    defaultLabels: config.loki?.labels,
  });

  const consumer = new MessageConsumer({
    queueName: config.queueName,
    prefetchCount: config.prefetchCount,
    connectionManager,
    logger,
    transformer,
    dlq: config.dlq,
  });

  return { config, logger, connectionManager, consumer };
}

export async function startService(components: ServiceComponents): Promise<void> {
  const { logger, connectionManager, consumer } = components;

  logger.info('Starting AMQP Logger Service');

  await connectionManager.connect();
  await consumer.start();

  logger.info('AMQP Logger Service started successfully');
}

export async function stopService(components: ServiceComponents): Promise<void> {
  const { logger, connectionManager, consumer } = components;

  logger.info('Stopping AMQP Logger Service');

  await consumer.stop();
  await connectionManager.disconnect();

  logger.info('AMQP Logger Service stopped');
}

export function setupShutdownHandlers(
  components: ServiceComponents,
  processObj: NodeJS.Process = process
): void {
  const { logger } = components;
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info('Received shutdown signal', { signal });

    try {
      await stopService(components);
      processObj.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: (error as Error).message });
      processObj.exit(1);
    }
  };

  processObj.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  processObj.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

export async function main(env?: Record<string, string | undefined>): Promise<void> {
  const components = createComponents(env);
  setupShutdownHandlers(components);

  try {
    await startService(components);
  } catch (error) {
    components.logger.error('Failed to start service', {
      error: (error as Error).message,
    });
    process.exit(1);
  }
}
