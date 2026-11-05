/**
 * Registry-controlled text made safe for a log or error line.
 *
 * Repository and tag names come from registry responses, and a name
 * containing newlines or other control characters could forge additional
 * log entries — a fake `[ERROR]` line, say — wherever it is interpolated.
 * Control characters are replaced with spaces so the name can only ever
 * read as one line.
 *
 * A linear character-class scan, not a backtracking pattern: the input is
 * hostile by definition, and the codebase's rule is to keep such scans
 * predictably cheap.
 */
export function logSafeText(value: string): string {
  // eslint-disable-next-line no-control-regex -- stripping is the point
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ');
}
