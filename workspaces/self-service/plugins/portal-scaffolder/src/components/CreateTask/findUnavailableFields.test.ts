import { findUnavailableFields } from './findUnavailableFields';

it('finds unavailable fields across conditional, nested and array schemas', () => {
  expect(
    findUnavailableFields(
      {
        properties: {
          repo: { 'ui:field': 'Repository' },
          array: { items: { 'ui:field': 'MissingArray' } },
        },
        dependencies: {
          enabled: {
            oneOf: [
              { properties: { another: { 'ui:field': 'MissingConditional' } } },
            ],
          },
        },
        uiSchema: { nested: { 'ui:field': 'MissingNested' } },
      },
      new Set(['Repository']),
    ),
  ).toEqual(['MissingArray', 'MissingConditional', 'MissingNested']);
});
it('does not mistake ordinary enums or nulls for widget declarations', () => {
  expect(
    findUnavailableFields(
      [null, { enum: ['Missing'], 'ui:widget': 'textarea' }],
      new Set(),
    ),
  ).toEqual([]);
});
