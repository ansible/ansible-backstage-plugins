import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
import { createScaffolderFormDecorator } from '@backstage/plugin-scaffolder-react/alpha';

type AapAuth =
  | { getAccessToken?: () => Promise<string | undefined> }
  | undefined;
type SecretsUpdater = (
  update: (current: Record<string, string>) => Record<string, string>,
) => void;

/** Resolve a fresh signed-in user's AAP credential into task secrets. */
export async function addAAPUserTokenToSecrets(
  auth: AapAuth,
  setSecrets: SecretsUpdater,
): Promise<void> {
  if (typeof auth?.getAccessToken !== 'function') {
    throw new Error('AAP authentication API is unavailable.');
  }
  const token = await auth.getAccessToken();
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('AAP user authentication did not return a token.');
  }
  setSecrets(current => ({ ...current, aapToken: token }));
}

export const AAPUserTokenDecorator = createScaffolderFormDecorator({
  id: 'ansible.aap-user-token',
  deps: { aapAuth: rhAapAuthApiRef },
  decorator: async ({ setSecrets }, { aapAuth }) =>
    addAAPUserTokenToSecrets(aapAuth, setSecrets),
});
