import { screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import { PageBlueprint } from '@backstage/frontend-plugin-api';
import { useApi } from '@backstage/core-plugin-api';
import aapAppAuth from './alpha';
import { AapAuthApi, rhAapAuthApiRef } from './api';

// Any accidental runtime dependency on the contributor must fail this test.
jest.mock(
  '@ansible/portal-scaffolder',
  () => {
    throw new Error('AAP authentication must not import portal-scaffolder');
  },
  { virtual: true },
);

function AuthConsumer() {
  const auth = useApi(rhAapAuthApiRef);
  return (
    <div>
      {typeof auth.getAccessToken === 'function' &&
      typeof auth.signOut === 'function'
        ? 'Independent AAP auth is available'
        : 'Missing AAP auth'}
    </div>
  );
}

describe('AAP app auth module', () => {
  it('declares only app-owned authentication extensions, not contributor pages', () => {
    expect(aapAppAuth.pluginId).toBe('app');
    const extensions = (
      aapAppAuth as unknown as { extensions: Array<{ id: string }> }
    ).extensions;
    expect(extensions.map(extension => extension.id)).toEqual([
      'app-profile-menu-item:app/aap-logout',
      'api:app/rhaap-auth',
      'sign-in-page:app/rhaap',
    ]);
  });

  it('provides a working OAuth API without registering portal-scaffolder', async () => {
    await renderTestApp({
      features: [aapAppAuth],
      config: {
        app: { baseUrl: 'http://localhost:3000' },
        backend: { baseUrl: 'http://localhost:7007' },
      },
      extensions: [
        PageBlueprint.make({
          name: 'auth-consumer',
          params: {
            path: '/auth-consumer',
            loader: async () => <AuthConsumer />,
          },
        }),
      ],
      initialRouteEntries: ['/auth-consumer'],
    });
    expect(
      await screen.findByText('Independent AAP auth is available'),
    ).toBeInTheDocument();
    expect(AapAuthApi.api.id).toBe('ansible.auth.rhaap');
  });
});
