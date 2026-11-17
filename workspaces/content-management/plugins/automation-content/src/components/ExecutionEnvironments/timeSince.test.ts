import { timeSince } from './timeSince';

const now = Date.UTC(2026, 10, 13);

it.each([
  [-60_000, 'Just now'],
  [59_999, 'Just now'],
  [60_000, '1 minute ago'],
  [3_599_999, '59 minutes ago'],
  [3_600_000, '1 hour ago'],
  [86_400_000, '1 day ago'],
  [604_799_999, '6 days ago'],
  [604_800_000, '1 week ago'],
])('formats an image sync age of %d milliseconds', (age, expected) => {
  expect(timeSince(new Date(now - age).toISOString(), now, 'Just now')).toBe(
    expected,
  );
});
