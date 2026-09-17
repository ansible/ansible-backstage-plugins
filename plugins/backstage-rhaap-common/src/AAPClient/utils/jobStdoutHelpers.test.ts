import { LoggerService } from '@backstage/backend-plugin-api';
import {
  REDACTION_PLACEHOLDER,
  parseAndLogStdoutMessages,
  parseStdoutMessages,
  redactSensitiveLogMessage,
} from './jobStdoutHelpers';

describe('jobStdoutHelpers', () => {
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(),
    } as any;
    jest.clearAllMocks();
  });

  describe('parseStdoutMessages', () => {
    it('parses string msg values from JSON stdout lines', () => {
      const stdout = '{"msg": "First message"}\n{"msg": "Second message"}';

      expect(parseStdoutMessages(stdout)).toEqual([
        'First message',
        'Second message',
      ]);
    });

    it('parses array msg values', () => {
      const stdout = '{"msg": ["Message item 1", "Message item 2"]}';

      expect(parseStdoutMessages(stdout)).toEqual([
        'Message item 1',
        'Message item 2',
      ]);
    });

    it('parses messages with escaped quotes in JSON', () => {
      const stdout = '{"msg": "Task \\"deploy\\" failed"}';

      expect(parseStdoutMessages(stdout)).toEqual(['Task "deploy" failed']);
    });

    it('skips records marked with ansible no_log', () => {
      const stdout =
        '{"msg": "visible"}\n{"msg": "hidden", "_ansible_no_log": true}';

      expect(parseStdoutMessages(stdout)).toEqual(['visible']);
    });

    it('returns empty array when no msg values are found', () => {
      expect(parseStdoutMessages('no debug output here')).toEqual([]);
    });
  });

  describe('redactSensitiveLogMessage', () => {
    it('redacts password assignments', () => {
      expect(redactSensitiveLogMessage('user password=SuperSecret123')).toBe(
        `user password=${REDACTION_PLACEHOLDER}`,
      );
    });

    it('redacts token and api key values', () => {
      expect(redactSensitiveLogMessage('token: abc123token')).toBe(
        `token: ${REDACTION_PLACEHOLDER}`,
      );
      expect(redactSensitiveLogMessage('api_key=my-secret-key')).toBe(
        `api_key=${REDACTION_PLACEHOLDER}`,
      );
    });

    it('redacts bearer tokens and JWT-like values', () => {
      expect(
        redactSensitiveLogMessage('Authorization bearer abc.def.ghi'),
      ).toBe(`Authorization bearer ${REDACTION_PLACEHOLDER}`);
      expect(
        redactSensitiveLogMessage(
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
        ),
      ).toBe(REDACTION_PLACEHOLDER);
    });

    it('leaves safe debug messages unchanged', () => {
      expect(redactSensitiveLogMessage('Hello World!')).toBe('Hello World!');
    });
  });

  describe('parseAndLogStdoutMessages', () => {
    it('logs safe string msg values and returns the last one', () => {
      const stdout = '{"msg": "First message"}\n{"msg": "Second message"}';

      const lastMessage = parseAndLogStdoutMessages(stdout, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('First message');
      expect(mockLogger.info).toHaveBeenCalledWith('Second message');
      expect(lastMessage).toBe('Second message');
    });

    it('logs redacted values instead of raw secrets', () => {
      const stdout = '{"msg": "password=SuperSecret123"}';

      parseAndLogStdoutMessages(stdout, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        `password=${REDACTION_PLACEHOLDER}`,
      );
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        'password=SuperSecret123',
      );
    });

    it('does not log messages from no_log tasks', () => {
      const stdout = '{"msg": "hidden", "_ansible_no_log": true}';

      const lastMessage = parseAndLogStdoutMessages(stdout, mockLogger);

      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(lastMessage).toBeUndefined();
    });
  });
});
