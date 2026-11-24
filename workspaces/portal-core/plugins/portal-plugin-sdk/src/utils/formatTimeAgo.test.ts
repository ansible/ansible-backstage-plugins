import { formatTimeAgo } from './timeUtils';

describe('formatTimeAgo', () => {
  const now = new Date(2024, 0, 15, 12);
  const secondsAgo = (seconds: number) =>
    new Date(now.getTime() - seconds * 1000).toISOString();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each<[string, string | null, string]>([
    ['missing', null, 'Never'],
    ['empty', '', 'Never'],
    ['whitespace', '   ', 'Never'],
    ['invalid', 'not-a-date', 'Invalid timestamp'],
    ['now', secondsAgo(0), 'Just now'],
    ['future', secondsAgo(-3600), 'Just now'],
    ['under a minute', secondsAgo(59), 'Just now'],
    ['one minute', secondsAgo(60), 'a minute ago'],
    ['under five minutes', secondsAgo(299), 'few minutes ago'],
    ['five minutes', secondsAgo(300), '5 minutes ago'],
    ['under an hour', secondsAgo(3599), '59 minutes ago'],
    ['an hour today', secondsAgo(3600), 'today'],
    ['yesterday', new Date(2024, 0, 14, 23).toISOString(), 'yesterday'],
    ['two days', secondsAgo(2 * 86400), 'few days ago'],
    ['five days', secondsAgo(5 * 86400), '5 days ago'],
    ['under a week', secondsAgo(6 * 86400), '6 days ago'],
    ['one week', secondsAgo(7 * 86400), 'a week ago'],
    ['two weeks', secondsAgo(14 * 86400), 'last week'],
    ['three weeks', secondsAgo(21 * 86400), '3 weeks ago'],
    ['four weeks', secondsAgo(28 * 86400), '1 month ago'],
    ['two months', secondsAgo(56 * 86400), '2 months ago'],
    ['one year', secondsAgo(365 * 86400), '1 year ago'],
    ['two years', secondsAgo(730 * 86400), '2 years ago'],
  ])(
    'formats %s without synchronization wording',
    (_label, timestamp, expected) => {
      expect(formatTimeAgo(timestamp)).toBe(expected);
    },
  );
});
