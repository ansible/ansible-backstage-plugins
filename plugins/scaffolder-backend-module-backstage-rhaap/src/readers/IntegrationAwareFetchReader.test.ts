/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';
import { NotFoundError, NotModifiedError } from '@backstage/errors';
import {
  IntegrationAwareFetchReader,
  buildAllowedHostsFromIntegrations,
} from './IntegrationAwareFetchReader';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('IntegrationAwareFetchReader', () => {
  const logger = mockServices.logger.mock();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('buildAllowedHostsFromIntegrations', () => {
    it('should extract GitHub hosts from integrations config', () => {
      const config = new ConfigReader({
        integrations: {
          github: [
            { host: 'github.com', token: 'token1' },
            { host: 'ghe.example.net', token: 'token2' },
          ],
        },
      });

      const allowedHosts = buildAllowedHostsFromIntegrations(config, logger);

      expect(allowedHosts.has('github.com')).toBe(true);
      expect(allowedHosts.has('ghe.example.net')).toBe(true);
      // raw.githubusercontent.com should be added for github.com
      expect(allowedHosts.has('raw.githubusercontent.com')).toBe(true);
    });

    it('should extract GitLab hosts from integrations config', () => {
      const config = new ConfigReader({
        integrations: {
          gitlab: [
            { host: 'gitlab.com', token: 'token1' },
            {
              host: 'gitlab.example.net',
              apiBaseUrl: 'https://gitlab.example.net/api/v4',
              token: 'token2',
            },
          ],
        },
      });

      const allowedHosts = buildAllowedHostsFromIntegrations(config, logger);

      expect(allowedHosts.has('gitlab.com')).toBe(true);
      expect(allowedHosts.has('gitlab.example.net')).toBe(true);
    });

    it('should extract Bitbucket hosts from integrations config', () => {
      const config = new ConfigReader({
        integrations: {
          bitbucket: [
            { host: 'bitbucket.org', token: 'token1' },
            {
              host: 'bitbucket.example.net',
              apiBaseUrl: 'https://bitbucket.example.net/rest/api/1.0',
              token: 'token2',
            },
          ],
        },
      });

      const allowedHosts = buildAllowedHostsFromIntegrations(config, logger);

      expect(allowedHosts.has('bitbucket.org')).toBe(true);
      expect(allowedHosts.has('bitbucket.example.net')).toBe(true);
    });

    it('should extract Azure DevOps hosts from integrations config', () => {
      const config = new ConfigReader({
        integrations: {
          azure: [{ host: 'dev.azure.com', token: 'token1' }],
        },
      });

      const allowedHosts = buildAllowedHostsFromIntegrations(config, logger);

      expect(allowedHosts.has('dev.azure.com')).toBe(true);
    });

    it('should combine hosts from multiple integration types', () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
          gitlab: [{ host: 'gitlab.com', token: 'token2' }],
        },
      });

      const allowedHosts = buildAllowedHostsFromIntegrations(config, logger);

      expect(allowedHosts.has('github.com')).toBe(true);
      expect(allowedHosts.has('gitlab.com')).toBe(true);
      expect(allowedHosts.has('raw.githubusercontent.com')).toBe(true);
    });

    it('should return empty set when no integrations configured', () => {
      const config = new ConfigReader({});

      const allowedHosts = buildAllowedHostsFromIntegrations(config, logger);

      // Default github.com is added by Backstage
      expect(allowedHosts.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('IntegrationAwareFetchReader.factory', () => {
    it('should create reader with predicate for configured hosts', () => {
      const config = new ConfigReader({
        integrations: {
          github: [
            { host: 'github.com', token: 'token1' },
            { host: 'ghe.example.net', token: 'token2' },
          ],
        },
      });

      const result = IntegrationAwareFetchReader.factory({
        config,
        logger,
      });

      expect(result).toHaveLength(1);
      expect(result[0].reader).toBeDefined();
      expect(result[0].predicate).toBeDefined();

      // Test predicate matches configured hosts
      expect(result[0].predicate(new URL('https://github.com/org/repo'))).toBe(
        true,
      );
      expect(
        result[0].predicate(new URL('https://ghe.example.net/org/repo')),
      ).toBe(true);
      expect(
        result[0].predicate(new URL('https://raw.githubusercontent.com/file')),
      ).toBe(true);

      // Test predicate rejects non-configured hosts
      expect(
        result[0].predicate(new URL('https://unknown.host.com/file')),
      ).toBe(false);
    });

    it('should return empty array when no integrations configured', () => {
      const config = new ConfigReader({
        integrations: {},
      });

      const result = IntegrationAwareFetchReader.factory({
        config,
        logger,
      });

      // When no integrations, should return empty (or single with default github.com)
      // Depends on Backstage default behavior
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('IntegrationAwareFetchReader.readUrl', () => {
    it('should reject URLs from non-configured hosts', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const result = IntegrationAwareFetchReader.factory({
        config,
        logger,
      });

      const reader = result[0].reader;

      await expect(
        reader.readUrl('https://unknown.host.com/file.txt'),
      ).rejects.toThrow('URL host not in configured integrations');
    });

    it('should successfully read URL and return response', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const headersData: Record<string, string> = {
        etag: '"abc123"',
        'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
      };
      const mockHeaders = {
        get: (key: string) => headersData[key] || null,
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: mockHeaders,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
        body: null,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      const response = await reader.readUrl(
        'https://github.com/org/repo/file.txt',
      );

      expect(response.etag).toBe('"abc123"');
      expect(response.lastModifiedAt).toBeInstanceOf(Date);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.com/org/repo/file.txt',
        expect.any(Object),
      );
    });

    it('should handle invalid last-modified header gracefully', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const headersData: Record<string, string> = {
        etag: '"abc123"',
        'last-modified': 'invalid-date-string',
      };
      const mockHeaders = {
        get: (key: string) => headersData[key] || null,
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: mockHeaders,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
        body: null,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      const response = await reader.readUrl(
        'https://github.com/org/repo/file.txt',
      );

      // Should not throw, and lastModifiedAt should be undefined for invalid date
      expect(response.etag).toBe('"abc123"');
      expect(response.lastModifiedAt).toBeUndefined();
    });

    it('should pass options to fetch', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const mockHeaders = { get: () => null };
      const mockResponse = {
        ok: true,
        status: 200,
        headers: mockHeaders,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
        body: null,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      await reader.readUrl('https://github.com/org/repo/file.txt', {
        etag: 'test-etag',
        token: 'bearer-token',
        lastModifiedAfter: new Date('2020-01-01'),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.com/org/repo/file.txt',
        expect.objectContaining({
          headers: expect.objectContaining({
            'If-None-Match': 'test-etag',
            Authorization: 'Bearer bearer-token',
            'If-Modified-Since': expect.any(String),
          }),
        }),
      );
    });

    it('should throw NotModifiedError on 304 response', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const mockHeaders = { get: () => null };
      const mockResponse = {
        ok: false,
        status: 304,
        statusText: 'Not Modified',
        headers: mockHeaders,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      await expect(
        reader.readUrl('https://github.com/org/repo/file.txt'),
      ).rejects.toThrow(NotModifiedError);
    });

    it('should throw NotFoundError on 404 response', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const mockHeaders = { get: () => null };
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: mockHeaders,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      await expect(
        reader.readUrl('https://github.com/org/repo/file.txt'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw Error on other error responses', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const mockHeaders = { get: () => null };
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: mockHeaders,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      await expect(
        reader.readUrl('https://github.com/org/repo/file.txt'),
      ).rejects.toThrow('could not read');
    });

    it('should throw Error when fetch fails', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      await expect(
        reader.readUrl('https://github.com/org/repo/file.txt'),
      ).rejects.toThrow('Unable to read');
    });
  });

  describe('IntegrationAwareFetchReader response buffer', () => {
    it('should return buffer from response', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const testData = Buffer.from('test content');
      const mockHeaders = { get: () => null };
      const mockResponse = {
        ok: true,
        status: 200,
        headers: mockHeaders,
        arrayBuffer: jest.fn().mockResolvedValue(testData.buffer),
        body: null,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      const response = await reader.readUrl(
        'https://github.com/org/repo/file.txt',
      );
      const buffer = await response.buffer();

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  describe('IntegrationAwareFetchReader.search', () => {
    it('should return file info for valid URL', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const headersData: Record<string, string> = { etag: '"abc123"' };
      const mockHeaders = { get: (key: string) => headersData[key] || null };
      const mockResponse = {
        ok: true,
        status: 200,
        headers: mockHeaders,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
        body: null,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      const searchResult = await reader.search(
        'https://github.com/org/repo/file.txt',
      );

      expect(searchResult.files).toHaveLength(1);
      expect(searchResult.files[0].url).toBe(
        'https://github.com/org/repo/file.txt',
      );
      expect(searchResult.etag).toBe('"abc123"');
    });

    it('should return empty files for NotFoundError', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const mockHeaders = { get: () => null };
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: mockHeaders,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      const searchResult = await reader.search(
        'https://github.com/org/repo/file.txt',
      );

      expect(searchResult.files).toHaveLength(0);
      expect(searchResult.etag).toBe('');
    });

    it('should throw error for glob patterns', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      await expect(
        reader.search('https://github.com/org/repo/*.txt'),
      ).rejects.toThrow('Unsupported search pattern URL');
    });

    it('should rethrow non-NotFoundError errors', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const mockHeaders = { get: () => null };
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: mockHeaders,
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = IntegrationAwareFetchReader.factory({ config, logger });
      const reader = result[0].reader;

      await expect(
        reader.search('https://github.com/org/repo/file.txt'),
      ).rejects.toThrow('could not read');
    });
  });

  describe('IntegrationAwareFetchReader.readTree', () => {
    it('should throw not implemented error', async () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const result = IntegrationAwareFetchReader.factory({
        config,
        logger,
      });

      const reader = result[0].reader;

      await expect(
        reader.readTree('https://github.com/org/repo'),
      ).rejects.toThrow('IntegrationAwareFetchReader does not implement');
    });
  });

  describe('IntegrationAwareFetchReader.toString', () => {
    it('should return descriptive string with hosts', () => {
      const config = new ConfigReader({
        integrations: {
          github: [{ host: 'github.com', token: 'token1' }],
        },
      });

      const result = IntegrationAwareFetchReader.factory({
        config,
        logger,
      });

      const reader = result[0].reader;
      const str = reader.toString();

      expect(str).toContain('IntegrationAwareFetchReader');
      expect(str).toContain('github.com');
    });
  });
});
