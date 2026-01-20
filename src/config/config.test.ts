import { Config } from './config.js';
import { ConfigurationError } from '../errors/index.js';

describe('Config', () => {
  const validEnv = {
    RABBITMQ_URL: 'amqp://localhost:5672',
    QUEUE_NAME: 'test-queue',
  };

  describe('required variables', () => {
    it('should parse valid required environment variables', () => {
      const config = new Config(validEnv);

      expect(config.rabbitmqUrl).toBe('amqp://localhost:5672');
      expect(config.queueName).toBe('test-queue');
    });

    it('should throw ConfigurationError when RABBITMQ_URL is missing', () => {
      const env = { QUEUE_NAME: 'test-queue' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
      expect(() => new Config(env)).toThrow(
        'Missing required environment variable: RABBITMQ_URL'
      );
    });

    it('should throw ConfigurationError when QUEUE_NAME is missing', () => {
      const env = { RABBITMQ_URL: 'amqp://localhost:5672' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
      expect(() => new Config(env)).toThrow(
        'Missing required environment variable: QUEUE_NAME'
      );
    });

    it('should throw ConfigurationError when required variable is empty string', () => {
      const env = { ...validEnv, RABBITMQ_URL: '' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError when required variable is whitespace only', () => {
      const env = { ...validEnv, RABBITMQ_URL: '   ' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
    });

    it('should trim whitespace from required variables', () => {
      const env = {
        RABBITMQ_URL: '  amqp://localhost:5672  ',
        QUEUE_NAME: '  test-queue  ',
      };
      const config = new Config(env);

      expect(config.rabbitmqUrl).toBe('amqp://localhost:5672');
      expect(config.queueName).toBe('test-queue');
    });
  });

  describe('LOG_LEVEL', () => {
    it('should default to info when LOG_LEVEL is not set', () => {
      const config = new Config(validEnv);

      expect(config.logLevel).toBe('info');
    });

    it.each(['debug', 'info', 'warn', 'error'] as const)(
      'should accept valid log level: %s',
      (level) => {
        const env = { ...validEnv, LOG_LEVEL: level };
        const config = new Config(env);

        expect(config.logLevel).toBe(level);
      }
    );

    it('should accept uppercase log levels', () => {
      const env = { ...validEnv, LOG_LEVEL: 'DEBUG' };
      const config = new Config(env);

      expect(config.logLevel).toBe('debug');
    });

    it('should accept mixed case log levels', () => {
      const env = { ...validEnv, LOG_LEVEL: 'WaRn' };
      const config = new Config(env);

      expect(config.logLevel).toBe('warn');
    });

    it('should throw ConfigurationError for invalid log level', () => {
      const env = { ...validEnv, LOG_LEVEL: 'invalid' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
      expect(() => new Config(env)).toThrow(
        'Invalid log level: invalid. Must be one of: debug, info, warn, error'
      );
    });
  });

  describe('RECONNECT_ATTEMPTS', () => {
    it('should default to 5 when not set', () => {
      const config = new Config(validEnv);

      expect(config.reconnectAttempts).toBe(5);
    });

    it('should parse valid positive integer', () => {
      const env = { ...validEnv, RECONNECT_ATTEMPTS: '10' };
      const config = new Config(env);

      expect(config.reconnectAttempts).toBe(10);
    });

    it('should throw ConfigurationError for non-numeric value', () => {
      const env = { ...validEnv, RECONNECT_ATTEMPTS: 'abc' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
      expect(() => new Config(env)).toThrow(
        'Invalid value for RECONNECT_ATTEMPTS: must be a positive integer'
      );
    });

    it('should throw ConfigurationError for zero', () => {
      const env = { ...validEnv, RECONNECT_ATTEMPTS: '0' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for negative value', () => {
      const env = { ...validEnv, RECONNECT_ATTEMPTS: '-1' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
    });
  });

  describe('RECONNECT_DELAY_MS', () => {
    it('should default to 1000 when not set', () => {
      const config = new Config(validEnv);

      expect(config.reconnectDelayMs).toBe(1000);
    });

    it('should parse valid positive integer', () => {
      const env = { ...validEnv, RECONNECT_DELAY_MS: '2000' };
      const config = new Config(env);

      expect(config.reconnectDelayMs).toBe(2000);
    });

    it('should throw ConfigurationError for invalid value', () => {
      const env = { ...validEnv, RECONNECT_DELAY_MS: 'fast' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
    });
  });

  describe('PREFETCH_COUNT', () => {
    it('should default to 10 when not set', () => {
      const config = new Config(validEnv);

      expect(config.prefetchCount).toBe(10);
    });

    it('should parse valid positive integer', () => {
      const env = { ...validEnv, PREFETCH_COUNT: '20' };
      const config = new Config(env);

      expect(config.prefetchCount).toBe(20);
    });

    it('should throw ConfigurationError for invalid value', () => {
      const env = { ...validEnv, PREFETCH_COUNT: '0' };

      expect(() => new Config(env)).toThrow(ConfigurationError);
    });
  });

  describe('toJSON', () => {
    it('should return a copy of the configuration', () => {
      const env = {
        ...validEnv,
        LOG_LEVEL: 'debug',
        RECONNECT_ATTEMPTS: '3',
        RECONNECT_DELAY_MS: '500',
        PREFETCH_COUNT: '5',
      };
      const config = new Config(env);
      const json = config.toJSON();

      expect(json).toEqual({
        rabbitmqUrl: 'amqp://localhost:5672',
        queueName: 'test-queue',
        logLevel: 'debug',
        reconnectAttempts: 3,
        reconnectDelayMs: 500,
        prefetchCount: 5,
      });
    });

    it('should return a new object each time', () => {
      const config = new Config(validEnv);
      const json1 = config.toJSON();
      const json2 = config.toJSON();

      expect(json1).not.toBe(json2);
      expect(json1).toEqual(json2);
    });
  });

  describe('LOKI_HOST', () => {
    it('should not include loki config when LOKI_HOST is not set', () => {
      const config = new Config(validEnv);

      expect(config.loki).toBeUndefined();
    });

    it('should parse loki config when LOKI_HOST is set', () => {
      const env = { ...validEnv, LOKI_HOST: 'http://localhost:3100' };
      const config = new Config(env);

      expect(config.loki).toEqual({ host: 'http://localhost:3100' });
    });

    it('should trim whitespace from LOKI_HOST', () => {
      const env = { ...validEnv, LOKI_HOST: '  http://localhost:3100  ' };
      const config = new Config(env);

      expect(config.loki?.host).toBe('http://localhost:3100');
    });

    it('should not include loki config when LOKI_HOST is empty', () => {
      const env = { ...validEnv, LOKI_HOST: '' };
      const config = new Config(env);

      expect(config.loki).toBeUndefined();
    });

    it('should not include loki config when LOKI_HOST is whitespace only', () => {
      const env = { ...validEnv, LOKI_HOST: '   ' };
      const config = new Config(env);

      expect(config.loki).toBeUndefined();
    });
  });

  describe('LOKI_USERNAME and LOKI_PASSWORD', () => {
    it('should include basicAuth when both username and password are provided', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
        LOKI_USERNAME: 'user',
        LOKI_PASSWORD: 'pass',
      };
      const config = new Config(env);

      expect(config.loki?.basicAuth).toEqual({
        username: 'user',
        password: 'pass',
      });
    });

    it('should throw ConfigurationError when only LOKI_USERNAME is provided', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
        LOKI_USERNAME: 'user',
      };

      expect(() => new Config(env)).toThrow(ConfigurationError);
      expect(() => new Config(env)).toThrow(
        'Both LOKI_USERNAME and LOKI_PASSWORD must be provided for basic auth'
      );
    });

    it('should throw ConfigurationError when only LOKI_PASSWORD is provided', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
        LOKI_PASSWORD: 'pass',
      };

      expect(() => new Config(env)).toThrow(ConfigurationError);
      expect(() => new Config(env)).toThrow(
        'Both LOKI_USERNAME and LOKI_PASSWORD must be provided for basic auth'
      );
    });

    it('should not include basicAuth when neither username nor password are provided', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
      };
      const config = new Config(env);

      expect(config.loki?.basicAuth).toBeUndefined();
    });
  });

  describe('LOKI_LABELS', () => {
    it('should parse single label', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
        LOKI_LABELS: 'app=logger',
      };
      const config = new Config(env);

      expect(config.loki?.labels).toEqual({ app: 'logger' });
    });

    it('should parse multiple labels', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
        LOKI_LABELS: 'app=logger,env=production,version=1.0',
      };
      const config = new Config(env);

      expect(config.loki?.labels).toEqual({
        app: 'logger',
        env: 'production',
        version: '1.0',
      });
    });

    it('should trim whitespace from labels', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
        LOKI_LABELS: ' app = logger , env = test ',
      };
      const config = new Config(env);

      expect(config.loki?.labels).toEqual({ app: 'logger', env: 'test' });
    });

    it('should throw ConfigurationError for invalid label format', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
        LOKI_LABELS: 'invalid-label',
      };

      expect(() => new Config(env)).toThrow(ConfigurationError);
      expect(() => new Config(env)).toThrow('Invalid label format');
    });

    it('should throw ConfigurationError for label without value', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
        LOKI_LABELS: 'app=',
      };

      expect(() => new Config(env)).toThrow(ConfigurationError);
    });

    it('should not include labels when LOKI_LABELS is not set', () => {
      const env = {
        ...validEnv,
        LOKI_HOST: 'http://localhost:3100',
      };
      const config = new Config(env);

      expect(config.loki?.labels).toBeUndefined();
    });
  });

  describe('ConfigurationError', () => {
    it('should include field name in error', () => {
      try {
        new Config({ QUEUE_NAME: 'test' });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).field).toBe('RABBITMQ_URL');
      }
    });

    it('should include context for invalid log level', () => {
      try {
        new Config({ ...validEnv, LOG_LEVEL: 'invalid' });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        const configError = error as ConfigurationError;
        expect(configError.context?.provided).toBe('invalid');
        expect(configError.context?.valid).toEqual([
          'debug',
          'info',
          'warn',
          'error',
        ]);
      }
    });
  });
});
