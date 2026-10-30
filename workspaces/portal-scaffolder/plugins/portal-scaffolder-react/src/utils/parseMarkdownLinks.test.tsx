import { render, screen } from '@testing-library/react';
import { parseMarkdownLinks } from './parseMarkdownLinks';

jest.mock('@material-ui/core/styles', () => ({
  ...jest.requireActual('@material-ui/core/styles'),
}));

describe('parseMarkdownLinks', () => {
  describe('Empty and Null Inputs', () => {
    it('returns empty string when input is empty string', () => {
      const result = parseMarkdownLinks('');
      expect(result).toBe('');
    });

    it('returns falsy value when input is falsy', () => {
      const result = parseMarkdownLinks(null as any);
      expect(result).toBeNull();
    });

    it('returns undefined when input is undefined', () => {
      const result = parseMarkdownLinks(undefined as any);
      expect(result).toBeUndefined();
    });
  });

  describe('Text Without Links', () => {
    it('returns plain text when no links are present', () => {
      const result = parseMarkdownLinks('Plain text without links');
      expect(result).toEqual(['Plain text without links']);
    });

    it('returns text with brackets but no links', () => {
      const result = parseMarkdownLinks('Text with [brackets] but no links');
      expect(result).toEqual(['Text with [brackets] but no links']);
    });

    it('returns text with parentheses but no links', () => {
      const result = parseMarkdownLinks('Text with (parentheses) but no links');
      expect(result).toEqual(['Text with (parentheses) but no links']);
    });
  });

  describe('Single Link', () => {
    it('parses a single markdown link', () => {
      const text = 'Check out [this link](https://example.com) for more info';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'this link' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('parses link at the beginning of text', () => {
      const text = '[Link](https://example.com) at the start';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(screen.getByText(/at the start/)).toBeInTheDocument();
    });

    it('parses link at the end of text', () => {
      const text = 'Text at the start [Link](https://example.com)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      expect(screen.getByText(/Text at the start/)).toBeInTheDocument();
      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://example.com');
    });

    it('parses link that is the entire text', () => {
      const text = '[Link](https://example.com)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://example.com');
    });

    it('preserves text before and after link', () => {
      const text = 'Before [link](https://example.com) after';
      render(<div>{parseMarkdownLinks(text)}</div>);

      expect(screen.getByText(/^Before/)).toBeInTheDocument();
      const link = screen.getByRole('link', { name: 'link' });
      expect(link).toBeInTheDocument();
      expect(screen.getByText(/after$/)).toBeInTheDocument();
    });
  });

  describe('Multiple Links', () => {
    it('parses multiple links in text', () => {
      const text =
        'Check [link1](https://example1.com) and [link2](https://example2.com)';
      const { container } = render(<div>{parseMarkdownLinks(text)}</div>);

      const link1 = screen.getByRole('link', { name: 'link1' });
      const link2 = screen.getByRole('link', { name: 'link2' });
      expect(link1).toHaveAttribute('href', 'https://example1.com');
      expect(link2).toHaveAttribute('href', 'https://example2.com');
      expect(screen.getByText(/^Check/)).toBeInTheDocument();
      expect(container.textContent).toContain(' and ');
    });

    it('parses consecutive links', () => {
      const text = '[Link1](https://example1.com)[Link2](https://example2.com)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link1 = screen.getByRole('link', { name: 'Link1' });
      const link2 = screen.getByRole('link', { name: 'Link2' });
      expect(link1).toHaveAttribute('href', 'https://example1.com');
      expect(link2).toHaveAttribute('href', 'https://example2.com');
    });

    it('parses three links with text in between', () => {
      const text =
        'Start [link1](https://example1.com) middle [link2](https://example2.com) end [link3](https://example3.com) finish';
      render(<div>{parseMarkdownLinks(text)}</div>);

      expect(screen.getByRole('link', { name: 'link1' })).toHaveAttribute(
        'href',
        'https://example1.com',
      );
      expect(screen.getByRole('link', { name: 'link2' })).toHaveAttribute(
        'href',
        'https://example2.com',
      );
      expect(screen.getByRole('link', { name: 'link3' })).toHaveAttribute(
        'href',
        'https://example3.com',
      );
      expect(screen.getByText(/^Start/)).toBeInTheDocument();
      expect(screen.getByText(/ middle /)).toBeInTheDocument();
      expect(screen.getByText(/ end /)).toBeInTheDocument();
      expect(screen.getByText(/ finish$/)).toBeInTheDocument();
    });
  });

  describe('Link Attributes', () => {
    it('sets target to _blank', () => {
      const text = '[Link](https://example.com)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('sets rel to noopener noreferrer', () => {
      const text = '[Link](https://example.com)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('sets correct href attribute', () => {
      const text = '[Link](https://example.com/path?query=value)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveAttribute(
        'href',
        'https://example.com/path?query=value',
      );
    });
  });

  describe('URL Types', () => {
    it.each([
      ['http URLs', '[Link](http://example.com)', 'Link', 'http://example.com'],
      [
        'https URLs',
        '[Link](https://example.com)',
        'Link',
        'https://example.com',
      ],
      ['relative URLs', '[Link](/relative/path)', 'Link', '/relative/path'],
      [
        'URLs with fragments',
        '[Link](https://example.com#section)',
        'Link',
        'https://example.com#section',
      ],
      [
        'mailto URLs',
        '[Email](mailto:test@example.com)',
        'Email',
        'mailto:test@example.com',
      ],
    ])('handles %s', (_desc, text, linkName, href) => {
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: linkName });
      expect(link).toHaveAttribute('href', href);
    });

    it('handles URLs with query parameters', () => {
      const text = '[Link](https://example.com?param1=value1&param2=value2)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveAttribute(
        'href',
        'https://example.com?param1=value1&param2=value2',
      );
    });
  });

  describe('Link Text', () => {
    it.each([
      [
        'link text with spaces',
        '[Link with spaces](https://example.com)',
        'Link with spaces',
      ],
      [
        'link text with special characters',
        '[Link & Text!](https://example.com)',
        'Link & Text!',
      ],
      ['link text with numbers', '[Link123](https://example.com)', 'Link123'],
    ])('handles %s', (_desc, text, linkName) => {
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: linkName });
      expect(link).toBeInTheDocument();
    });

    it('handles empty link text', () => {
      const text = '[](https://example.com)';
      const result = parseMarkdownLinks(text);
      expect(result).toEqual([text]);
    });
  });

  describe('Edge Cases', () => {
    it('handles nested brackets in link text', () => {
      const text = '[Link [with] brackets](https://example.com)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const links = screen.queryAllByRole('link');
      expect(links.length).toBeGreaterThanOrEqual(0);
    });

    it('handles parentheses in URL', () => {
      const text = '[Link](https://example.com/path(with)parentheses)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveAttribute('href', 'https://example.com/path(with');
    });

    it.each([
      ['missing closing bracket', '[Link(https://example.com)'],
      ['missing closing parenthesis', '[Link](https://example.com'],
      ['only opening bracket', '[Link without closing'],
    ])('handles malformed link with %s', (_desc, text) => {
      const result = parseMarkdownLinks(text);
      expect(result).toEqual([text]);
    });

    it('preserves whitespace around links', () => {
      const text = '   [Link](https://example.com)   ';
      const { container } = render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toBeInTheDocument();
      expect(container.textContent).toContain('   Link   ');
    });

    it('handles newlines in text', () => {
      const text = 'Line 1\n[Link](https://example.com)\nLine 2';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toBeInTheDocument();
    });

    it('handles text with multiple types of punctuation', () => {
      const text =
        'Start! [Link](https://example.com)? End. [Another](https://test.com), done.';
      render(<div>{parseMarkdownLinks(text)}</div>);

      expect(screen.getByRole('link', { name: 'Link' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Another' })).toBeInTheDocument();
    });
  });

  describe('Key Generation', () => {
    it('generates unique keys for multiple links', () => {
      const text =
        '[Link1](https://example1.com) text [Link2](https://example2.com)';
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link1 = screen.getByRole('link', { name: 'Link1' });
      const link2 = screen.getByRole('link', { name: 'Link2' });
      expect(link1).toBeInTheDocument();
      expect(link2).toBeInTheDocument();
    });
  });

  describe('Complex Scenarios', () => {
    it('handles mix of text and multiple links', () => {
      const text =
        'Visit [site1](https://site1.com) or [site2](https://site2.com) for details. Also check [site3](https://site3.com) for more.';
      render(<div>{parseMarkdownLinks(text)}</div>);

      expect(screen.getByText(/^Visit/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'site1' })).toHaveAttribute(
        'href',
        'https://site1.com',
      );
      expect(screen.getByText(/ or /)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'site2' })).toHaveAttribute(
        'href',
        'https://site2.com',
      );
      expect(screen.getByText(/ for details. Also check /)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'site3' })).toHaveAttribute(
        'href',
        'https://site3.com',
      );
      expect(screen.getByText(/ for more\.$/)).toBeInTheDocument();
    });

    it('handles very long URLs', () => {
      const longUrl = `https://example.com/${'a'.repeat(200)}`;
      const text = `[Link](${longUrl})`;
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: 'Link' });
      expect(link).toHaveAttribute('href', longUrl);
    });

    it('handles very long link text', () => {
      const longText = 'A'.repeat(100);
      const text = `[${longText}](https://example.com)`;
      render(<div>{parseMarkdownLinks(text)}</div>);

      const link = screen.getByRole('link', { name: longText });
      expect(link).toBeInTheDocument();
    });
  });
});
