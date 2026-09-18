import { LoggerService } from '@backstage/backend-plugin-api';

export const REDACTION_PLACEHOLDER = '[REDACTED]';

const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'api_key',
  'api-key',
  'apikey',
  'authorization',
  'bearer',
  'private_key',
  'private-key',
  'access_key',
  'access-key',
  'client_secret',
  'client-secret',
] as const;

const BASIC_AUTH_PATTERN = /\bauthorization\s*:\s*basic\s+\S+/gi;

const BEARER_PATTERN = /\bbearer\s+\S+/gi;

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Redacts known sensitive patterns from a log message before writing to Show Logs.
 */
export function redactSensitiveLogMessage(message: string): string {
  let redacted = message.replace(
    BASIC_AUTH_PATTERN,
    `Authorization: Basic ${REDACTION_PLACEHOLDER}`,
  );

  for (const key of SENSITIVE_KEYS) {
    const escapedKey = escapeRegExp(key);
    // JSON / quoted values: "password":"secret" or "password": "secret"
    redacted = redacted.replace(
      new RegExp(`("${escapedKey}")(\\s*:\\s*)"[^"]*"`, 'gi'),
      `$1$2"${REDACTION_PLACEHOLDER}"`,
    );
    // Unquoted assignments: password=secret or token: abc123
    redacted = redacted.replace(
      new RegExp(`(\\b${escapedKey})(\\s*[:=]\\s*)[^\\s,;]+`, 'gi'),
      `$1$2${REDACTION_PLACEHOLDER}`,
    );
  }

  redacted = redacted.replace(
    BEARER_PATTERN,
    `bearer ${REDACTION_PLACEHOLDER}`,
  );
  redacted = redacted.replace(JWT_PATTERN, REDACTION_PLACEHOLDER);

  return redacted;
}

/** @internal Exported for unit tests covering defensive branches. */
export function extractMessagesFromRecord(record: unknown): string[] | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const obj = record as Record<string, unknown>;
  const eventData = obj.event_data as Record<string, unknown> | undefined;
  const res =
    eventData?.res && typeof eventData.res === 'object'
      ? (eventData.res as Record<string, unknown>)
      : obj;

  if (res._ansible_no_log === true) {
    return null;
  }

  const msg = res.msg ?? obj.msg;
  if (msg === undefined || msg === null) {
    return null;
  }

  if (typeof msg === 'string') {
    return [msg];
  }

  if (Array.isArray(msg)) {
    return msg.filter((item): item is string => typeof item === 'string');
  }

  return null;
}

/**
 * Parses newline-delimited JSON stdout records and extracts msg values.
 */
export function parseStdoutMessages(stdoutText: string): string[] {
  const messages: string[] = [];

  for (const line of stdoutText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
      continue;
    }

    try {
      const record = JSON.parse(trimmed) as unknown;
      const extracted = extractMessagesFromRecord(record);
      if (extracted) {
        messages.push(...extracted);
      }
    } catch {
      // Skip lines that are not valid JSON records.
    }
  }

  return messages;
}

/**
 * Parses job stdout text and logs ansible.builtin.debug msg values at info level.
 * Sensitive values are redacted before logging. Returns the last safe message
 * found (used for failure reporting in launchJobTemplate).
 */
export function parseAndLogStdoutMessages(
  stdoutText: string,
  logger: LoggerService,
): string | undefined {
  const messages = parseStdoutMessages(stdoutText);
  let lastMessage: string | undefined;

  messages.forEach(rawMessage => {
    const safeMessage = redactSensitiveLogMessage(rawMessage);
    logger.info(safeMessage);
    lastMessage = safeMessage;
  });

  return lastMessage;
}
