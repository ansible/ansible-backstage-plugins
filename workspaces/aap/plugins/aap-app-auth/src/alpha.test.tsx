import type { FrontendModule } from '@backstage/frontend-plugin-api';
import { screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import {
  PageBlueprint,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import { useApi } from '@backstage/core-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import aapAppAuth from './alpha';
import { createAapAuthApiModule } from './api-module';
import { createAapSignInModule } from './sign-in';
import { createAapProfileModule } from './profile';
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

const apiModule = createAapAuthApiModule();
const signInModule = createAapSignInModule();

function extensionIds(module: FrontendModule) {
  return (
    module as unknown as { extensions: Array<{ id: string }> }
  ).extensions.map(extension => extension.id);
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
      'auth-provider-settings:app/rhaap',
    ]);
  });

  it('offers API-only and sign-in-only modules with no implicit profile integration', () => {
    expect(extensionIds(apiModule)).toEqual(['api:app/rhaap-auth']);
    expect(extensionIds(signInModule)).toEqual(['sign-in-page:app/rhaap']);
  });

  it.each([
    ['combined', [aapAppAuth]],
    ['API-only', [apiModule]],
    [
      'API-only alongside host sign-in',
      [
        apiModule,
        createFrontendModule({
          pluginId: 'app',
          extensions: [
            SignInPageBlueprint.make({
              name: 'host-login',
              params: {
                loader: async () => () => <div>Host-owned sign-in</div>,
              },
            }),
          ],
        }),
      ],
    ],
    ['separate modules', [apiModule, signInModule, createAapProfileModule()]],
  ])(
    'provides a working OAuth API through %s registration',
    async (_name, features) => {
      await renderTestApp({
        features,
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
    },
  );
});
