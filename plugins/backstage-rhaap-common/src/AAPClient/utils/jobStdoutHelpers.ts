import { LoggerService } from '@backstage/backend-plugin-api';

export const REDACTION_PLACEHOLDER = '[REDACTED]';

const SENSITIVE_KEY_VALUE_PATTERN =
  /(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|bearer|private[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*[^\s,;]+/gi;

const BEARER_PATTERN = /\bbearer\s+\S+/gi;

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

/**
 * Redacts known sensitive patterns from a log message before writing to Show Logs.
 */
export function redactSensitiveLogMessage(message: string): string {
  let redacted = message.replace(SENSITIVE_KEY_VALUE_PATTERN, match => {
    const separatorIndex = Math.max(match.indexOf('='), match.indexOf(':'));
    const key = match.slice(0, separatorIndex).trimEnd();
    const separator = match[separatorIndex];
    const space = match[separatorIndex + 1] === ' ' ? ' ' : '';
    return `${key}${separator}${space}${REDACTION_PLACEHOLDER}`;
  });

  redacted = redacted.replace(BEARER_PATTERN, `bearer ${REDACTION_PLACEHOLDER}`);
  redacted = redacted.replace(JWT_PATTERN, REDACTION_PLACEHOLDER);

  return redacted;
}

function extractMessagesFromRecord(record: unknown): string[] | null {
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
