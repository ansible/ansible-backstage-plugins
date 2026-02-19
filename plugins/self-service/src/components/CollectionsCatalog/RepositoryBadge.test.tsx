import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { Entity } from '@backstage/catalog-model';
import { RepositoryBadge } from './RepositoryBadge';

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('RepositoryBadge', () => {
  it('returns null when collection source is not pah', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        annotations: { 'ansible.io/collection-source': 'scm' },
      },
      spec: {},
    };

    const { container } = renderWithTheme(<RepositoryBadge entity={entity} />);

    expect(container.firstChild).toBeNull();
  });

  it('returns null when pah but no repository name', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        annotations: { 'ansible.io/collection-source': 'pah' },
      },
      spec: {},
    };

    const { container } = renderWithTheme(<RepositoryBadge entity={entity} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders Certified badge for rh-certified repository', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        annotations: {
          'ansible.io/collection-source': 'pah',
          'ansible.io/collection-source-repository': 'rh-certified',
        },
      },
      spec: {},
    };

    renderWithTheme(<RepositoryBadge entity={entity} />);

    expect(screen.getByText('Certified')).toBeInTheDocument();
  });

  it('renders Certified badge when repository name contains certified', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        annotations: {
          'ansible.io/collection-source': 'pah',
          'ansible.io/collection-source-repository': 'my-certified-repo',
        },
      },
      spec: {},
    };

    renderWithTheme(<RepositoryBadge entity={entity} />);

    expect(screen.getByText('Certified')).toBeInTheDocument();
  });

  it('renders Validated badge for validated repository', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        annotations: {
          'ansible.io/collection-source': 'pah',
          'ansible.io/collection-source-repository': 'validated',
        },
      },
      spec: {},
    };

    renderWithTheme(<RepositoryBadge entity={entity} />);

    expect(screen.getByText('Validated')).toBeInTheDocument();
  });

  it('renders Community badge for community repository', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        annotations: {
          'ansible.io/collection-source': 'pah',
          'ansible.io/collection-source-repository': 'community',
        },
      },
      spec: {},
    };

    renderWithTheme(<RepositoryBadge entity={entity} />);

    expect(screen.getByText('Community')).toBeInTheDocument();
  });

  it('returns null for unknown pah repository type', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        annotations: {
          'ansible.io/collection-source': 'pah',
          'ansible.io/collection-source-repository': 'custom-repo',
        },
      },
      spec: {},
    };

    const { container } = renderWithTheme(<RepositoryBadge entity={entity} />);

    expect(container.firstChild).toBeNull();
  });
});
