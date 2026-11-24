import { logSafeText } from './logSafeText';

/**
 * Repository and tag names come from registry responses. When they are
 * interpolated into log lines or error messages, a name containing
 * newlines could forge additional entries — a fake `[ERROR]` line, say.
 */
describe('logSafeText', () => {
  it('replaces newlines and other control characters with spaces', () => {
    expect(logSafeText('evil\n[ERROR] forged')).toBe('evil [ERROR] forged');
    expect(logSafeText('evil\r\nsecond line')).toBe('evil  second line');
    expect(logSafeText('tab\there')).toBe('tab here');
    expect(logSafeText('null\u0000byte')).toBe('null byte');
    expect(logSafeText('del\u007fete')).toBe('del ete');
  });

  it('leaves ordinary names untouched', () => {
    expect(logSafeText('ansible/ee')).toBe('ansible/ee');
    expect(logSafeText('café-collection')).toBe('café-collection');
  });
});
