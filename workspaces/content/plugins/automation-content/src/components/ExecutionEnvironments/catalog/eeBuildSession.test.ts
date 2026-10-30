import {
  EE_BUILD_PENDING_MAX_AGE_MS,
  EE_BUILD_PENDING_SESSION_KEY,
} from './eeBuildSession';

describe('eeBuildSession', () => {
  it('uses a stable sessionStorage key for pending EE build resume', () => {
    expect(EE_BUILD_PENDING_SESSION_KEY).toBe('self-service.ee-build.pending');
  });

  it('defines max pending age as 15 minutes in milliseconds', () => {
    expect(EE_BUILD_PENDING_MAX_AGE_MS).toBe(15 * 60 * 1000);
  });
});
