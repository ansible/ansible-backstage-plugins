import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { GitLabIcon } from './icons';

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('GitLabIcon', () => {
  it('renders without crashing', () => {
    const { container } = renderWithTheme(<GitLabIcon />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses viewBox 0 0 24 24', () => {
    const { container } = renderWithTheme(<GitLabIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
  });

  it('forwards props to SvgIcon', () => {
    const { container } = renderWithTheme(
      <GitLabIcon fontSize="small" data-testid="gitlab-icon" />,
    );
    const svg = container.querySelector('[data-testid="gitlab-icon"]');
    expect(svg).toBeInTheDocument();
  });
});
