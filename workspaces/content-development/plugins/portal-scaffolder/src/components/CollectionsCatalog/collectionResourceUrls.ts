function parseHttpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

/** Classification for presentation, not a link authorization policy. */
export function isGitHubUrl(value: string): boolean {
  return parseHttpUrl(value)?.hostname === 'github.com';
}

/** Resolve blob links without mistaking URL paths, credentials, or suffixes for hosts. */
export function collectionReadmeFetchUrl(value: string): string {
  const url = parseHttpUrl(value);
  if (!url) return value;

  if (url.hostname === 'github.com') {
    url.hostname = 'raw.githubusercontent.com';
    url.pathname = url.pathname.replace('/blob/', '/');
    return url.toString();
  }

  // GitLab's blob path identifies the format on public and self-hosted instances.
  // Preserve the origin: this is a path conversion, not a trusted-host check.
  if (url.pathname.includes('/-/blob/')) {
    url.pathname = url.pathname.replace('/-/blob/', '/-/raw/');
    return url.toString();
  }
  return value;
}
