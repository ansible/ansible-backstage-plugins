import { LoggerService } from '@backstage/backend-plugin-api';
import {
  REDACTION_PLACEHOLDER,
  extractMessagesFromRecord,
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
      expect(parseStdoutMessages('{"status": "ok"}')).toEqual([]);
    });

    it('skips non-string msg values', () => {
      expect(parseStdoutMessages('{"msg": 42}')).toEqual([]);
      expect(parseStdoutMessages('{"msg": {"nested": true}}')).toEqual([]);
    });

    it('skips invalid JSON lines that start with a brace', () => {
      expect(parseStdoutMessages('{not-valid-json}\n{"msg": "ok"}')).toEqual([
        'ok',
      ]);
    });

    it('parses msg from event_data.res records', () => {
      const stdout =
        '{"event_data": {"res": {"msg": "From event_data res", "_ansible_no_log": false}}}';

      expect(parseStdoutMessages(stdout)).toEqual(['From event_data res']);
    });

    it('parses Hello World from Controller format=txt human-readable stdout', () => {
      const stdout = `
PLAY [Hello World Sample] ******************************************************

TASK [Gathering Facts] *********************************************************
ok: [localhost]

TASK [Hello Message] ***********************************************************
ok: [localhost] => {
    "msg": "Hello World!"
}

PLAY RECAP *********************************************************************
localhost : ok=2 changed=0 unreachable=0 failed=0
`.trim();

      expect(parseStdoutMessages(stdout)).toEqual(['Hello World!']);
    });

    it('parses escaped quotes from format=txt stdout', () => {
      const stdout =
        'ok: [localhost] => {\n    "msg": "Task \\"deploy\\" failed"\n}';

      expect(parseStdoutMessages(stdout)).toEqual(['Task "deploy" failed']);
    });

    it('does not fall back to txt extraction when structured no_log filtered all msgs', () => {
      expect(
        parseStdoutMessages('{"msg": "hidden", "_ansible_no_log": true}'),
      ).toEqual([]);
    });

    it('preserves interleaved scalar and array msg order in format=txt stdout', () => {
      const stdout = `
"msg": "first"
"msg": ["second-a", "second-b"]
"msg": "third"
`.trim();

      expect(parseStdoutMessages(stdout)).toEqual([
        'first',
        'second-a',
        'second-b',
        'third',
      ]);
    });
  });

  describe('extractMessagesFromRecord', () => {
    it('returns null for non-object records', () => {
      expect(extractMessagesFromRecord(null)).toBeNull();
      expect(extractMessagesFromRecord('string')).toBeNull();
      expect(extractMessagesFromRecord(42)).toBeNull();
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

    it('redacts quoted JSON sensitive key values', () => {
      expect(redactSensitiveLogMessage('{"password":"secret"}')).toBe(
        `{"password":"${REDACTION_PLACEHOLDER}"}`,
      );
      expect(redactSensitiveLogMessage('{"token": "abc123"}')).toBe(
        `{"token": "${REDACTION_PLACEHOLDER}"}`,
      );
    });

    it('redacts authToken and auth_token spellings', () => {
      expect(redactSensitiveLogMessage('authToken=super-secret')).toBe(
        `authToken=${REDACTION_PLACEHOLDER}`,
      );
      expect(redactSensitiveLogMessage('auth_token: super-secret')).toBe(
        `auth_token: ${REDACTION_PLACEHOLDER}`,
      );
      expect(redactSensitiveLogMessage('{"authToken":"super-secret"}')).toBe(
        `{"authToken":"${REDACTION_PLACEHOLDER}"}`,
      );
    });

    it('redacts quoted values that contain escaped quotes', () => {
      expect(
        redactSensitiveLogMessage('{"password":"pre\\"remaining-secret"}'),
      ).toBe(`{"password":"${REDACTION_PLACEHOLDER}"}`);
      expect(
        redactSensitiveLogMessage('{"password":"pre\\"remaining-secret"}'),
      ).not.toContain('remaining-secret');
    });

    it('redacts complete Basic Authorization credentials', () => {
      expect(
        redactSensitiveLogMessage('Authorization: Basic dXNlcjpwYXNz'),
      ).toBe(`Authorization: Basic ${REDACTION_PLACEHOLDER}`);
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

    it('preserves interleaved msg order and returns the final message', () => {
      const stdout = `
"msg": "first"
"msg": ["second-a", "second-b"]
"msg": "third"
`.trim();

      const lastMessage = parseAndLogStdoutMessages(stdout, mockLogger);

      expect(mockLogger.info.mock.calls.map(call => call[0])).toEqual([
        'first',
        'second-a',
        'second-b',
        'third',
      ]);
      expect(lastMessage).toBe('third');
    });
  });
});
