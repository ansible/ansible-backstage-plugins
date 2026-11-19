import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
import {
  createPortalContributionProvider,
  createPortalScaffolderPlugin,
} from '@ansible/portal-extension-host/alpha';
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

async function submitTemplate(
  formDecorators: { id: string }[] | undefined,
  templateName = 'test-job',
) {
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
    formDecorators,
  });
  await renderTestApp({
    features: [
      portalHost,
      createPortalScaffolderPlugin(),
      portalScaffolderPlugin,
    ],
    initialRouteEntries: [`/create/templates/default/${templateName}`],
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
  const { scaffold, getAccessToken } = await submitTemplate([
    { id: 'ansible.aap-user-token' },
  ]);
  expect(getAccessToken).toHaveBeenCalledTimes(1);
  expect(scaffold).toHaveBeenCalledWith({
    templateRef: 'template:default/test-job',
    values: { jobLabel: 'Example' },
    secrets: { aapToken: 'current-user-token' },
  });
});

it('does not request AAP authentication for a generic native template', async () => {
  const { scaffold, getAccessToken } = await submitTemplate(undefined);
  expect(getAccessToken).not.toHaveBeenCalled();
  expect(scaffold).toHaveBeenCalledWith({
    templateRef: 'template:default/test-job',
    values: { jobLabel: 'Example' },
    secrets: {},
  });
});

// The template is published from ansible-rhdh-templates. Use its actual file
// when that checkout is available, so this test catches missing opt-in there.
const controllerTemplatePath = process.env.CONTROLLER_TEMPLATE_PATH;
if (controllerTemplatePath) {
  it('sends the Controller template token in task secrets only', async () => {
    const template = load(readFileSync(controllerTemplatePath, 'utf8')) as {
      metadata: { name: string };
      spec: { formDecorators?: { id: string }[] };
    };
    const { scaffold, getAccessToken } = await submitTemplate(
      template.spec.formDecorators,
      template.metadata.name,
    );
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(scaffold).toHaveBeenCalledWith({
      templateRef: 'template:default/use-execution-environment-in-controller',
      values: { jobLabel: 'Example' },
      secrets: { aapToken: 'current-user-token' },
    });
  });
}
