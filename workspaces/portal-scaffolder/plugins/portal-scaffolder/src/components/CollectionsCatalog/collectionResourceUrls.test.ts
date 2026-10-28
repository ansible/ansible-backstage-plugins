import {
  collectionReadmeFetchUrl,
  isGitHubUrl,
} from './collectionResourceUrls';

describe('collection resource URLs', () => {
  it.each(['https://github.com/org/repo', 'https://GITHUB.COM/org/repo'])(
    'recognizes the actual GitHub hostname: %s',
    value => {
      expect(isGitHubUrl(value)).toBe(true);
    },
  );

  it.each([
    'https://github.com.evil.example/org/repo',
    'https://github.com@evil.example/org/repo',
    'https://evil.example/github.com/org/repo',
    'https://evil.example/?host=github.com',
    'https://raw.githubusercontent.com/org/repo/main/README.md',
    'not-a-url',
    'ftp://github.com/org/repo',
  ])('does not treat a hostname lookalike as GitHub: %s', value => {
    expect(isGitHubUrl(value)).toBe(false);
    expect(collectionReadmeFetchUrl(value)).toBe(value);
  });

  it('converts GitHub blob URLs while preserving search and fragment', () => {
    expect(
      collectionReadmeFetchUrl(
        'https://github.com/org/repo/blob/main/README.md?raw=1#section',
      ),
    ).toBe(
      'https://raw.githubusercontent.com/org/repo/main/README.md?raw=1#section',
    );
  });

  it('does not let raw-host text in the path suppress a GitHub conversion', () => {
    expect(
      collectionReadmeFetchUrl(
        'https://github.com/org/repo/blob/main/raw.githubusercontent.com.md',
      ),
    ).toBe(
      'https://raw.githubusercontent.com/org/repo/main/raw.githubusercontent.com.md',
    );
  });

  it.each(['gitlab.com', 'gitlab.example.com', 'code.example.com'])(
    'converts GitLab blob paths without changing the origin: %s',
    host => {
      expect(
        collectionReadmeFetchUrl(
          `https://${host}/org/repo/-/blob/main/README.md`,
        ),
      ).toBe(`https://${host}/org/repo/-/raw/main/README.md`);
    },
  );
});
