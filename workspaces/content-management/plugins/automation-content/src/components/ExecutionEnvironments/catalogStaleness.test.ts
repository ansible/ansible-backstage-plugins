import { isStale, VERIFICATION_STALE_AFTER_MS } from './catalogHelpers';

describe('isStale', () => {
  const now = new Date('2026-11-08T12:00:00.000Z').getTime();

  it('keeps five-month-old verifications fresh and marks seven-month-old ones stale', () => {
    const fiveMonths = new Date('2026-06-08T12:00:00.000Z').toISOString();
    const sevenMonths = new Date('2026-04-08T12:00:00.000Z').toISOString();

    expect(isStale(fiveMonths, now)).toBe(false);
    expect(isStale(sevenMonths, now)).toBe(true);
  });

  it('uses a named six-month threshold and treats missing or invalid timestamps as stale', () => {
    expect(VERIFICATION_STALE_AFTER_MS).toBe(183 * 24 * 60 * 60 * 1000);
    expect(isStale(undefined, now)).toBe(true);
    expect(isStale('not-a-timestamp', now)).toBe(true);
  });

  it('marks a timestamp stale only after the threshold has passed', () => {
    expect(
      isStale(new Date(now - VERIFICATION_STALE_AFTER_MS).toISOString(), now),
    ).toBe(false);
    expect(
      isStale(
        new Date(now - VERIFICATION_STALE_AFTER_MS - 1).toISOString(),
        now,
      ),
    ).toBe(true);
  });
});
