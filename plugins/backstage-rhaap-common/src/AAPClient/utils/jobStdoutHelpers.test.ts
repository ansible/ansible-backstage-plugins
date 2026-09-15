import { parseAndLogStdoutMessages } from './jobStdoutHelpers';

describe('parseAndLogStdoutMessages', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs string msg values and returns the last one', () => {
    const stdout =
      '{"msg": "First message"}\n{"msg": "Second message"}';

    const lastMessage = parseAndLogStdoutMessages(stdout, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith('First message');
    expect(mockLogger.info).toHaveBeenCalledWith('Second message');
    expect(lastMessage).toBe('Second message');
  });

  it('logs array msg values and returns the last item', () => {
    const stdout = '{"msg": ["Message item 1", "Message item 2"]}';

    const lastMessage = parseAndLogStdoutMessages(stdout, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith('Message item 1');
    expect(mockLogger.info).toHaveBeenCalledWith('Message item 2');
    expect(lastMessage).toBe('Message item 2');
  });

  it('returns undefined when no msg values are found', () => {
    const lastMessage = parseAndLogStdoutMessages('no debug output here', mockLogger);

    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(lastMessage).toBeUndefined();
  });
});
