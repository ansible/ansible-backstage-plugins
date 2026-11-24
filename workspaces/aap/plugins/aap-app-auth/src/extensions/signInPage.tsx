import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { compatWrapper } from '@backstage/core-compat-api';

export function createAapSignInPageExtension(): ExtensionDefinition {
  return SignInPageBlueprint.make({
    name: 'rhaap',
    params: {
      loader: async () => {
        const { SignInPage } = await import('../components/SignInPage');
        return props => compatWrapper(<SignInPage {...props} />);
      },
    },
  });
}
