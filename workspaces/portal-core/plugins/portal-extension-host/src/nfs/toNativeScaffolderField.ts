import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';
import {
  createFormField,
  type FormFieldExtensionData,
} from '@backstage/plugin-scaffolder-react/alpha';

type JsonSchema = NonNullable<
  NonNullable<FieldExtensionOptions['schema']>['returnValue']
>;

const JSON_SCHEMA_TYPES = new Set([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSchemaDefinition(value: unknown): boolean {
  return typeof value === 'boolean' || isSchema(value);
}

function isSchema(value: unknown): value is JsonSchema {
  if (!isRecord(value)) return false;
  const type = value.type;
  if (
    type !== undefined &&
    !(
      (typeof type === 'string' && JSON_SCHEMA_TYPES.has(type)) ||
      (Array.isArray(type) &&
        type.length > 0 &&
        type.every(
          item => typeof item === 'string' && JSON_SCHEMA_TYPES.has(item),
        ))
    )
  ) {
    return false;
  }
  if (
    value.required !== undefined &&
    (!Array.isArray(value.required) ||
      !value.required.every(item => typeof item === 'string'))
  ) {
    return false;
  }
  if (
    value.properties !== undefined &&
    (!isRecord(value.properties) ||
      !Object.values(value.properties).every(isSchemaDefinition))
  ) {
    return false;
  }
  if (
    value.items !== undefined &&
    !(
      (Array.isArray(value.items) && value.items.every(isSchemaDefinition)) ||
      isSchemaDefinition(value.items)
    )
  ) {
    return false;
  }
  if (value.enum !== undefined && !Array.isArray(value.enum)) {
    return false;
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const schemas = value[keyword];
    if (
      schemas !== undefined &&
      (!Array.isArray(schemas) || !schemas.every(isSchemaDefinition))
    ) {
      return false;
    }
  }
  if (value.not !== undefined && !isSchemaDefinition(value.not)) {
    return false;
  }
  return true;
}

/** Convert a Portal legacy field into Backstage's native form-field contract. */
export function toNativeScaffolderFieldOptions(
  field: FieldExtensionOptions<any, any>,
  expectedName: string,
): FormFieldExtensionData<any, any> {
  const legacySchema = field.schema;
  if (field.name !== expectedName) {
    throw new Error(
      `Scaffolder field name mismatch: expected "${expectedName}" but loaded "${field.name}".`,
    );
  }
  if (!legacySchema || !isSchema(legacySchema.returnValue)) {
    throw new Error(
      `Scaffolder field "${expectedName}" must define a valid schema.returnValue object.`,
    );
  }
  if (
    legacySchema?.uiOptions !== undefined &&
    !isSchema(legacySchema.uiOptions)
  ) {
    throw new Error(
      `Scaffolder field "${expectedName}" has an invalid schema.uiOptions object.`,
    );
  }

  const schema = makeFieldSchema({
    output: z => z.unknown(),
    uiOptions: z => z.unknown(),
  });
  return {
    name: field.name,
    component: field.component,
    validation: field.validation,
    schema: { ...schema, schema: legacySchema },
  };
}

/** Convert a Portal legacy field into Backstage's opaque native form-field. */
export function toNativeScaffolderField(
  field: FieldExtensionOptions<any, any>,
  expectedName: string,
) {
  return createFormField(toNativeScaffolderFieldOptions(field, expectedName));
}
