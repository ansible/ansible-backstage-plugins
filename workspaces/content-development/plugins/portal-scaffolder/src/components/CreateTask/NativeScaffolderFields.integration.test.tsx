import '@testing-library/jest-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { ConfigReader } from '@backstage/config';
import { configApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import {
  createAsyncValidators,
  Stepper,
} from '@backstage/plugin-scaffolder-react/alpha';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import { rhAapAuthApiRef } from '@ansible/portal-extension-api';
import { NativeScaffolderFields } from '@ansible/portal-extension-host/alpha';
import type { ScaffolderFieldDescriptor } from '@ansible/portal-extension-api/alpha';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import { scaffolderFieldLoaders } from '../../alpha';
import { StepForm } from './StepForm';

// Keep host widgets out of this test; exercise the real field loader, StepForm and RJSF.
jest.mock('./formExtraFields', () => ({ formExtraFields: [] }));

afterEach(() => jest.restoreAllMocks());

async function renderTemplate(
  gate: 'config' | 'permission' | 'loader',
  usesField = true,
) {
  const loader = jest.fn(async () => {
    throw new Error('Widget failed to load');
  });
  const submit = jest.fn().mockResolvedValue(undefined);
  const field: ScaffolderFieldDescriptor = {
    manifest: {
      id: 'test',
      version: '1.0.0',
      apiVersion: '0.1.0',
      entitlements: [],
      capabilities: [
        {
          id: 'test.fields',
          ownerPlugin: 'test',
          displayName: 'Fields',
          description: 'Fields',
          minimumHostApiVersion: '0.1.0',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          entryPoints: [
            {
              id: 'test.repo',
              label: 'Repository',
              kind: 'scaffolder-field',
              surface: 'experience-slot',
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
              requiredPermission: createPermission({
                name: 'test.field.view',
                attributes: { action: 'read' },
              }),
            },
          ],
        },
      ],
    },
    capabilityId: 'test.fields',
    entryPointId: 'test.repo',
    attachment: 'scaffolder.fields',
    fieldName: 'RepositoryInput',
    enabledByConfig: 'test.fieldEnabled',
    loader,
  };
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [
          configApiRef,
          new ConfigReader({ test: { fieldEnabled: gate !== 'config' } }),
        ],
        [
          permissionApiRef,
          {
            authorize: jest.fn().mockResolvedValue({
              result:
                gate === 'permission'
                  ? AuthorizeResult.DENY
                  : AuthorizeResult.ALLOW,
            }),
          },
        ],
        [
          rhAapAuthApiRef,
          { getAccessToken: jest.fn().mockResolvedValue('test-token') },
        ],
      ]}
    >
      <NativeScaffolderFields declarations={[field]}>
        {fields => (
          <StepForm
            nativeFields={fields}
            submitFunction={submit}
            steps={[
              {
                title: 'Details',
                schema: {
                  type: 'object',
                  properties: {
                    repo: {
                      type: 'string',
                      title: 'Repository',
                      default: 'example',
                      ...(usesField ? { 'ui:field': 'RepositoryInput' } : {}),
                    },
                  },
                },
              },
            ]}
          />
        )}
      </NativeScaffolderFields>
    </TestApiProvider>,
  );
  return { loader, submit };
}

it.each(['config', 'permission', 'loader'] as const)(
  'blocks the actual form when a referenced field fails its %s gate',
  async gate => {
    const { loader, submit } = await renderTemplate(gate);
    await screen.findByText(/Template fields are unavailable: RepositoryInput/);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Next' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create' }),
    ).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    expect(loader).toHaveBeenCalledTimes(gate === 'loader' ? 1 : 0);
  },
);

it('still submits a template that does not reference the withheld field', async () => {
  const { submit } = await renderTemplate('permission', false);
  await screen.findByRole('textbox');
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Create' }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      { repo: 'example' },
      expect.objectContaining({ aapToken: 'test-token' }),
    ),
  );
});

function makeFieldSchema(
  fieldName: string,
  propertySchema: Record<string, any>,
  uiOptions?: Record<string, unknown>,
) {
  return {
    type: 'object',
    properties: {
      pickerValue: {
        ...propertySchema,
        title: propertySchema.title ?? fieldName,
        'ui:field': fieldName,
        ...(uiOptions ? { 'ui:options': uiOptions } : {}),
      },
    },
  };
}

async function getNativeValidationErrors(
  fieldName: keyof typeof scaffolderFieldLoaders,
  schema: Record<string, any>,
  formData: Record<string, any>,
) {
  const field = await scaffolderFieldLoaders[fieldName]();
  if (!field.validation) {
    throw new Error(`${String(fieldName)} is missing its native validator`);
  }
  const validate = createAsyncValidators(
    schema,
    { [fieldName]: field.validation },
    { apiHolder: { get: jest.fn() } as any },
  );
  const errors = await validate(formData);
  const pickerErrors = errors.pickerValue as
    | { __errors?: string[] }
    | undefined;
  return pickerErrors?.__errors ?? [];
}

