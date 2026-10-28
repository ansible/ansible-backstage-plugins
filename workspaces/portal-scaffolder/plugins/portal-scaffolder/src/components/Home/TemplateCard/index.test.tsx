import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { WizardCard } from './index';
import type { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@backstage/core-plugin-api', () => ({
  useRouteRef: () => () => '/self-service',
}));

jest.mock('../../../routes', () => ({
  rootRouteRef: { id: 'root-route-ref' },
}));

jest.mock('@backstage/plugin-catalog-react', () => ({
  FavoriteEntity: () => <span data-testid="favorite-entity" />,
}));

const mockUsePermission = jest.fn().mockReturnValue({ allowed: true });
jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => mockUsePermission(),
}));

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement, themeOverride = theme) =>
  render(<ThemeProvider theme={themeOverride}>{ui}</ThemeProvider>);

const makeTemplate = (
  overrides: Partial<TemplateEntityV1beta3['metadata']> = {},
  specOverrides: Partial<TemplateEntityV1beta3['spec']> = {},
): TemplateEntityV1beta3 =>
  ({
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      name: 'test-template',
      namespace: 'default',
      title: 'Test Template',
      description: 'A test template',
      tags: ['ansible', 'test'],
      uid: 'uid-1',
      ...overrides,
    },
    spec: {
      type: 'service',
      owner: 'team-a',
      ...specOverrides,
    },
  }) as unknown as TemplateEntityV1beta3;

describe('WizardCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePermission.mockReturnValue({ allowed: true });
  });

  it('renders template title and description', () => {
    renderWithTheme(<WizardCard template={makeTemplate()} />);
    expect(screen.getByText('Test Template')).toBeInTheDocument();
    expect(screen.getByText('A test template')).toBeInTheDocument();
  });

  it('renders tags', () => {
    renderWithTheme(<WizardCard template={makeTemplate()} />);
    expect(screen.getByTestId('template--tags')).toBeInTheDocument();
    expect(screen.getByText('ansible')).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('does not render tags section when tags are undefined', () => {
    renderWithTheme(
      <WizardCard template={makeTemplate({ tags: undefined })} />,
    );
    expect(screen.queryByTestId('template--tags')).not.toBeInTheDocument();
  });

  it('does not render tags section when tags array is empty', () => {
    renderWithTheme(<WizardCard template={makeTemplate({ tags: [] })} />);
    expect(screen.queryByTestId('template--tags')).not.toBeInTheDocument();
  });

  it('uses default namespace when namespace is undefined', () => {
    renderWithTheme(
      <WizardCard template={makeTemplate({ namespace: undefined })} />,
    );
    expect(screen.getByTestId('default-test-template')).toBeInTheDocument();
  });

  it('falls back to empty string when name is undefined', () => {
    renderWithTheme(
      <WizardCard template={makeTemplate({ name: undefined })} />,
    );
    expect(screen.getByTestId('default-')).toBeInTheDocument();
  });

  it('renders Start button when user has task create permission', () => {
    renderWithTheme(<WizardCard template={makeTemplate()} />);
    expect(
      screen.getByTestId('template-card-actions--create'),
    ).toBeInTheDocument();
  });

  it('does not render Start button when permission is denied', () => {
    mockUsePermission.mockReturnValue({ allowed: false });
    renderWithTheme(<WizardCard template={makeTemplate()} />);
    expect(
      screen.queryByTestId('template-card-actions--create'),
    ).not.toBeInTheDocument();
  });

  it('renders owner name', () => {
    renderWithTheme(<WizardCard template={makeTemplate()} />);
    expect(screen.getByText('team-a')).toBeInTheDocument();
  });

  it('renders correctly with dark theme', () => {
    const darkTheme = createTheme({ palette: { type: 'dark' } });
    renderWithTheme(<WizardCard template={makeTemplate()} />, darkTheme);
    expect(screen.getByText('team-a')).toBeInTheDocument();
  });

  it('navigates to template details when title is clicked', () => {
    renderWithTheme(<WizardCard template={makeTemplate()} />);
    fireEvent.click(screen.getByTestId('template--title'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/self-service/catalog/default/test-template',
    );
  });

  it('navigates to create wizard when Start is clicked', () => {
    renderWithTheme(<WizardCard template={makeTemplate()} />);
    fireEvent.click(screen.getByTestId('template-card-actions--create'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/self-service/create/templates/default/test-template',
    );
  });

  it('shows fallback text when description is empty', () => {
    renderWithTheme(
      <WizardCard template={makeTemplate({ description: '   ' })} />,
    );
    expect(screen.getByText('No description available')).toBeInTheDocument();
  });
});
