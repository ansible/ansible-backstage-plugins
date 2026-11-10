import '@testing-library/jest-dom';
import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { screen } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  AppRootElementBlueprint,
  createFrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { formFieldsApiRef } from '@backstage/plugin-scaffolder-react/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { createPortalContributionProvider } from '@ansible/portal-extension-host/alpha';
import { portalScaffolderFormFieldsModule } from './PortalScaffolderFormFieldsModule';

function NativeFieldsProbe() {
  const api = useApi(formFieldsApiRef);
  const [count, setCount] = useState<number>();
  useEffect(() => {
    void api.loadFormFields().then(fields => setCount(fields.length));
  }, [api]);
  return <output>{count ?? 'Loading native fields'}</output>;
}

const portalPlugin = createFrontendPlugin({
  pluginId: 'portal',
  extensions: [createPortalContributionProvider()],
});
const probePlugin = createFrontendPlugin({
  pluginId: 'field-probe',
  extensions: [
    AppRootElementBlueprint.make({
      name: 'native-fields-probe',
      params: { element: <NativeFieldsProbe /> },
    }),
  ],
});

describe('portalScaffolderFormFieldsModule', () => {
  it('preserves the upstream Scaffolder form field API', async () => {
    await renderTestApp({
      features: [
        scaffolderPlugin,
        portalScaffolderFormFieldsModule,
        portalPlugin,
        probePlugin,
      ],
      apis: [mockApis.permission()],
    });

    expect(await screen.findByText(/^[1-9]\d*$/)).toBeInTheDocument();
  });
});
