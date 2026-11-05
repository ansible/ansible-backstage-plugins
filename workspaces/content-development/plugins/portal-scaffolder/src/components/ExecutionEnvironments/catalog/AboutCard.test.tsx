import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { Entity } from '@backstage/catalog-model';
import { AboutCard } from './AboutCard';

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const baseEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-ee',
    description: 'Test description',
    tags: ['ansible'],
    annotations: { 'ansible.io/scm-provider': 'github' },
  },
  spec: { type: 'execution-environment' } as any,
};

const defaultProps = {
  entity: baseEntity,
  ownerName: 'team-a',
  baseImageName: 'quay.io/base',
  sourceLocationUrl: 'https://github.com/org/repo',
  isRefreshing: false,
  isDownloadExperience: false,
  onRefresh: jest.fn(),
};

describe('AboutCard', () => {
  it('renders About title and description', () => {
    renderWithTheme(<AboutCard {...defaultProps} />);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('falls back to title when description is missing', () => {
    const entity: Entity = {
      ...baseEntity,
      metadata: {
        ...baseEntity.metadata,
        description: undefined,
        title: 'Fallback Title',
      },
    };
    renderWithTheme(<AboutCard {...defaultProps} entity={entity} />);
    expect(screen.getByText('Fallback Title')).toBeInTheDocument();
  });

  it('renders "No description available." when both description and title are missing', () => {
    const entity: Entity = {
      ...baseEntity,
      metadata: {
        ...baseEntity.metadata,
        description: undefined,
        title: undefined,
      },
    };
    renderWithTheme(<AboutCard {...defaultProps} entity={entity} />);
    expect(screen.getByText('No description available.')).toBeInTheDocument();
  });

  it('renders owner and base image', () => {
    renderWithTheme(<AboutCard {...defaultProps} />);
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('team-a')).toBeInTheDocument();
    expect(screen.getByText('Base image')).toBeInTheDocument();
    expect(screen.getByText('quay.io/base')).toBeInTheDocument();
  });

  it('renders tags', () => {
    renderWithTheme(<AboutCard {...defaultProps} />);
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('ansible')).toBeInTheDocument();
  });
});
