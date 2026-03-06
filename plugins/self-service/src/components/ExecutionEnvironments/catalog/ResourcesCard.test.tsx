import { render, screen } from '@testing-library/react';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { ResourcesCard } from './ResourcesCard';

const theme = createMuiTheme();

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('ResourcesCard', () => {
  it('renders card title Resources', () => {
    renderWithTheme(<ResourcesCard />);
    expect(screen.getByText('Resources')).toBeInTheDocument();
  });

  it('renders all documentation links', () => {
    renderWithTheme(<ResourcesCard />);
    expect(
      screen.getByText('Introduction to automation execution environments'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create execution environment definitions in self-service automation portal',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Build execution environment images with Ansible Builder',
      ),
    ).toBeInTheDocument();
  });

  it('renders documentation links pointing to Red Hat docs', () => {
    renderWithTheme(<ResourcesCard />);

    const docLink = screen.getByRole('link', {
      name: 'Create execution environment definitions in self-service automation portal',
    });
    expect(docLink).toHaveAttribute(
      'href',
      'https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html-single/using_self-service_automation_portal/index#self-service-create-ee-definitions_aap-self-service-using',
    );
    expect(docLink).toHaveAttribute('target', '_blank');

    const introLink = screen.getByRole('link', {
      name: 'Introduction to automation execution environments',
    });
    expect(introLink).toHaveAttribute('target', '_blank');

    const buildLink = screen.getByRole('link', {
      name: 'Build execution environment images with Ansible Builder',
    });
    expect(buildLink).toHaveAttribute('target', '_blank');
  });
});
