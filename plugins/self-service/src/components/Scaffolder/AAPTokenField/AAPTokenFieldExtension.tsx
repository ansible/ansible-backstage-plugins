import React from 'react';

import { useApi } from '@backstage/core-plugin-api';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';

import { rhAapAuthApiRef } from '../../../apis';

export const AAPTokenField = ({
  onChange,
}: FieldExtensionComponentProps<string>) => {
  const aapAuth = useApi(rhAapAuthApiRef);
  aapAuth.getAccessToken().then((token: string) => {
    onChange(token);
  });

  return <></>;
};
