import { render, screen } from '@testing-library/react';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { ScmIntegrationAuthError } from './ScmIntegrationAuthError';

const mockUseIsSuperuser = jest.fn();

jest.mock('../../hooks', () => ({
  useIsSuperuser: () => mockUseIsSuperuser(),
}));

const theme = createMuiTheme();

describe('ScmIntegrationAuthError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderWithTheme = (resourceLabel: string) =>
    render(
      <ThemeProvider theme={theme}>
        <ScmIntegrationAuthError resourceLabel={resourceLabel} />
      </ThemeProvider>,
    );

  it('renders title and superuser guidance including configuration link', () => {
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });

    renderWithTheme('execution environment');

    expect(screen.getByText('SCM integration unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(
        /This execution environment could not be loaded from the source repository/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Update the integration under/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /View configuration documentation/i }),
    ).toBeInTheDocument();
  });

  it('renders contact administrator copy when user is not superuser', () => {
    mockUseIsSuperuser.mockReturnValue({
      isSuperuser: false,
      loading: false,
      error: null,
    });

    renderWithTheme('collection');

    expect(screen.getByText('SCM integration unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Contact your administrator to refresh the GitHub or GitLab/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /View configuration documentation/i }),
    ).not.toBeInTheDocument();
  });
});
