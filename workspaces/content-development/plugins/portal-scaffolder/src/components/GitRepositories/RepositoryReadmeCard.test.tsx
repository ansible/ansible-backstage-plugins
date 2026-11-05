import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { RepositoryReadmeCard } from './RepositoryReadmeCard';

jest.mock('@backstage/core-components', () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('RepositoryReadmeCard', () => {
  it('renders README title', () => {
    renderWithTheme(<RepositoryReadmeCard readmeContent="" />);

    expect(screen.getByText('README')).toBeInTheDocument();
  });

  it('renders loading spinner when isLoading is true', () => {
    renderWithTheme(<RepositoryReadmeCard readmeContent="" isLoading />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders markdown content when provided', () => {
    const content = '# Hello World\n\nThis is a test README.';
    renderWithTheme(<RepositoryReadmeCard readmeContent={content} />);

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-content')).toHaveTextContent(
      'Hello World',
    );
    expect(screen.getByTestId('markdown-content')).toHaveTextContent(
      'This is a test README.',
    );
  });

  it('renders "Readme Not Available" when content is empty and not loading', () => {
    renderWithTheme(<RepositoryReadmeCard readmeContent="" />);

    expect(screen.getByText('Readme Not Available')).toBeInTheDocument();
  });

  it('does not render loading spinner when isLoading is false', () => {
    renderWithTheme(<RepositoryReadmeCard readmeContent="test" />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders markdown content with code blocks', () => {
    const content = '```javascript\nconsole.log("test");\n```';
    renderWithTheme(<RepositoryReadmeCard readmeContent={content} />);

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });

  it('defaults isLoading to false', () => {
    renderWithTheme(<RepositoryReadmeCard readmeContent="content" />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
  });
});
