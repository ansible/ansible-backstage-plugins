import React from 'react';
import { SignInPageProps } from '@backstage/core-plugin-api';
import { SignInPage as PortalSignInPage } from '@backstage/core-components';
import { rhAapAuthApiRef } from '../../apis';

export function SignInPage(props: SignInPageProps): React.JSX.Element {
  return (
    <PortalSignInPage
      {...props}
      align="center"
      title="Select a Sign-in method"
      providers={[
        {
          id: 'rhaap',
          title: 'AAP',
          message: 'Sign in using AAP',
          apiRef: rhAapAuthApiRef,
        },
      ]}
    />
  );
}
