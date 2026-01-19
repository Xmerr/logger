/**
 * RabbitMQ connection lifecycle management.
 */

import * as amqplib from 'amqplib';
import type { Channel } from 'amqplib';
import type { IConnectionManager, ConnectionState, StateChangeCallback, ILogger } from '../types/index.js';
import { ConnectionError } from '../errors/index.js';

interface AmqpConnection {
  createChannel(): Promise<Channel>;
  close(): Promise<void>;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'close', listener: () => void): this;
}

export interface ConnectionManagerOptions {
  url: string;
  reconnectAttempts: number;
  reconnectDelayMs: number;
  logger: ILogger;
}

export class ConnectionManager implements IConnectionManager {
  private _state: ConnectionState = 'disconnected';
  private connection: AmqpConnection | null = null;
  private channel: Channel | null = null;
  private stateCallbacks: StateChangeCallback[] = [];
  private isShuttingDown = false;

  private readonly url: string;
  private readonly reconnectAttempts: number;
  private readonly reconnectDelayMs: number;
  private readonly logger: ILogger;

  constructor(options: ConnectionManagerOptions) {
    this.url = options.url;
    this.reconnectAttempts = options.reconnectAttempts;
    this.reconnectDelayMs = options.reconnectDelayMs;
    this.logger = options.logger.child({ component: 'ConnectionManager' });
  }

  get state(): ConnectionState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this._state === 'connected') {
      return;
    }

    this.setState('connecting');

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.reconnectAttempts; attempt++) {
      try {
        this.logger.info('Connecting to RabbitMQ', { attempt: attempt + 1, maxAttempts: this.reconnectAttempts });
        this.connection = await amqplib.connect(this.url) as unknown as AmqpConnection;

        this.setupConnectionHandlers();
        this.setState('connected');
        this.logger.info('Connected to RabbitMQ');
        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn('Connection attempt failed', {
          attempt: attempt + 1,
          error: lastError.message,
        });

        if (attempt < this.reconnectAttempts - 1 && !this.isShuttingDown) {
          const delay = this.calculateBackoff(attempt);
          this.logger.info('Waiting before retry', { delayMs: delay });
          await this.sleep(delay);
        }
      }
    }

    this.setState('disconnected');
    throw new ConnectionError(
      `Failed to connect after ${String(this.reconnectAttempts)} attempts`,
      'CONNECTION_FAILED',
      { lastError: lastError?.message }
    );
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    if (this.channel) {
      try {
        await this.channel.close();
      } catch {
        // Ignore channel close errors during shutdown
      }
      this.channel = null;
    }

    if (this.connection) {
      try {
        await this.connection.close();
      } catch {
        // Ignore connection close errors during shutdown
      }
      this.connection = null;
    }

    this.setState('disconnected');
    this.logger.info('Disconnected from RabbitMQ');
  }

  async getChannel(): Promise<Channel> {
    if (this._state !== 'connected' || !this.connection) {
      throw new ConnectionError('Not connected to RabbitMQ', 'NOT_CONNECTED');
    }

    if (!this.channel) {
      const channel = await this.connection.createChannel();
      this.channel = channel;
      this.setupChannelHandlers();
      return channel;
    }

    return this.channel;
  }

  onStateChange(callback: StateChangeCallback): void {
    this.stateCallbacks.push(callback);
  }

  private setState(state: ConnectionState): void {
    if (this._state !== state) {
      this._state = state;
      this.stateCallbacks.forEach((cb) => { cb(state); });
    }
  }

  private setupConnectionHandlers(): void {
    if (!this.connection) return;

    this.connection.on('error', (error: Error) => {
      this.logger.error('Connection error', { error: error.message });
    });

    this.connection.on('close', () => {
      if (!this.isShuttingDown) {
        this.logger.warn('Connection closed unexpectedly');
        this.channel = null;
        this.connection = null;
        this.setState('disconnected');
      }
    });
  }

  private setupChannelHandlers(): void {
    if (!this.channel) return;

    this.channel.on('error', (error: Error) => {
      this.logger.error('Channel error', { error: error.message });
    });

    this.channel.on('close', () => {
      if (!this.isShuttingDown) {
        this.logger.warn('Channel closed unexpectedly');
        this.channel = null;
      }
    });
  }

  private calculateBackoff(attempt: number): number {
    return this.reconnectDelayMs * Math.pow(2, attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
