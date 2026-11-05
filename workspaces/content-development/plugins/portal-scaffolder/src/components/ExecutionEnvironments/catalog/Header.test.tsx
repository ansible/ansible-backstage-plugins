import { render, screen } from '@testing-library/react';
import { Entity } from '@backstage/catalog-model';

jest.mock('@backstage/plugin-catalog-react', () => ({
  FavoriteEntity: ({ entity }: { entity: Entity }) => (
    <span data-testid="favorite-entity">{entity.metadata.name}</span>
  ),
}));

import { Header } from './Header';

const makeEntity = (name: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name },
});

describe('Header', () => {
  it('renders the template name', () => {
    render(<Header templateName="My Template" entity={makeEntity('test')} />);
    expect(screen.getByText('My Template')).toBeInTheDocument();
  });

  it('renders FavoriteEntity when entity is provided', () => {
    render(<Header templateName="My Template" entity={makeEntity('test')} />);
    expect(screen.getByTestId('favorite-entity')).toBeInTheDocument();
  });

  it('does not render FavoriteEntity when entity is undefined', () => {
    render(<Header templateName="My Template" entity={undefined} />);
    expect(screen.queryByTestId('favorite-entity')).not.toBeInTheDocument();
  });
});
