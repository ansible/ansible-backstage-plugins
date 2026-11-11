import '@testing-library/jest-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
import portalScaffolderPlugin from './alpha';

beforeEach(() => jest.spyOn(window, 'scrollTo').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

it('uses the real EE widgets and submits their values from the stock native template route', async () => {
  // Keep the API request pending: task execution/navigation is outside this test.
  const scaffold = jest.fn(() => new Promise<never>(() => {}));
  const getTemplateParameterSchema = jest.fn().mockResolvedValue({
    title: 'Native EE fields',
    steps: [
      {
        title: 'Execution environment',
        schema: {
          type: 'object',
          required: ['baseImage', 'collections', 'fileName'],
          properties: {
            baseImage: {
              type: 'string',
              title: 'Base image',
              enum: ['quay.io/example/ee:latest', 'custom'],
              'ui:field': 'BaseImagePicker',
            },
            collections: {
              type: 'array',
              title: 'Collections',
              items: {
                type: 'object',
                required: ['name', 'source'],
                properties: {
                  name: { type: 'string' },
                  source: { type: 'string' },
                  version: { type: 'string' },
                },
              },
              'ui:field': 'CollectionsPicker',
            },
            fileName: {
              type: 'string',
              title: 'EE file name',
              'ui:field': 'EEFileNamePicker',
            },
          },
        },
      },
    ],
  });
  const autocomplete = jest.fn().mockResolvedValue({
    results: [
      {
        name: 'community.general',
        sources: ['galaxy'],
        versions: ['10.0.0'],
      },
    ],
  });
  await renderTestApp({
    // This is the same stock scaffolder + optional contributor composition as AppNfs.
    // No Portal field-slot host, field blueprint, widget, or stock renderer is mocked.
    features: [scaffolderPlugin, portalScaffolderPlugin],
    initialRouteEntries: ['/create/templates/default/native-ee-fields'],
    apis: [
      [
        scaffolderApiRef,
        { getTemplateParameterSchema, autocomplete, scaffold },
      ],
      [catalogApiRef, { getEntityByRef: async () => undefined }],
      [rhAapAuthApiRef, { getAccessToken: async () => 'test-aap-token' }],
      mockApis.permission(),
    ],
  });

  const radios = await screen.findAllByRole('radio', {}, { timeout: 10000 });
  // Lazy stock fields load React Aria first; user-event's focus patch must follow it.
  const user = userEvent.setup();
  expect(radios).toHaveLength(2);
  await user.click(radios[0]);
  expect(radios[0]).toBeChecked();
  expect(screen.getByText('Add custom base image')).toBeInTheDocument();

  await user.click(screen.getByRole('textbox', { name: 'Collection' }));
  await user.click(
    await screen.findByRole('option', { name: 'community.general' }),
  );
  await user.click(screen.getByRole('textbox', { name: /Source/ }));
  await user.click(await screen.findByRole('option', { name: 'galaxy' }));
  await user.click(screen.getByRole('textbox', { name: 'Version' }));
  await user.click(await screen.findByRole('option', { name: '10.0.0' }));
  await user.click(screen.getByRole('button', { name: 'Add collection' }));
  expect(screen.getByText('Selected collections (1)')).toBeInTheDocument();
  expect(screen.queryByText(/unsupported.*array/i)).not.toBeInTheDocument();

  // The existing picker draws its title separately, without an input label/id.
  const fileName = screen.getByRole('textbox', { name: '' });
  fireEvent.change(fileName, { target: { value: 'native-ee.yaml' } });
  expect(
    await screen.findByText(/Name should not end with .yaml or .yml/),
  ).toBeInTheDocument();
  fireEvent.change(fileName, { target: { value: 'native-ee' } });
  expect(fileName).toHaveValue('native-ee');
  await user.click(screen.getByRole('button', { name: /Review/ }));
  await user.click(await screen.findByRole('button', { name: 'Create' }));
  await waitFor(() =>
    expect(scaffold).toHaveBeenCalledWith({
      templateRef: 'template:default/native-ee-fields',
      values: {
        baseImage: 'quay.io/example/ee:latest',
        collections: [
          { name: 'community.general', source: 'galaxy', version: '10.0.0' },
        ],
        fileName: 'native-ee',
      },
      secrets: {},
    }),
  );
  expect(getTemplateParameterSchema).toHaveBeenCalledWith(
    'template:default/native-ee-fields',
  );
  expect(autocomplete).toHaveBeenCalledWith(
    expect.objectContaining({
      token: 'test-aap-token',
      resource: 'collections',
      provider: 'aap-api-cloud',
    }),
  );
}, 30000);
