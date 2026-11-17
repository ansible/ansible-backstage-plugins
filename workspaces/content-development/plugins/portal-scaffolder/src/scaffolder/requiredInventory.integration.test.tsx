import '@testing-library/jest-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
import {
  createPortalContributionProvider,
  createPortalScaffolderPlugin,
} from '@ansible/portal-extension-host/alpha';
import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import inventoryPrompt from '../../../../../../test-fixtures/scaffolder/required-inventory.json';
import portalScaffolderPlugin from '../alpha';

// The backend generator test asserts that this shared schema is its actual output.
// JSON imports widen schema type literals to strings.
const inventorySchema = inventoryPrompt.steps[0].schema as RJSFSchema;
const inventory = { id: 42, name: 'Production inventory', organization: 7 };
const portalHost = createFrontendPlugin({
  pluginId: 'portal',
  extensions: [createPortalContributionProvider()],
});
let scrollTo: jest.SpyInstance;
beforeAll(() => {
  scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterAll(() => scrollTo.mockRestore());

async function renderWizard(defaultInventory: object = {}) {
  const prompt = JSON.parse(JSON.stringify(inventoryPrompt));
  prompt.steps[0].schema.properties.inventory.default = defaultInventory;
  const scaffold = jest.fn(() => new Promise<never>(() => {}));
  const autocomplete = jest.fn().mockResolvedValue({ results: [inventory] });
  await renderTestApp({
    features: [
      portalHost,
      createPortalScaffolderPlugin(),
      portalScaffolderPlugin,
    ],
    initialRouteEntries: ['/create/templates/default/inventory-launch'],
    apis: [
      mockApis.permission(),
      [
        catalogApiRef,
        { getEntityByRef: jest.fn().mockResolvedValue(undefined) },
      ],
      [
        rhAapAuthApiRef,
        { getAccessToken: jest.fn().mockResolvedValue('picker-token') },
      ],
      [
        scaffolderApiRef,
        {
          getTemplateParameterSchema: jest.fn().mockResolvedValue(prompt),
          autocomplete,
          scaffold,
        },
      ],
    ],
  });
  await waitFor(() => expect(autocomplete).toHaveBeenCalled());
  return scaffold;
}

async function review() {
  const button = await screen.findByRole('button', { name: 'Review' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

it('cannot advance or submit an empty required inventory, then submits the selected object', async () => {
  const scaffold = await renderWizard();
  await review();
  // Exercise schema validation even if browser-required validation is bypassed.
  const form = screen.getByRole('button', { name: 'Review' }).closest('form');
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
  await screen.findAllByText(/id.*required|required.*id/i);
  expect(
    screen.queryByRole('button', { name: 'Create' }),
  ).not.toBeInTheDocument();
  expect(scaffold).not.toHaveBeenCalled();
  fireEvent.mouseDown(await screen.findByRole('button', { name: /Inventory/ }));
  fireEvent.click(
    await screen.findByRole('option', { name: 'Production inventory' }),
  );
  await review();
  fireEvent.click(await screen.findByRole('button', { name: 'Create' }));
  await waitFor(() =>
    expect(scaffold).toHaveBeenCalledWith({
      templateRef: 'template:default/inventory-launch',
      values: { inventory },
      secrets: {},
    }),
  );
});

it('accepts a preconfigured inventory and preserves all object properties', async () => {
  const scaffold = await renderWizard(inventory);
  await review();
  fireEvent.click(await screen.findByRole('button', { name: 'Create' }));
  await waitFor(() =>
    expect(scaffold).toHaveBeenCalledWith({
      templateRef: 'template:default/inventory-launch',
      values: { inventory },
      secrets: {},
    }),
  );
});

it('rejects the empty inventory produced by the real RJSF default generator', () => {
  const schema = inventorySchema;
  const defaults = getDefaultFormState(validator, schema);
  expect(defaults).toEqual({ inventory: {} });
  expect(
    validator.validateFormData(defaults, schema).errors.length,
  ).toBeGreaterThan(0);
});

it.each([
  {},
  { id: null },
  { id: '' },
  { id: '42' },
  { id: 0 },
  { id: -1 },
  { id: 1.5 },
])('rejects an invalid inventory ID in %j', value => {
  expect(
    validator.validateFormData({ inventory: value }, inventorySchema).errors
      .length,
  ).toBeGreaterThan(0);
});
