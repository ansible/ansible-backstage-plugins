import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { ResourcesCard } from './ResourcesCard';

const theme = createMuiTheme();

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('ResourcesCard', () => {
  it('renders card title Resources', () => {
    const onViewInSource = jest.fn();
    renderWithTheme(
      <ResourcesCard onViewInSource={onViewInSource} readmeUrl={null} />,
    );
    expect(screen.getByText('Resources')).toBeInTheDocument();
  });

  it('renders View in source link and readme.md', () => {
    const onViewInSource = jest.fn();
    renderWithTheme(
      <ResourcesCard onViewInSource={onViewInSource} readmeUrl={null} />,
    );
    expect(screen.getByText('View in source')).toBeInTheDocument();
    expect(screen.getByText('readme.md')).toBeInTheDocument();
  });

  it('calls onViewInSource when View in source is clicked', () => {
    const onViewInSource = jest.fn();
    renderWithTheme(
      <ResourcesCard onViewInSource={onViewInSource} readmeUrl={null} />,
    );
    fireEvent.click(screen.getByText('View in source'));
    expect(onViewInSource).toHaveBeenCalledTimes(1);
  });

  it('renders readme.md as link when readmeUrl is provided', () => {
    const onViewInSource = jest.fn();
    const readmeUrl = 'https://github.com/org/repo/blob/main/README.md';
    renderWithTheme(
      <ResourcesCard
        onViewInSource={onViewInSource}
        readmeUrl={readmeUrl}
      />,
    );
    const readmeLink = screen.getByRole('link', { name: 'readme.md' });
    expect(readmeLink).toHaveAttribute('href', readmeUrl);
    expect(readmeLink).toHaveAttribute('target', '_blank');
  });

  it('renders readme.md as plain text when readmeUrl is null', () => {
    const onViewInSource = jest.fn();
    renderWithTheme(
      <ResourcesCard onViewInSource={onViewInSource} readmeUrl={null} />,
    );
    const readmeEl = screen.getByText('readme.md');
    expect(readmeEl.tagName).not.toBe('A');
  });
});