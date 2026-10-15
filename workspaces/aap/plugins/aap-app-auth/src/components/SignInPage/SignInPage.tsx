import { SignInPageProps } from '@backstage/core-plugin-api';
import { SignInPage as CoreSignInPage } from '@backstage/core-components';
import { rhAapAuthApiRef } from '../../api';

export function SignInPage(props: SignInPageProps): React.JSX.Element {
  return (
    <CoreSignInPage
      {...props}
      align="center"
      title="Select a Sign-in method"
      auto
      providers={[
        {
          id: 'rhaap',
          title: 'Ansible Automation Platform',
          message: 'Sign in using Ansible Automation Platform',
          apiRef: rhAapAuthApiRef,
        },
      ]}
    />
  );
}
