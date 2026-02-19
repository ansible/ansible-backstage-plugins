import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { Entity } from '@backstage/catalog-model';
import { CollectionResourcesCard } from './CollectionResourcesCard';

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('CollectionResourcesCard', () => {
  it('returns null when entity has no links and no readme url', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'c', links: [] },
      spec: {},
    };

    const { container } = renderWithTheme(
      <CollectionResourcesCard entity={entity} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders Resources title and link when entity has links', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        links: [
          { title: 'Documentation', url: 'https://example.com/docs' },
          { title: 'Repository', url: 'https://github.com/org/repo' },
        ],
      },
      spec: {},
    };

    renderWithTheme(<CollectionResourcesCard entity={entity} />);

    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('Documentation')).toBeInTheDocument();
    expect(screen.getByText('Repository')).toBeInTheDocument();
  });

  it('adds README link from spec when not in metadata links', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'c', links: [] },
      spec: {
        collection_readme_url: 'https://example.com/README.md',
      } as any,
    };

    renderWithTheme(<CollectionResourcesCard entity={entity} />);

    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('README')).toBeInTheDocument();
  });

  it('does not duplicate README when already in links', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        links: [{ title: 'README', url: 'https://example.com/readme' }],
      },
      spec: {
        collection_readme_url: 'https://example.com/README.md',
      } as any,
    };

    renderWithTheme(<CollectionResourcesCard entity={entity} />);

    const readmeLinks = screen.getAllByText('README');
    expect(readmeLinks).toHaveLength(1);
  });

  it('uses Link as title when link title is missing', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        links: [{ url: 'https://example.com/doc' }] as any,
      },
      spec: {},
    };

    renderWithTheme(<CollectionResourcesCard entity={entity} />);

    expect(screen.getByText('Link')).toBeInTheDocument();
  });
});
