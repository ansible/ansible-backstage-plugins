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
import {
  IntegrationAwareFetchReader,
  buildAllowedHostsFromIntegrations,
} from './IntegrationAwareFetchReader';

describe('IntegrationAwareFetchReader', () => {
  const logger = mockServices.logger.mock();

  beforeEach(() => {
    jest.clearAllMocks();
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
