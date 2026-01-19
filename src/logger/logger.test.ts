import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockChild = jest.fn();
const mockPinoLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: mockChild,
};

mockChild.mockReturnValue({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: mockChild,
});

const mockTransport = jest.fn();
const mockPino = jest.fn().mockReturnValue(mockPinoLogger) as jest.Mock & {
  transport: jest.Mock;
  stdTimeFunctions: { isoTime: string };
};
mockPino.transport = mockTransport;
mockPino.stdTimeFunctions = { isoTime: 'isoTime' };

jest.unstable_mockModule('pino', () => ({
  default: mockPino,
}));

const { createLogger } = await import('./logger.js');
import type { ILogger } from '../types/index.js';

describe('Logger', () => {
  let logger: ILogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChild.mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: mockChild,
    });
    logger = createLogger({ level: 'info' });
  });

  describe('createLogger', () => {
    it('should create a logger with specified level', () => {
      createLogger({ level: 'debug' });

      expect(mockPino).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'debug' }),
        undefined
      );
    });

    it('should create a logger with pretty transport when enabled', () => {
      createLogger({ level: 'info', pretty: true });

      expect(mockTransport).toHaveBeenCalledWith({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      });
    });

    it('should not use transport when pretty is false', () => {
      mockPino.mockClear();
      createLogger({ level: 'info', pretty: false });

      expect(mockPino).toHaveBeenCalledWith(expect.anything(), undefined);
    });

    it('should configure formatters', () => {
      mockPino.mockClear();
      createLogger({ level: 'info' });

      const callArgs = mockPino.mock.calls[0][0] as { formatters: { level: (label: string) => { level: string } } };
      const result = callArgs.formatters.level('info');
      expect(result).toEqual({ level: 'info' });
    });
  });

  describe('debug', () => {
    it('should log debug message without data', () => {
      logger.debug('debug message');

      expect(mockPinoLogger.debug).toHaveBeenCalledWith('debug message');
    });

    it('should log debug message with data', () => {
      const data = { key: 'value' };
      logger.debug('debug message', data);

      expect(mockPinoLogger.debug).toHaveBeenCalledWith(data, 'debug message');
    });
  });

  describe('info', () => {
    it('should log info message without data', () => {
      logger.info('info message');

      expect(mockPinoLogger.info).toHaveBeenCalledWith('info message');
    });

    it('should log info message with data', () => {
      const data = { key: 'value' };
      logger.info('info message', data);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(data, 'info message');
    });
  });

  describe('warn', () => {
    it('should log warn message without data', () => {
      logger.warn('warn message');

      expect(mockPinoLogger.warn).toHaveBeenCalledWith('warn message');
    });

    it('should log warn message with data', () => {
      const data = { key: 'value' };
      logger.warn('warn message', data);

      expect(mockPinoLogger.warn).toHaveBeenCalledWith(data, 'warn message');
    });
  });

  describe('error', () => {
    it('should log error message without data', () => {
      logger.error('error message');

      expect(mockPinoLogger.error).toHaveBeenCalledWith('error message');
    });

    it('should log error message with data', () => {
      const data = { error: 'details' };
      logger.error('error message', data);

      expect(mockPinoLogger.error).toHaveBeenCalledWith(data, 'error message');
    });
  });

  describe('child', () => {
    it('should create child logger with bindings', () => {
      const bindings = { component: 'test' };
      const childLogger = logger.child(bindings);

      expect(mockChild).toHaveBeenCalledWith(bindings);
      expect(childLogger).toBeDefined();
    });

    it('should return a functional logger', () => {
      const childLogger = logger.child({ component: 'test' });
      const childPinoLogger = mockChild.mock.results[0].value as typeof mockPinoLogger;

      childLogger.info('child message');

      expect(childPinoLogger.info).toHaveBeenCalledWith('child message');
    });

    it('should support nested child loggers', () => {
      const childLogger = logger.child({ component: 'parent' });
      const grandchildLogger = childLogger.child({ subcomponent: 'child' });

      expect(grandchildLogger).toBeDefined();
    });
  });
});
