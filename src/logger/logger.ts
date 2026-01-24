/**
 * Pino-based logger wrapper for the AMQP Logger Service.
 */

import pino from 'pino';
import type { ILogger, LogLevel, LokiConfig } from '../types/index.js';

export interface LoggerOptions {
  level: LogLevel;
  pretty?: boolean;
  loki?: LokiConfig;
}

interface TransportTarget {
  target: string;
  options: Record<string, unknown>;
  level?: string;
}

function buildTransportTargets(options: LoggerOptions): TransportTarget[] {
  const targets: TransportTarget[] = [];

  // DEBUG: Temporarily disabled pino-pretty to isolate loki issue
  // if (options.pretty) {
  //   targets.push({
  //     target: 'pino-pretty',
  //     options: {
  //       colorize: true,
  //       translateTime: 'SYS:standard',
  //       ignore: 'pid,hostname',
  //     },
  //   });
  // }

  if (options.loki) {
    const lokiOptions: Record<string, unknown> = {
      host: options.loki.host,
      batching: false,  // Disabled for debugging - set to true in production
    };

    if (options.loki.basicAuth) {
      lokiOptions.basicAuth = options.loki.basicAuth;
    }

    if (options.loki.labels) {
      lokiOptions.labels = options.loki.labels;
    }

    targets.push({
      target: 'pino-loki',
      options: lokiOptions,
    });
  }

  return targets;
}

export function createLogger(options: LoggerOptions): ILogger {
  const targets = buildTransportTargets(options);

  // Debug: Show what targets are being created
  console.log('DEBUG: Transport targets:', JSON.stringify(targets, null, 2));

  const transport =
    targets.length > 0
      ? pino.transport({
          targets,
        })
      : undefined;

  const pinoLogger = pino(
    {
      level: options.level,
      formatters: {
        level: (label) => ({ level: label }),
      },
      // Use default epoch timestamp - pino-loki requires this format for Loki compatibility
      // (ISO timestamps cause "unmarshalerDecoder" errors in Loki)
    },
    transport
  );

  return wrapPinoLogger(pinoLogger);
}

function wrapPinoLogger(pinoLogger: pino.Logger): ILogger {
  return {
    debug(msg: string, data?: Record<string, unknown>): void {
      if (data) {
        pinoLogger.debug(data, msg);
      } else {
        pinoLogger.debug(msg);
      }
    },

    info(msg: string, data?: Record<string, unknown>): void {
      if (data) {
        pinoLogger.info(data, msg);
      } else {
        pinoLogger.info(msg);
      }
    },

    warn(msg: string, data?: Record<string, unknown>): void {
      if (data) {
        pinoLogger.warn(data, msg);
      } else {
        pinoLogger.warn(msg);
      }
    },

    error(msg: string, data?: Record<string, unknown>): void {
      if (data) {
        pinoLogger.error(data, msg);
      } else {
        pinoLogger.error(msg);
      }
    },

    child(bindings: Record<string, unknown>): ILogger {
      return wrapPinoLogger(pinoLogger.child(bindings));
    },
  };
}
