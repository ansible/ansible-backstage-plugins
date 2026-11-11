import { type OAuthApi, errorApiRef } from '@backstage/core-plugin-api';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import {
  FormDecoratorBlueprint,
  createScaffolderFormDecorator,
  type ScaffolderFormDecoratorContext,
} from '@backstage/plugin-scaffolder-react/alpha';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';

/** Acquire the current user's token for this submission without caching it. */
export async function applyAapUserToken(
  { setSecrets }: ScaffolderFormDecoratorContext,
  auth: Pick<OAuthApi, 'getAccessToken'>,
): Promise<void> {
  let token: string;
  try {
    token = await auth.getAccessToken();
  } catch {
    // Provider errors can contain credentials or other private details.
    throw new Error(
      'Unable to authenticate with AAP. Sign in to AAP, reload this template and try again. If the problem continues, contact your administrator.',
    );
  }

  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error(
      'AAP authentication returned an empty token. Sign in to AAP, reload this template and try again.',
    );
  }

  setSecrets(current => ({ ...current, aapToken: token }));
}

/** Register the AAP-only submission decorator in the native app tree. */
export const aapUserTokenFormDecorator: ExtensionDefinition =
  FormDecoratorBlueprint.make({
    name: 'aap-user-token',
    params: {
      decorator: createScaffolderFormDecorator({
        id: 'ansible.aap-user-token',
        deps: { auth: rhAapAuthApiRef, errorApi: errorApiRef },
        decorator: async (context, { auth, errorApi }) => {
          try {
            await applyAapUserToken(context, auth);
          } catch (error) {
            const submissionError =
              error instanceof Error
                ? error
                : new Error(
                    'Unable to submit this AAP template. Reload the template and try again.',
                  );
            errorApi.post(submissionError);
            throw submissionError;
          }
        },
      }),
    },
  });
