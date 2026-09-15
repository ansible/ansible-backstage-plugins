import { LoggerService } from '@backstage/backend-plugin-api';

const MESSAGE_REGEX = /"msg":\s*"([^"]+)"|"msg":\s*\[(.*?)\]/gs;

/**
 * Parses job stdout text and logs ansible.builtin.debug msg values at info level.
 * Returns the last string msg found (used for failure reporting in launchJobTemplate).
 */
export function parseAndLogStdoutMessages(
  stdoutText: string,
  logger: LoggerService,
): string | undefined {
  const matches = [...stdoutText.matchAll(MESSAGE_REGEX)];
  let lastMessage: string | undefined;

  matches.forEach(match => {
    if (match[1]) {
      logger.info(match[1]);
      lastMessage = match[1];
    } else if (match[2]) {
      const arrayItems = [...match[2].matchAll(/"([^"]+)"/g)];
      arrayItems.forEach(arrayItem => {
        logger.info(arrayItem[1]);
        lastMessage = arrayItem[1];
      });
    }
  });

  return lastMessage;
}
