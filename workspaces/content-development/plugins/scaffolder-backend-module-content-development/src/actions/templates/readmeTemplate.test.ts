import { generateReadme } from './readmeTemplate';

describe('generateReadme', () => {
  it('does not print PAH commands when the base URL is missing or invalid', () => {
    for (const pahBaseUrl of ['', 'not a URL']) {
      const readme = generateReadme(
        {
          eeFileName: 'test-ee',
          buildRegistry: 'Private Automation Hub (PAH)',
          buildImageName: 'my-org/my-ee',
          pahBaseUrl,
        } as any,
        true,
        true,
      );

      expect(readme).not.toContain('podman login');
      expect(readme).not.toContain('podman pull');
      expect(readme).not.toContain('Private Automation Hub (PAH)/');
      expect(readme).not.toContain('**Image registry:** ``');
    }
  });
});
