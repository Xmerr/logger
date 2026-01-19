/**
 * Pino-based logger wrapper for the AMQP Logger Service.
 */

import pino from 'pino';
import type { ILogger, LogLevel } from '../types/index.js';

export interface LoggerOptions {
  level: LogLevel;
  pretty?: boolean;
}

export function createLogger(options: LoggerOptions): ILogger {
  const transport = options.pretty
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      })
    : undefined;

  const pinoLogger = pino(
    {
      level: options.level,
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
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
