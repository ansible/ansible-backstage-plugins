import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { CollectionReadmeCard } from './CollectionReadmeCard';

jest.mock('@backstage/core-components', () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('CollectionReadmeCard', () => {
  it('renders README header', () => {
    renderWithTheme(<CollectionReadmeCard readmeContent="" />);

    expect(screen.getByText('README')).toBeInTheDocument();
  });

  it('shows loading spinner when isLoading is true', () => {
    renderWithTheme(<CollectionReadmeCard readmeContent="content" isLoading />);

    expect(
      document.querySelector('.MuiCircularProgress-root'),
    ).toBeInTheDocument();
  });

  it('shows empty message when no content and not loading', () => {
    renderWithTheme(<CollectionReadmeCard readmeContent="" />);

    expect(
      screen.getByText('No README content available for this collection.'),
    ).toBeInTheDocument();
  });

  it('renders markdown content when content provided and not html', () => {
    renderWithTheme(<CollectionReadmeCard readmeContent="# Hello" />);

    expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('# Hello');
  });

  it('renders html content when isHtml is true', () => {
    renderWithTheme(
      <CollectionReadmeCard readmeContent="<p>HTML content</p>" isHtml />,
    );

    expect(screen.getByText('HTML content')).toBeInTheDocument();
  });
});
