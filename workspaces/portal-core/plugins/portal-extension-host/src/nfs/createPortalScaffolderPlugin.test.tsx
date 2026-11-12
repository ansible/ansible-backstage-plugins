import '@testing-library/jest-dom';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import {
  createFormField,
  FormFieldBlueprint,
} from '@backstage/plugin-scaffolder-react/alpha';
import { createPortalScaffolderPlugin } from './createPortalScaffolderPlugin';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import { createPortalScaffolderFieldBlueprints } from '@ansible/portal-extension-api/alpha';
import { createPortalContributionProvider } from './createPortalContributionProvider';

const host = createFrontendPlugin({
  pluginId: 'portal',
  extensions: [createPortalContributionProvider()],
});

function contributor(id: string, fieldName: string, compatibility = false) {
  const component = jest.fn(() => <div>{id} widget</div>);
  const validation = jest.fn();
  const loader = async () => ({ name: fieldName, component, validation });
  const extensions = compatibility
    ? [
        FormFieldBlueprint.make({
          name: 'field',
          attachTo: { id: 'page:scaffolder', input: 'formFields' },
          params: { field: async () => createFormField(await loader()) },
        }),
      ]
    : [
        ...createPortalScaffolderFieldBlueprints('field', {
          manifest: {
            id,
            version: '1.0.0',
            apiVersion: '0.1.0',
            entitlements: [],
            capabilities: [
              {
                id: `${id}.fields`,
                ownerPlugin: id,
                displayName: 'Fields',
                description: 'Fields',
                minimumHostApiVersion: '0.1.0',
                appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
                entryPoints: [
                  {
                    id: `${id}.field`,
                    label: 'Field',
                    kind: 'scaffolder-field',
                    surface: 'experience-slot',
                    appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
                    launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
                  },
                ],
              },
            ],
          },
          capabilityId: `${id}.fields`,
          entryPointId: `${id}.field`,
          attachment: 'scaffolder.fields',
          fieldName,
          loader,
        }),
      ];
  return {
    plugin: createFrontendPlugin({ pluginId: id, extensions }),
    component,
    validation,
    fieldName,
  };
}

let scrollTo: jest.SpyInstance;
beforeAll(() => {
  scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterAll(() => scrollTo.mockRestore());
afterEach(cleanup);

async function renderWizard(
  contributors: ReturnType<typeof contributor>[],
  disabledBuiltin?: string,
) {
  const scaffold = jest.fn(() => new Promise<never>(() => {}));
  await renderTestApp({
    features: [
      host,
      createPortalScaffolderPlugin(),
      ...contributors.map(c => c.plugin),
    ],
    initialRouteEntries: ['/create/templates/default/example'],
    config: disabledBuiltin
      ? { app: { extensions: [{ [disabledBuiltin]: false }] } }
      : {},
    apis: [
      mockApis.permission(),
      [
        catalogApiRef,
        { getEntityByRef: jest.fn().mockResolvedValue(undefined) },
      ],
      [
        scaffolderApiRef,
        {
          scaffold,
          getTemplateParameterSchema: jest.fn().mockResolvedValue({
            title: 'Example',
            steps: [
              {
                title: 'Fields',
                schema: {
                  type: 'object',
                  properties: Object.fromEntries(
                    contributors.map((c, i) => [
                      `value${i}`,
                      {
                        type: 'string',
                        default: `initial-${i}`,
                        'ui:field': c.fieldName,
                      },
                    ]),
                  ),
                },
              },
            ],
          }),
        },
      ],
    ],
  });
  return scaffold;
}

it.each([false, true])(
  'rejects colliding independent contributors (reverse order: %s)',
  async reverse => {
    const contributors = [
      contributor('first', 'SharedField'),
      contributor('second', 'SharedField'),
    ];
    const scaffold = await renderWizard(
      reverse ? [...contributors].reverse() : contributors,
    );
    await screen.findAllByText(/Duplicate scaffolder field name.*SharedField/);
    for (const c of contributors) {
      expect(c.component).not.toHaveBeenCalled();
      expect(c.validation).not.toHaveBeenCalled();
    }
    expect(
      screen.queryByRole('button', { name: 'Review' }),
    ).not.toBeInTheDocument();
    expect(scaffold).not.toHaveBeenCalled();
  },
);

it.each([
  ['RepoUrlPicker', undefined],
  ['RepoUrlPicker', 'scaffolder-form-field:scaffolder/repo-url-picker'],
  ['Secret', undefined],
])(
  'rejects collision with built-in %s (disabled: %s)',
  async (name, disabled) => {
    const c = contributor('custom', name);
    const scaffold = await renderWizard([c], disabled);
    await screen.findAllByText(
      new RegExp(`Duplicate scaffolder field name.*${name}`),
    );
    expect(c.component).not.toHaveBeenCalled();
    expect(c.validation).not.toHaveBeenCalled();
    expect(scaffold).not.toHaveBeenCalled();
  },
);

it('rejects a collision with a compatibility/page-attached field', async () => {
  const contributors = [
    contributor('native', 'SharedField'),
    contributor('compat', 'SharedField', true),
  ];
  const scaffold = await renderWizard(contributors);
  await screen.findAllByText(/Duplicate scaffolder field name.*SharedField/);
  contributors.forEach(c => {
    expect(c.component).not.toHaveBeenCalled();
    expect(c.validation).not.toHaveBeenCalled();
  });
  expect(scaffold).not.toHaveBeenCalled();
});

it('preserves both widgets, validators and values when names are distinct', async () => {
  const contributors = [
    contributor('first', 'FirstField'),
    contributor('compat', 'SecondField', true),
  ];
  const scaffold = await renderWizard(contributors);
  await screen.findByText('first widget');
  await screen.findByText('compat widget');
  fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
  await waitFor(() =>
    contributors.forEach((c, i) => {
      expect(c.validation).toHaveBeenCalledWith(
        `initial-${i}`,
        expect.anything(),
        expect.anything(),
      );
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Create' }));
  await waitFor(() =>
    expect(scaffold).toHaveBeenCalledWith({
      templateRef: 'template:default/example',
      values: { value0: 'initial-0', value1: 'initial-1' },
      secrets: {},
    }),
  );
});
