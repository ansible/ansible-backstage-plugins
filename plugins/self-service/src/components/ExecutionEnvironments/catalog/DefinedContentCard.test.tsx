import { render, screen } from '@testing-library/react';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { DefinedContentCard } from './DefinedContentCard';
import type { ParsedEEDefinition } from '../../../utils/eeDefinitionUtils';

const theme = createMuiTheme();

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('DefinedContentCard', () => {
  it('renders card title and subtitle', () => {
    renderWithTheme(<DefinedContentCard parsedDefinition={null} />);
    expect(screen.getByText('Defined Content')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Shows explicitly added collections, python requirements, and system packages only/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows None for all sections when parsedDefinition is null', () => {
    renderWithTheme(<DefinedContentCard parsedDefinition={null} />);
    const noneLabels = screen.getAllByText('None');
    expect(noneLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('shows collections when provided', () => {
    const parsed: ParsedEEDefinition = {
      baseImageName: null,
      collections: [{ name: 'cisco.nxos', version: '2.0.0' }],
      pythonPath: null,
      pythonPackages: null,
      pythonFileRef: null,
      systemPackages: null,
      systemFileRef: null,
      collectionsFileRef: null,
    };
    renderWithTheme(<DefinedContentCard parsedDefinition={parsed} />);
    expect(screen.getByText(/cisco\.nxos/)).toBeInTheDocument();
    expect(screen.getByText(/v2\.0\.0/)).toBeInTheDocument();
  });

  it('displays org/repo for tokenized SCM git URL collections', () => {
    const parsed: ParsedEEDefinition = {
      baseImageName: null,
      collections: [
        {
          name: 'https://${AAP_EE_BUILDER_GITHUB_GITHUB_PUBLIC_ACME_TOKEN}@github.com/acme/my-collection',
          version: 'main',
          type: 'git',
        },
      ],
      pythonPath: null,
      pythonPackages: null,
      pythonFileRef: null,
      systemPackages: null,
      systemFileRef: null,
      collectionsFileRef: null,
    };
    renderWithTheme(<DefinedContentCard parsedDefinition={parsed} />);
    expect(screen.getByText(/acme\/my-collection/)).toBeInTheDocument();
    expect(screen.getByText(/\(main\)/)).toBeInTheDocument();
    expect(screen.queryByText(/AAP_EE_BUILDER/)).not.toBeInTheDocument();
  });

  it('strips .git suffix from SCM collection URLs', () => {
    const parsed: ParsedEEDefinition = {
      baseImageName: null,
      collections: [
        {
          name: 'https://${TOKEN}@gitlab.com/org/repo.git',
          version: 'v1.0.0',
          type: 'git',
        },
      ],
      pythonPath: null,
      pythonPackages: null,
      pythonFileRef: null,
      systemPackages: null,
      systemFileRef: null,
      collectionsFileRef: null,
    };
    renderWithTheme(<DefinedContentCard parsedDefinition={parsed} />);
    expect(screen.getByText(/org\/repo/)).toBeInTheDocument();
    expect(screen.getByText(/\(v1\.0\.0\)/)).toBeInTheDocument();
  });

  it('shows regular collection name with v-prefixed version', () => {
    const parsed: ParsedEEDefinition = {
      baseImageName: null,
      collections: [{ name: 'community.general', version: '8.1.0' }],
      pythonPath: null,
      pythonPackages: null,
      pythonFileRef: null,
      systemPackages: null,
      systemFileRef: null,
      collectionsFileRef: null,
    };
    renderWithTheme(<DefinedContentCard parsedDefinition={parsed} />);
    expect(screen.getByText(/community\.general/)).toBeInTheDocument();
    expect(screen.getByText(/v8\.1\.0/)).toBeInTheDocument();
  });

  it('shows collection without version when version is absent', () => {
    const parsed: ParsedEEDefinition = {
      baseImageName: null,
      collections: [{ name: 'ansible.netcommon' }],
      pythonPath: null,
      pythonPackages: null,
      pythonFileRef: null,
      systemPackages: null,
      systemFileRef: null,
      collectionsFileRef: null,
    };
    renderWithTheme(<DefinedContentCard parsedDefinition={parsed} />);
    const el = screen.getByText('ansible.netcommon');
    expect(el).toBeInTheDocument();
    expect(el.textContent).toBe('ansible.netcommon');
  });

  it('shows Python requirements list when provided', () => {
    const parsed: ParsedEEDefinition = {
      baseImageName: null,
      collections: [],
      pythonPath: null,
      pythonPackages: ['six', 'psutil'],
      pythonFileRef: null,
      systemPackages: null,
      systemFileRef: null,
      collectionsFileRef: null,
    };
    renderWithTheme(<DefinedContentCard parsedDefinition={parsed} />);
    expect(screen.getByText('six')).toBeInTheDocument();
    expect(screen.getByText('psutil')).toBeInTheDocument();
  });

  it('shows system packages when provided', () => {
    const parsed: ParsedEEDefinition = {
      baseImageName: null,
      collections: [],
      pythonPath: null,
      pythonPackages: null,
      pythonFileRef: null,
      systemPackages: ['git', 'curl'],
      systemFileRef: null,
      collectionsFileRef: null,
    };
    renderWithTheme(<DefinedContentCard parsedDefinition={parsed} />);
    expect(screen.getByText('git')).toBeInTheDocument();
    expect(screen.getByText('curl')).toBeInTheDocument();
  });
});
