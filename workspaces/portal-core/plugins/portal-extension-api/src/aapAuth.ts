import {
  createApiRef,
  type BackstageIdentityApi,
  type OAuthApi,
  type OpenIdConnectApi,
  type ProfileInfoApi,
  type SessionApi,
} from '@backstage/core-plugin-api';

export type AapAuthApi = OAuthApi &
  OpenIdConnectApi &
  ProfileInfoApi &
  BackstageIdentityApi &
  SessionApi;

/** Shared AAP OAuth API contract implemented by the AAP auth plugin. */
export const rhAapAuthApiRef = createApiRef<AapAuthApi>({
  id: 'ansible.auth.rhaap',
});
