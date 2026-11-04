import type { ReactNode } from 'react';
import { Link } from '@material-ui/core';

/**
 * Parses markdown-style links [text](url) in a string and converts them to Material-UI Link components
 * @param text - The text that may contain markdown links
 * @returns React node with text and Link components
 */
export const parseMarkdownLinks = (text: string): ReactNode => {
  if (!text) return text;

  // NOSONAR - regex is safe; needed to match full markdown links with no limits
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g; // NOSONAR
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match = linkRegex.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <Link
        key={`link-${match.index}`}
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {linkText}
      </Link>,
    );

    lastIndex = match.index + match[0].length;
    match = linkRegex.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};