async function renderNativePickerWizard(
  fieldName: keyof typeof scaffolderFieldLoaders,
  schema: Record<string, any>,
  value: unknown,
) {
  const submit = jest.fn().mockResolvedValue(undefined);
  const field = await scaffolderFieldLoaders[fieldName]();
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith('/user')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ login: 'team' }),
      } as Response;
    }
    if (url.includes('/user/orgs')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ login: 'team' }],
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });

  await renderInTestApp(
    <TestApiProvider
      apis={[
        [configApiRef, new ConfigReader({})],
        [permissionApiRef, { authorize: jest.fn() }],
        [rhAapAuthApiRef, { getAccessToken: jest.fn() }],
        [
          catalogApiRef,
          { getEntityByRef: jest.fn().mockResolvedValue(undefined) },
        ],
      ]}
    >
      <StepForm
        nativeFields={[field]}
        submitFunction={submit}
        initialFormData={{ pickerValue: value }}
        steps={[
          {
            title: 'Repository',
            schema,
          },
        ]}
      />
    </TestApiProvider>,
  );

  return submit;
}

async function renderStockNativeFilenameWizard(value: string) {
  const submit = jest.fn().mockResolvedValue(undefined);
  const fieldName = 'EEFileNamePicker' as const;
  const field = await scaffolderFieldLoaders[fieldName]();

  await renderInTestApp(
    <TestApiProvider
      apis={[
        [configApiRef, new ConfigReader({})],
        [permissionApiRef, { authorize: jest.fn() }],
        [rhAapAuthApiRef, { getAccessToken: jest.fn() }],
        [catalogApiRef, { getEntityByRef: jest.fn() }],
      ]}
    >
      <Stepper
        manifest={{
          title: 'Native filename test',
          steps: [
            {
              title: 'Details',
              schema: {
                type: 'object',
                properties: {
                  pickerValue: {
                    type: 'string',
                    title: 'EEFileNamePicker',
                    'ui:field': 'EEFileNamePicker',
                    minLength: 1,
                  },
                },
              },
            },
          ],
        }}
        extensions={[field]}
        initialState={{ pickerValue: value }}
        onCreate={submit}
        components={{ reviewButtonText: 'Review', createButtonText: 'Create' }}
      />
    </TestApiProvider>,
  );

  return submit;
}

it('stock Scaffolder blocks whitespace-only native EE filenames', async () => {
  const submit = await renderStockNativeFilenameWizard('   ');

  fireEvent.click(await screen.findByRole('button', { name: 'Review' }));

  expect(
    await screen.findByText("'EEFileNamePicker' Name is required"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Create' }),
  ).not.toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});

it('stock Scaffolder submits a valid native EE filename', async () => {
  const submit = await renderStockNativeFilenameWizard('valid-ee');

  fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Create' }));

  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({ pickerValue: 'valid-ee' }),
  );
});

it.each([
  {
    fieldName: 'EEFileNamePicker' as const,
    propertySchema: { type: 'string' },
    uiOptions: undefined,
    invalidValue: 'invalid/name',
    validValue: 'valid-ee',
  },
  {
    fieldName: 'EETagsPicker' as const,
    propertySchema: { type: 'array', items: { type: 'string' } },
    uiOptions: undefined,
    invalidValue: ['Invalid Tag'],
    validValue: ['valid-tag'],
  },
])(
  'native $fieldName validator rejects invalid values and accepts valid values',
  async ({
    fieldName,
    propertySchema,
    uiOptions,
    invalidValue,
    validValue,
  }) => {
    const schema = makeFieldSchema(fieldName, propertySchema, uiOptions);
    const invalidErrors = await getNativeValidationErrors(fieldName, schema, {
      pickerValue: invalidValue,
    });
    const validErrors = await getNativeValidationErrors(fieldName, schema, {
      pickerValue: validValue,
    });
    const emptyErrors = await getNativeValidationErrors(fieldName, schema, {
      pickerValue: fieldName === 'EETagsPicker' ? [] : undefined,
    });

    expect(invalidErrors.length).toBeGreaterThan(0);
    expect(validErrors).toEqual([]);
    expect(emptyErrors).toEqual([]);
  },
);

it.each([
  {
    fieldName: 'EEFileNamePicker' as const,
    schema: makeFieldSchema('EEFileNamePicker', { type: 'string' }),
    value: 'invalid/name',
  },
  {
    fieldName: 'EETagsPicker' as const,
    schema: makeFieldSchema('EETagsPicker', {
      type: 'array',
      items: { type: 'string' },
    }),
    value: ['good-tag'],
  },
])(
  'native $fieldName wizard blocks invalid values',
  async ({ fieldName, schema, value }) => {
    const submit = await renderNativePickerWizard(fieldName, schema, value);

    if (fieldName === 'EETagsPicker') {
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'Invalid Tag' },
      });
    }

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

    const validationMessage = await screen.findByRole('alert');
    expect(validationMessage).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  },
);

it.each([
  {
    fieldName: 'EEFileNamePicker' as const,
    schema: makeFieldSchema('EEFileNamePicker', { type: 'string' }),
    value: 'valid-ee',
  },
  {
    fieldName: 'EETagsPicker' as const,
    schema: makeFieldSchema('EETagsPicker', {
      type: 'array',
      items: { type: 'string' },
    }),
    value: ['valid-tag'],
  },
])(
  'native $fieldName wizard advances with valid values',
  async ({ fieldName, schema, value }) => {
    await renderNativePickerWizard(fieldName, schema, value);
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(
      await screen.findByText(
        'Please review if all information below is correct.',
      ),
    ).toBeInTheDocument();
  },
);
