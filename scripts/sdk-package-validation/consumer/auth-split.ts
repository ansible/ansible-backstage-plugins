import { createAapAuthApiModule } from '@ansible/aap-app-auth/api-module';
import { createAapSignInModule } from '@ansible/aap-app-auth/sign-in';
import { createAapProfileModule } from '@ansible/aap-app-auth/profile';
import combined from '@ansible/aap-app-auth/alpha';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
export const apiOnly = [createAapAuthApiModule()];
export const explicitPortalUi = [
  createAapAuthApiModule(),
  createAapSignInModule(),
  createAapProfileModule({ logoutDisabled: false }),
];
export const compatibility = [combined];
export const authRef = rhAapAuthApiRef;
