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
        /Shows explicitly added collections, Python requirements, and system packages only/,
      ),
    ).toBeInTheDocument();
  });

  it('shows None for all sections when parsedDefinition is null', () => {
    renderWithTheme(<DefinedContentCard parsedDefinition={null} />);
    const noneLabels = screen.getAllByText('None');
    expect(noneLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('shows collections with link when provided', () => {
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
    expect(screen.getByText('cisco.nxos')).toBeInTheDocument();
    expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /cisco\.nxos/ });
    expect(link).toHaveAttribute(
      'href',
      'https://galaxy.ansible.com/cisco.nxos',
    );
  });

  it('shows "From <file>" for collections when collectionsFileRef is set', () => {
    const parsed: ParsedEEDefinition = {
      baseImageName: null,
      collections: [],
      pythonPath: null,
      pythonPackages: null,
      pythonFileRef: null,
      systemPackages: null,
      systemFileRef: null,
      collectionsFileRef: 'requirements.yaml',
    };
    renderWithTheme(<DefinedContentCard parsedDefinition={parsed} />);
    expect(screen.getByText(/From requirements\.yaml/)).toBeInTheDocument();
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
    expect(screen.getByText('six, psutil')).toBeInTheDocument();
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
    expect(screen.getByText('git, curl')).toBeInTheDocument();
  });
});
