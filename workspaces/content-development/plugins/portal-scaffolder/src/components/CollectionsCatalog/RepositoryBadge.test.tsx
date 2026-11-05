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

  it.each([
    ['rh-certified', 'Certified'],
    ['my-certified-repo', 'Certified'],
    ['validated', 'Validated'],
    ['community', 'Community'],
  ])('renders correct badge for %s repository', (repository, badgeText) => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'c',
        annotations: {
          'ansible.io/collection-source': 'pah',
          'ansible.io/collection-source-repository': repository,
        },
      },
      spec: {},
    };

    renderWithTheme(<RepositoryBadge entity={entity} />);

    expect(screen.getByText(badgeText)).toBeInTheDocument();
  });

  it('returns null when entity has no annotations', () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'c' },
      spec: {},
    };

    const { container } = renderWithTheme(<RepositoryBadge entity={entity} />);

    expect(container.firstChild).toBeNull();
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
