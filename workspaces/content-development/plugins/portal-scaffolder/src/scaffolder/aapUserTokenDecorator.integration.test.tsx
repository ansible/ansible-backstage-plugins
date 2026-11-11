import '@testing-library/jest-dom';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
import { createPortalContributionProvider } from '@ansible/portal-extension-host/alpha';
import portalScaffolderPlugin from '../alpha';

const portalHost = createFrontendPlugin({
  pluginId: 'portal',
  extensions: [createPortalContributionProvider()],
});

let scrollTo: jest.SpyInstance;
beforeAll(() => {
  scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterAll(() => {
  scrollTo.mockRestore();
});
afterEach(cleanup);

async function submitTemplate(isAapTemplate: boolean) {
  const getAccessToken = jest.fn().mockResolvedValue('current-user-token');
  // Keep the backend request pending so the test remains on the wizard page.
  const scaffold = jest.fn(() => new Promise<never>(() => {}));
  const getTemplateParameterSchema = jest.fn().mockResolvedValue({
    title: 'Launch test job',
    steps: [
      {
        title: 'Job parameters',
        schema: {
          type: 'object',
          properties: {
            jobLabel: {
              type: 'string',
              title: 'Job label',
              default: 'Example',
            },
          },
        },
      },
    ],
    ...(isAapTemplate
      ? { formDecorators: [{ id: 'ansible.aap-user-token' }] }
      : {}),
  });
  await renderTestApp({
    features: [portalHost, scaffolderPlugin, portalScaffolderPlugin],
    initialRouteEntries: ['/create/templates/default/test-job'],
    apis: [
      mockApis.permission(),
      [rhAapAuthApiRef, { getAccessToken }],
      [scaffolderApiRef, { getTemplateParameterSchema, scaffold }],
      [
        catalogApiRef,
        { getEntityByRef: jest.fn().mockResolvedValue(undefined) },
      ],
    ],
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review' }, { timeout: 10000 }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Create' }));
  await waitFor(() => expect(scaffold).toHaveBeenCalledTimes(1));
  return { scaffold, getAccessToken };
}

it('runs the registered decorator before the native wizard sends task secrets', async () => {
  const { scaffold, getAccessToken } = await submitTemplate(true);
  expect(getAccessToken).toHaveBeenCalledTimes(1);
  expect(scaffold).toHaveBeenCalledWith({
    templateRef: 'template:default/test-job',
    values: { jobLabel: 'Example' },
    secrets: { aapToken: 'current-user-token' },
  });
});

it('does not request AAP authentication for a generic native template', async () => {
  const { scaffold, getAccessToken } = await submitTemplate(false);
  expect(getAccessToken).not.toHaveBeenCalled();
  expect(scaffold).toHaveBeenCalledWith({
    templateRef: 'template:default/test-job',
    values: { jobLabel: 'Example' },
    secrets: {},
  });
});
