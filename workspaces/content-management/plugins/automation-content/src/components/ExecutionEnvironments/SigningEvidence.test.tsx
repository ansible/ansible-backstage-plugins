import { screen } from '@testing-library/react';
import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { renderTestApp } from '@backstage/frontend-test-utils';
import type { SigningObservation } from '@ansible/automation-content-common/eeRepository';
import { SigningEvidence } from './SigningEvidence';

function mount(observation?: SigningObservation) {
  return renderTestApp({
    features: [
      createFrontendPlugin({
        pluginId: 'test',
        extensions: [
          PageBlueprint.make({
            params: {
              path: '/evidence',
              loader: async () => <SigningEvidence observation={observation} />,
            },
          }),
        ],
      }),
    ],
    initialRouteEntries: ['/evidence'],
  });
}

it.each([
  ['signed', 'found', 'Signature artifact found'],
  ['not-signed', 'absent', 'No signature artifact found'],
  ['undetermined', 'failed', 'Discovery failed'],
] as const)(
  'explains the %s result using recorded discovery evidence',
  async (state, outcome, evidence) => {
    await mount({
      state,
      observedAt: '2026-11-12T12:00:00.000Z',
      mechanisms: [{ mechanism: 'oci-referrers', outcome }],
    });
    expect(await screen.findByText(new RegExp(evidence))).toBeTruthy();
    expect(screen.queryByText(/^Observed /i)).toBeNull();
    expect(screen.queryByText(/^Signature:/)).toBeNull();
    expect(screen.queryByText(/verified on/i)).toBeNull();
  },
);

it('shows unavailable evidence when the digest has no recorded observation', async () => {
  await mount();
  expect(
    await screen.findByText('No signing observation is available.'),
  ).toBeTruthy();
});
