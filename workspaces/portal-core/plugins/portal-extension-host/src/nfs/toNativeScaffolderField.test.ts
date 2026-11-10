import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import {
  toNativeScaffolderField,
  toNativeScaffolderFieldOptions,
} from './toNativeScaffolderField';

describe('toNativeScaffolderField', () => {
  const component = jest.fn(() => null);
  const validation = jest.fn(async () => undefined);
  const options: FieldExtensionOptions = {
    name: 'RepositoryURL',
    component,
    validation,
    schema: {
      returnValue: {
        type: 'string',
        default: 'https://example.com/repo',
      },
      uiOptions: {
        type: 'object',
        properties: { helperText: { type: 'string' } },
      },
    },
  };

  it('preserves the legacy name, component, validation, and complete schemas', () => {
    const field = toNativeScaffolderFieldOptions(options, 'RepositoryURL');

    expect(field.name).toBe('RepositoryURL');
    expect(field.component).toBe(component);
    expect(field.validation).toBe(validation);
    expect(field.schema?.schema).toEqual(options.schema);
  });

  it('rejects a missing return value schema with a useful error', () => {
    expect(() =>
      toNativeScaffolderField(
        {
          ...options,
          schema: { uiOptions: { type: 'object' } } as any,
        },
        'RepositoryURL',
      ),
    ).toThrow(/RepositoryURL.*returnValue/i);
  });

  it('rejects malformed JSON Schema values instead of forwarding them', () => {
    expect(() =>
      toNativeScaffolderField(
        {
          ...options,
          schema: { returnValue: { type: 42 } } as any,
        },
        'RepositoryURL',
      ),
    ).toThrow(/RepositoryURL.*returnValue/i);
  });

  it('rejects a mismatch between the declared and loaded field names', () => {
    expect(() => toNativeScaffolderField(options, 'OtherField')).toThrow(
      /OtherField.*RepositoryURL/,
    );
  });

  it('passes the complete native field context through to the original component', () => {
    const field = toNativeScaffolderFieldOptions(options, 'RepositoryURL');
    const fieldContext = {
      formData: 'default-value',
      onChange: jest.fn(),
      schema: { type: 'string' },
      uiSchema: { 'ui:options': { helperText: 'Choose a repository' } },
    };

    field.component(fieldContext as any);

    expect(component).toHaveBeenCalledWith(fieldContext);
  });
});
