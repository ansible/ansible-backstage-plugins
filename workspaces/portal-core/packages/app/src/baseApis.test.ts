import { AapAuthApi, rhAapAuthApiRef } from '@ansible/aap-app-auth';
import { baseApis } from './baseApis';
import { providers } from './identityProviders';

jest.mock(
  '@ansible/portal-scaffolder',
  () => {
    throw new Error('The app authentication must not import portal-scaffolder');
  },
  { virtual: true },
);

it('registers the independent AAP factory exactly once', () => {
  expect(
    baseApis.filter(factory => factory.api.id === rhAapAuthApiRef.id),
  ).toEqual([AapAuthApi]);
});

it('uses the AAP-owned reference for the sign-in provider', () => {
  expect(
    providers.find(provider => provider.id === 'rhaap-auth-provider'),
  ).toEqual(expect.objectContaining({ apiRef: rhAapAuthApiRef }));
});
