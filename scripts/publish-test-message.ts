#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Publishes a test message to the configured RabbitMQ queue.
 * Usage: npm run queue:publish [message]
 */

import amqplib from 'amqplib';

const rabbitmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
const queueName = process.env.QUEUE_NAME ?? 'github-events';

const defaultMessage = {
  event: 'test',
  repository: 'test/repo',
  action: 'test-action',
  timestamp: new Date().toISOString(),
  data: {
    message: 'Test message from publish script',
  },
};

async function publishMessage(): Promise<void> {
  const customMessage = process.argv[2];
  const messageContent = customMessage
    ? JSON.parse(customMessage)
    : defaultMessage;

  const connection = await amqplib.connect(rabbitmqUrl);
  const channel = await connection.createChannel();

  await channel.checkQueue(queueName);
  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(messageContent)), {
    persistent: true,
  });

  console.log(`Published to ${queueName}:`, JSON.stringify(messageContent, null, 2));

  await channel.close();
  await connection.close();
}

publishMessage().catch((error: unknown) => {
  console.error('Failed to publish message:', error);
  process.exit(1);
});
