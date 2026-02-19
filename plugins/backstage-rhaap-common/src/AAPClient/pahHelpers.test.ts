import {
  PAHHelperContext,
  validateRepositoriesInput,
  sanitizePAHLimit,
  validateAndFilterRepositories,
  fetchCollectionDetails,
  processCollectionItem,
  fetchCollectionsPage,
  extractNextUrl,
} from './pahHelpers';

describe('PAH Helpers', () => {
  let mockContext: PAHHelperContext;
  let mockLogger: any;
  let mockExecuteGetRequest: jest.Mock;
  let mockIsValidPAHRepository: jest.Mock;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    mockExecuteGetRequest = jest.fn();
    mockIsValidPAHRepository = jest.fn();

    mockContext = {
      logger: mockLogger,
      pluginLogName: 'TestPlugin',
      executeGetRequest: mockExecuteGetRequest,
      isValidPAHRepository: mockIsValidPAHRepository,
    };
  });

  describe('validateRepositoriesInput', () => {
    it('should return false for null repositories', () => {
      const result = validateRepositoriesInput(null, mockContext);
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid repositories parameter'),
      );
    });

    it('should return false for undefined repositories', () => {
      const result = validateRepositoriesInput(undefined, mockContext);
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return false for non-array repositories', () => {
      const result = validateRepositoriesInput('not-an-array', mockContext);
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Expected an array'),
      );
    });

    it('should return false for empty array', () => {
      const result = validateRepositoriesInput([], mockContext);
      expect(result).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('No repositories provided'),
      );
    });

    it('should return true for valid non-empty array', () => {
      const result = validateRepositoriesInput(['repo1', 'repo2'], mockContext);
      expect(result).toBe(true);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('sanitizePAHLimit', () => {
    it('should return the limit if valid', () => {
      const result = sanitizePAHLimit(50, mockContext);
      expect(result).toBe(50);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should cap limit at 100 if exceeds maximum', () => {
      const result = sanitizePAHLimit(150, mockContext);
      expect(result).toBe(100);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('exceeds maximum allowed'),
      );
    });

    it('should sanitize negative values to 1', () => {
      const result = sanitizePAHLimit(-5, mockContext);
      expect(result).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid limit value'),
      );
    });

    it('should floor floating point values', () => {
      const result = sanitizePAHLimit(50.7, mockContext);
      expect(result).toBe(50);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Using sanitized value'),
      );
    });

    it('should handle NaN by returning 1', () => {
      const result = sanitizePAHLimit(NaN, mockContext);
      expect(result).toBe(1);
    });

    it('should handle zero by returning 1', () => {
      const result = sanitizePAHLimit(0, mockContext);
      expect(result).toBe(1);
    });
  });

  describe('validateAndFilterRepositories', () => {
    it('should return null when all repositories are invalid', async () => {
      mockIsValidPAHRepository.mockResolvedValue(false);

      const result = await validateAndFilterRepositories(
        ['repo1', 'repo2'],
        mockContext,
      );

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No valid repositories found'),
      );
    });

    it('should filter out invalid repositories', async () => {
      mockIsValidPAHRepository
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await validateAndFilterRepositories(
        ['valid1', 'invalid', 'valid2'],
        mockContext,
      );

      expect(result).not.toBeNull();
      expect(result?.validRepos).toEqual(['valid1', 'valid2']);
      expect(result?.urlSearchParams.getAll('repository_name')).toEqual([
        'valid1',
        'valid2',
      ]);
    });

    it('should handle validation errors gracefully', async () => {
      mockIsValidPAHRepository
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await validateAndFilterRepositories(
        ['valid', 'error-repo'],
        mockContext,
      );

      expect(result).not.toBeNull();
      expect(result?.validRepos).toEqual(['valid']);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error validating PAH repository'),
      );
    });

    it('should return valid repos and urlSearchParams for all valid repositories', async () => {
      mockIsValidPAHRepository.mockResolvedValue(true);

      const result = await validateAndFilterRepositories(
        ['repo1', 'repo2'],
        mockContext,
      );

      expect(result).not.toBeNull();
      expect(result?.validRepos).toEqual(['repo1', 'repo2']);
      expect(result?.urlSearchParams.getAll('repository_name')).toEqual([
        'repo1',
        'repo2',
      ]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Fetching collections from 2 valid repositories',
        ),
      );
    });
  });

  describe('fetchCollectionDetails', () => {
    it('should return docs_blob and authors when available', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          docs_blob: { collection_readme: { html: '<p>README</p>' } },
          authors: ['Author1', 'Author2'],
        }),
      };
      mockExecuteGetRequest.mockResolvedValue(mockResponse);

      const result = await fetchCollectionDetails(
        '/pulp/href',
        'token',
        mockContext,
      );

      expect(result.docsBlob).toBe('<p>README</p>');
      expect(result.authors).toEqual(['Author1', 'Author2']);
    });

    it('should return nulls when docs_blob is missing', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({}),
      };
      mockExecuteGetRequest.mockResolvedValue(mockResponse);

      const result = await fetchCollectionDetails(
        '/pulp/href',
        'token',
        mockContext,
      );

      expect(result.docsBlob).toBeNull();
      expect(result.authors).toBeNull();
    });

    it('should handle fetch errors gracefully', async () => {
      mockExecuteGetRequest.mockRejectedValue(new Error('Network error'));

      const result = await fetchCollectionDetails(
        '/pulp/href',
        'token',
        mockContext,
      );

      expect(result.docsBlob).toBeNull();
      expect(result.authors).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch collection details'),
      );
    });

    it('should handle non-array authors gracefully', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          authors: 'single-author-string',
        }),
      };
      mockExecuteGetRequest.mockResolvedValue(mockResponse);

      const result = await fetchCollectionDetails(
        '/pulp/href',
        'token',
        mockContext,
      );

      expect(result.authors).toBeNull();
    });
  });

  describe('processCollectionItem', () => {
    it('should return null when collection_version is missing', async () => {
      const result = await processCollectionItem({}, 'token', mockContext);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Missing or invalid collection_version'),
      );
    });

    it('should return null when namespace is missing', async () => {
      const item = {
        collection_version: { name: 'test-collection' },
        repository: { name: 'repo' },
      };

      const result = await processCollectionItem(item, 'token', mockContext);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Collection missing required fields'),
      );
    });

    it('should return null when name is missing', async () => {
      const item = {
        collection_version: { namespace: 'test-namespace' },
        repository: { name: 'repo' },
      };

      const result = await processCollectionItem(item, 'token', mockContext);

      expect(result).toBeNull();
    });

    it('should return null when repository name is missing', async () => {
      const item = {
        collection_version: { namespace: 'ns', name: 'collection' },
        repository: {},
      };

      const result = await processCollectionItem(item, 'token', mockContext);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Missing repository name'),
      );
    });

    it('should process valid item without pulp_href', async () => {
      const item = {
        collection_version: {
          namespace: 'ansible',
          name: 'posix',
          version: '1.0.0',
          description: 'Test collection',
          tags: ['tag1', 'tag2'],
          dependencies: { 'ansible.utils': '>=1.0.0' },
        },
        repository: { name: 'rh-certified' },
      };

      const result = await processCollectionItem(item, 'token', mockContext);

      expect(result).not.toBeNull();
      expect(result?.namespace).toBe('ansible');
      expect(result?.name).toBe('posix');
      expect(result?.version).toBe('1.0.0');
      expect(result?.repository_name).toBe('rh-certified');
      expect(result?.tags).toEqual(['tag1', 'tag2']);
      expect(result?.dependencies).toEqual({ 'ansible.utils': '>=1.0.0' });
      expect(result?.collection_readme_html).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Missing pulp_href'),
      );
    });

    it('should fetch details when pulp_href is present', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          docs_blob: { collection_readme: { html: '<p>README</p>' } },
          authors: ['Author1'],
        }),
      };
      mockExecuteGetRequest.mockResolvedValue(mockResponse);

      const item = {
        collection_version: {
          namespace: 'ansible',
          name: 'posix',
          version: '1.0.0',
          pulp_href: '/pulp/api/v3/content/123',
        },
        repository: { name: 'rh-certified' },
      };

      const result = await processCollectionItem(item, 'token', mockContext);

      expect(result).not.toBeNull();
      expect(result?.collection_readme_html).toBe('<p>README</p>');
      expect(result?.authors).toEqual(['Author1']);
    });

    it('should handle non-object dependencies', async () => {
      const item = {
        collection_version: {
          namespace: 'ansible',
          name: 'posix',
          dependencies: 'invalid',
        },
        repository: { name: 'repo' },
      };

      const result = await processCollectionItem(item, 'token', mockContext);

      expect(result?.dependencies).toBeNull();
    });

    it('should handle non-array tags', async () => {
      const item = {
        collection_version: {
          namespace: 'ansible',
          name: 'posix',
          tags: 'not-an-array',
        },
        repository: { name: 'repo' },
      };

      const result = await processCollectionItem(item, 'token', mockContext);

      expect(result?.tags).toBeNull();
    });
  });

  describe('fetchCollectionsPage', () => {
    it('should return collectionsData on successful fetch', async () => {
      const mockData = { data: [{ id: 1 }], links: { next: null } };
      const mockResponse = {
        json: jest.fn().mockResolvedValue(mockData),
      };
      mockExecuteGetRequest.mockResolvedValue(mockResponse);

      const result = await fetchCollectionsPage(
        '/api/collections',
        'token',
        mockContext,
      );

      expect(result).not.toBeNull();
      expect(result?.collectionsData).toEqual(mockData);
    });

    it('should return null when response data is empty', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue(null),
      };
      mockExecuteGetRequest.mockResolvedValue(mockResponse);

      const result = await fetchCollectionsPage(
        '/api/collections',
        'token',
        mockContext,
      );

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Received empty response data'),
      );
    });

    it('should return null and log error on fetch failure', async () => {
      mockExecuteGetRequest.mockRejectedValue(new Error('Network error'));

      const result = await fetchCollectionsPage(
        '/api/collections',
        'token',
        mockContext,
      );

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch collections'),
      );
    });
  });

  describe('extractNextUrl', () => {
    it('should return next URL when present', () => {
      const data = { links: { next: '/api/collections?page=2' } };

      const result = extractNextUrl(data);

      expect(result).toBe('/api/collections?page=2');
    });

    it('should return null when links is missing', () => {
      const data = {};

      const result = extractNextUrl(data);

      expect(result).toBeNull();
    });

    it('should return null when next is missing', () => {
      const data = { links: {} };

      const result = extractNextUrl(data);

      expect(result).toBeNull();
    });

    it('should return null when next is empty string', () => {
      const data = { links: { next: '' } };

      const result = extractNextUrl(data);

      expect(result).toBeNull();
    });

    it('should return null when next is not a string', () => {
      const data = { links: { next: 123 } };

      const result = extractNextUrl(data);

      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = extractNextUrl(null);

      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = extractNextUrl(undefined);

      expect(result).toBeNull();
    });
  });
});
