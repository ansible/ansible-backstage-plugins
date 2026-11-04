import { render, screen } from '@testing-library/react';
import type { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { WizardCard } from './WizardCard';

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => ({ allowed: false }),
}));

jest.mock('@backstage/plugin-catalog-react', () => ({
  useStarredEntities: () => ({
    isStarredEntity: () => false,
    toggleStarredEntity: jest.fn(),
  }),
}));

function makeTemplate(
  metadata: Partial<TemplateEntityV1beta3['metadata']> = {},
): TemplateEntityV1beta3 {
  return {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      name: 'ee-template',
      namespace: 'default',
      ...metadata,
    },
    spec: { type: 'execution-environment' },
  } as TemplateEntityV1beta3;
}

it('uses the entity name as an accessible title when metadata.title is absent', () => {
  render(<WizardCard template={makeTemplate()} />);

  expect(screen.getByRole('link', { name: 'ee-template' }).textContent).toBe(
    'ee-template',
  );
});

it('preserves the configured title when metadata.title is present', () => {
  render(<WizardCard template={makeTemplate({ title: 'Build an EE' })} />);

  expect(screen.getByRole('link', { name: 'Build an EE' }).textContent).toBe(
    'Build an EE',
  );
});
