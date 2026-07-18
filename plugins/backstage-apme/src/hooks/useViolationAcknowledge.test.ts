/*
 * Copyright Red Hat
 */

import { acknowledgeButtonLabel } from './useViolationAcknowledge';

describe('acknowledgeButtonLabel', () => {
  it('defaults to Acknowledge labels', () => {
    expect(acknowledgeButtonLabel(null, 1, false)).toBe('Acknowledge');
    expect(acknowledgeButtonLabel(null, 1, true)).toBe('Acknowledged');
  });

  it('uses Acknowledge labels for dependency view', () => {
    expect(acknowledgeButtonLabel(null, 1, false, 'acknowledge')).toBe(
      'Acknowledge',
    );
    expect(acknowledgeButtonLabel(null, 1, true, 'acknowledge')).toBe(
      'Acknowledged',
    );
  });

  it('shows Saving while request is in flight', () => {
    expect(acknowledgeButtonLabel(1, 1, false, 'acknowledge')).toBe('Saving…');
    expect(acknowledgeButtonLabel(1, 1, false, 'wontFix')).toBe('Saving…');
  });
});
