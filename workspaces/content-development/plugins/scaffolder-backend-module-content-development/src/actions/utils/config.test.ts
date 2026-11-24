import { ConfigReader } from '@backstage/config';
import {
  generateRepoUrl,
  getAllAnsibleConfig,
  getAnsibleConfig,
  getDevSpacesUrlFromAnsibleConfig,
  getDevspacesUrlFromAnsibleConfig,
  getServiceUrlFromAnsibleConfig,
  validateAnsibleConfig,
} from './config';

const config = new ConfigReader({
  ansible: {
    devSpaces: { baseUrl: 'https://devspaces.example/' },
    creatorService: { baseUrl: 'creator.example', port: '8000' },
  },
});

describe('creator configuration helpers', () => {
  it('reads creator and Dev Spaces settings', () => {
    expect(getAnsibleConfig(config)).toEqual({
      devSpacesBaseUrl: 'https://devspaces.example/',
      baseUrl: 'creator.example',
      port: 8000,
    });
    expect(getAllAnsibleConfig(config)).toEqual(getAnsibleConfig(config));
    expect(getDevSpacesUrlFromAnsibleConfig(config)).toBe(
      'https://devspaces.example/',
    );
    expect(getServiceUrlFromAnsibleConfig(config)).toBe(
      'http://creator.example:8000/',
    );
  });

  it('builds an encoded repository URL and a Dev Spaces URL', () => {
    expect(generateRepoUrl('https://git.example', 'a b', 'repo/name')).toBe(
      'https://git.example?owner=a+b&repo=repo%2Fname',
    );
    expect(
      getDevspacesUrlFromAnsibleConfig(config, 'git.example', 'org', 'repo'),
    ).toBe('https://devspaces.example/#https://git.example/org/repo');
  });

  it('returns an empty Dev Spaces URL when configuration is missing', () => {
    expect(
      getDevspacesUrlFromAnsibleConfig(
        new ConfigReader({}),
        'git.example',
        'org',
        'repo',
      ),
    ).toBe('');
  });

  it.each([
    [{}, 'Missing required configuration: ansible.creatorService.baseUrl'],
    [
      { ansible: { creatorService: { baseUrl: 'creator.example' } } },
      'Missing required configuration: ansible.creatorService.port',
    ],
    [
      {
        ansible: {
          creatorService: { baseUrl: 'creator.example', port: '65536' },
        },
      },
      'must be an integer from 1 to 65535',
    ],
  ])('validates required values and port bounds', (value, message) => {
    expect(() => validateAnsibleConfig(new ConfigReader(value))).toThrow(
      message,
    );
  });

  it('accepts a valid creator configuration', () => {
    expect(() => validateAnsibleConfig(config)).not.toThrow();
  });
});
