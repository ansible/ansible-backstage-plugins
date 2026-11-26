import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';
import { fetch } from 'undici';
import { AAPClient } from './AAPClient';

jest.mock('undici', () => ({ Agent: jest.fn(), fetch: jest.fn() }));

describe('PAH collections transport', () => {
  let client: AAPClient;
  const mockLogger = mockServices.logger.mock();
  const mockFetch = fetch as jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new AAPClient({
      rootConfig: new ConfigReader({
        ansible: {
          rhaap: {
            baseUrl: 'https://test.example.com',
            token: 'test-token',
            checkSSL: true,
          },
        },
      }),
      logger: mockLogger,
    });
  });

  describe('syncCollectionsByRepositories', () => {
    it('should return empty array for empty repositories array', async () => {
      const result = await client.syncCollectionsByRepositories([], 100);

      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('No repositories provided'),
      );
    });

    it('should sanitize limit exceeding maximum', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(false);

      await client.syncCollectionsByRepositories(['repo1'], 150);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('exceeds maximum allowed'),
      );
    });

    it('should sanitize negative limit values', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(false);

      await client.syncCollectionsByRepositories(['repo1'], -5);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid limit value'),
      );
    });

    it('should sanitize floating point limit values', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(false);

      await client.syncCollectionsByRepositories(['repo1'], 50.7);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid limit value'),
      );
    });

    it('should skip invalid repositories and continue with valid ones', async () => {
      jest
        .spyOn(client, 'isValidPAHRepository')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const mockCollectionsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [],
          links: { next: null },
        }),
      };
      mockFetch.mockResolvedValue(mockCollectionsResponse);

      await client.syncCollectionsByRepositories(
        ['invalid-repo', 'valid-repo'],
        100,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Repository 'invalid-repo' is not a valid Private Automation Hub repository",
        ),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Fetching collections from 1 valid repositories',
        ),
      );
    });

    it('should return empty array when all repositories are invalid', async () => {
      jest
        .spyOn(client, 'isValidPAHRepository')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      const result = await client.syncCollectionsByRepositories(
        ['invalid1', 'invalid2'],
        100,
      );

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No valid repositories found after validation'),
      );
    });

    it('should handle repository validation errors gracefully', async () => {
      jest
        .spyOn(client, 'isValidPAHRepository')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(true);

      const mockCollectionsResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [],
          links: { next: null },
        }),
      };
      mockFetch.mockResolvedValue(mockCollectionsResponse);

      await client.syncCollectionsByRepositories(
        ['error-repo', 'valid-repo'],
        100,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error validating PAH repository 'error-repo'"),
      );
    });

    it('should fetch collections successfully from valid repositories', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      const mockCollectionsData = {
        data: [
          {
            collection_version: {
              namespace: 'ansible',
              name: 'posix',
              version: '1.5.0',
              dependencies: { 'ansible.utils': '>=2.0.0' },
              description: 'Ansible POSIX collection',
              tags: ['posix', 'linux'],
              pulp_href: '/pulp/api/v3/content/ansible/collection_versions/1/',
            },
            repository: { name: 'validated' },
          },
        ],
        links: { next: null },
      };

      const mockDetailData = {
        docs_blob: {
          collection_readme: { html: '<h1>README</h1>' },
        },
        authors: ['Ansible Core Team'],
      };

      jest
        .spyOn(client, 'executeGetRequest')
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockCollectionsData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockDetailData),
        });

      const result = await client.syncCollectionsByRepositories(
        ['validated'],
        100,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        namespace: 'ansible',
        name: 'posix',
        version: '1.5.0',
        dependencies: { 'ansible.utils': '>=2.0.0' },
        description: 'Ansible POSIX collection',
        tags: ['posix', 'linux'],
        repository_name: 'validated',
        collection_readme_html: '<h1>README</h1>',
        authors: ['Ansible Core Team'],
      });
    });

    it('should handle pagination correctly', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      const mockFirstPage = {
        data: [
          {
            collection_version: {
              namespace: 'ansible',
              name: 'collection1',
              version: '1.0.0',
              pulp_href: '/pulp/api/v3/content/1/',
            },
            repository: { name: 'repo1' },
          },
        ],
        links: {
          next: '/api/galaxy/v3/plugin/ansible/search/collection-versions/?page=2',
        },
      };

      const mockSecondPage = {
        data: [
          {
            collection_version: {
              namespace: 'ansible',
              name: 'collection2',
              version: '2.0.0',
              pulp_href: '/pulp/api/v3/content/2/',
            },
            repository: { name: 'repo1' },
          },
        ],
        links: { next: null },
      };

      const mockDetailData = {
        docs_blob: null,
        authors: null,
      };

      jest
        .spyOn(client, 'executeGetRequest')
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockFirstPage),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockDetailData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockSecondPage),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockDetailData),
        });

      const result = await client.syncCollectionsByRepositories(['repo1'], 100);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('collection1');
      expect(result[1].name).toBe('collection2');
    });

    it('should skip items with missing collection_version', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      const mockCollectionsData = {
        data: [
          { repository: { name: 'repo1' } }, // Missing collection_version
          {
            collection_version: {
              namespace: 'ansible',
              name: 'valid',
              version: '1.0.0',
              pulp_href: '/pulp/api/v3/content/1/',
            },
            repository: { name: 'repo1' },
          },
        ],
        links: { next: null },
      };

      const mockDetailData = { docs_blob: null, authors: null };

      jest
        .spyOn(client, 'executeGetRequest')
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockCollectionsData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockDetailData),
        });

      const result = await client.syncCollectionsByRepositories(['repo1'], 100);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Missing or invalid collection_version'),
      );
    });

    it('should skip items with missing namespace or name', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      const mockCollectionsData = {
        data: [
          {
            collection_version: {
              namespace: null,
              name: 'nonamespace',
              version: '1.0.0',
            },
            repository: { name: 'repo1' },
          },
          {
            collection_version: {
              namespace: 'ansible',
              name: null,
              version: '1.0.0',
            },
            repository: { name: 'repo1' },
          },
          {
            collection_version: {
              namespace: 'ansible',
              name: 'valid',
              version: '1.0.0',
              pulp_href: '/pulp/api/v3/content/1/',
            },
            repository: { name: 'repo1' },
          },
        ],
        links: { next: null },
      };

      const mockDetailData = { docs_blob: null, authors: null };

      jest
        .spyOn(client, 'executeGetRequest')
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockCollectionsData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockDetailData),
        });

      const result = await client.syncCollectionsByRepositories(['repo1'], 100);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Collection missing required fields'),
      );
    });

    it('should handle missing pulp_href gracefully', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      const mockCollectionsData = {
        data: [
          {
            collection_version: {
              namespace: 'ansible',
              name: 'nohref',
              version: '1.0.0',
              description: 'Test collection',
              // No pulp_href
            },
            repository: { name: 'repo1' },
          },
        ],
        links: { next: null },
      };

      jest.spyOn(client, 'executeGetRequest').mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockCollectionsData),
      });

      const result = await client.syncCollectionsByRepositories(['repo1'], 100);

      expect(result).toHaveLength(1);
      expect(result[0].collection_readme_html).toBeNull();
      expect(result[0].authors).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Missing pulp_href for collection 'ansible.nohref'",
        ),
      );
    });

    it('should handle fetch errors for collection details gracefully', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      const mockCollectionsData = {
        data: [
          {
            collection_version: {
              namespace: 'ansible',
              name: 'fetcherror',
              version: '1.0.0',
              pulp_href: '/pulp/api/v3/content/1/',
            },
            repository: { name: 'repo1' },
          },
        ],
        links: { next: null },
      };

      jest
        .spyOn(client, 'executeGetRequest')
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockCollectionsData),
        })
        .mockRejectedValueOnce(new Error('Failed to fetch details'));

      const result = await client.syncCollectionsByRepositories(['repo1'], 100);

      expect(result).toHaveLength(1);
      expect(result[0].collection_readme_html).toBeNull();
      expect(result[0].authors).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch collection details'),
      );
    });

    it('should break loop when fetch collections fails', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      jest
        .spyOn(client, 'executeGetRequest')
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await client.syncCollectionsByRepositories(['repo1'], 100);

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch collections'),
      );
    });

    it('should break loop when receiving empty response data', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      jest.spyOn(client, 'executeGetRequest').mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(null),
      });

      const result = await client.syncCollectionsByRepositories(['repo1'], 100);

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Received empty response data'),
      );
    });

    it('should handle empty data array gracefully', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      const mockCollectionsData = {
        data: [],
        links: { next: null },
      };

      jest.spyOn(client, 'executeGetRequest').mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockCollectionsData),
      });

      const result = await client.syncCollectionsByRepositories(['repo1'], 100);

      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully retrieved 0 collections'),
      );
    });

    it('should handle collection item processing errors gracefully', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      const mockCollectionsData = {
        data: [
          {
            collection_version: {
              namespace: 'ansible',
              name: 'valid',
              version: '1.0.0',
              pulp_href: '/pulp/api/v3/content/1/',
            },
            repository: { name: 'repo1' },
          },
        ],
        links: { next: null },
      };

      // First call for collections, second call throws for detail fetch
      jest
        .spyOn(client, 'executeGetRequest')
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockCollectionsData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ docs_blob: null, authors: null }),
        });

      const result = await client.syncCollectionsByRepositories(['repo1'], 100);

      expect(result).toHaveLength(1);
    });

    it('should use default limit when not provided', async () => {
      jest.spyOn(client, 'isValidPAHRepository').mockResolvedValueOnce(true);

      const executeGetRequestSpy = jest
        .spyOn(client, 'executeGetRequest')
        .mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue({ data: [], links: { next: null } }),
        });

      await client.syncCollectionsByRepositories(['repo1']);

      expect(executeGetRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('limit=100'),
        'test-token',
      );
    });

    it('should append multiple repository names to query params', async () => {
      jest
        .spyOn(client, 'isValidPAHRepository')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      const executeGetRequestSpy = jest
        .spyOn(client, 'executeGetRequest')
        .mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue({ data: [], links: { next: null } }),
        });

      await client.syncCollectionsByRepositories(['repo1', 'repo2'], 50);

      expect(executeGetRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('repository_name=repo1'),
        'test-token',
      );
      expect(executeGetRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('repository_name=repo2'),
        'test-token',
      );
    });
  });
});
