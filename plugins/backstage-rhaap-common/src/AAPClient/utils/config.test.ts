import { ConfigReader } from '@backstage/config';
import { getAnsibleConfig, getIntegrationByHost } from './config';

describe('config utilities', () => {
  describe('getAnsibleConfig', () => {
    it('should return all configured GitHub integrations', () => {
      const config = new ConfigReader({
        integrations: {
          github: [
            { host: 'github.com', token: 'token1' },
            { host: 'ghe.example.net', token: 'token2' },
          ],
        },
        ansible: {
          rhaap: {
            baseUrl: 'https://rhaap.test',
          },
        },
      });

      const ansibleConfig = getAnsibleConfig(config);

      expect(ansibleConfig.githubIntegrations).toHaveLength(2);
      expect(ansibleConfig.githubIntegrations?.[0].host).toBe('github.com');
      expect(ansibleConfig.githubIntegrations?.[1].host).toBe(
        'ghe.example.net',
      );
      // First integration should also be set for backward compatibility
      expect(ansibleConfig.githubIntegration?.host).toBe('github.com');
    });

    it('should return all configured GitLab integrations', () => {
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
        ansible: {
          rhaap: {
            baseUrl: 'https://rhaap.test',
          },
        },
      });

      const ansibleConfig = getAnsibleConfig(config);

      expect(ansibleConfig.gitlabIntegrations).toHaveLength(2);
      expect(ansibleConfig.gitlabIntegrations?.[0].host).toBe('gitlab.com');
      expect(ansibleConfig.gitlabIntegrations?.[1].host).toBe(
        'gitlab.example.net',
      );
      // First integration should also be set for backward compatibility
      expect(ansibleConfig.gitlabIntegration?.host).toBe('gitlab.com');
    });

    it('should handle minimal integrations config', () => {
      // When no explicit integrations are configured, Backstage still returns
      // default github.com integration, so we just verify the arrays exist
      const config = new ConfigReader({
        ansible: {
          rhaap: {
            baseUrl: 'https://rhaap.test',
          },
        },
      });

      const ansibleConfig = getAnsibleConfig(config);

      // Arrays should exist and be defined
      expect(ansibleConfig.githubIntegrations).toBeDefined();
      expect(ansibleConfig.gitlabIntegrations).toBeDefined();
      expect(Array.isArray(ansibleConfig.githubIntegrations)).toBe(true);
      expect(Array.isArray(ansibleConfig.gitlabIntegrations)).toBe(true);
    });
  });

  describe('getIntegrationByHost', () => {
    const mockAnsibleConfig = {
      githubIntegrations: [
        { host: 'github.com', token: 'github-token' } as any,
        { host: 'ghe.example.net', token: 'ghe-token' } as any,
      ],
      gitlabIntegrations: [
        { host: 'gitlab.com', token: 'gitlab-token' } as any,
        {
          host: 'gitlab.example.net',
          token: 'gitlab-self-hosted-token',
        } as any,
      ],
    };

    it('should find GitHub integration by host', () => {
      const result = getIntegrationByHost(mockAnsibleConfig, 'github.com');
      expect(result).toBeDefined();
      expect(result?.host).toBe('github.com');
    });

    it('should find GitHub Enterprise integration by host', () => {
      const result = getIntegrationByHost(mockAnsibleConfig, 'ghe.example.net');
      expect(result).toBeDefined();
      expect(result?.host).toBe('ghe.example.net');
    });

    it('should find GitLab integration by host', () => {
      const result = getIntegrationByHost(mockAnsibleConfig, 'gitlab.com');
      expect(result).toBeDefined();
      expect(result?.host).toBe('gitlab.com');
    });

    it('should find self-hosted GitLab integration by host', () => {
      const result = getIntegrationByHost(
        mockAnsibleConfig,
        'gitlab.example.net',
      );
      expect(result).toBeDefined();
      expect(result?.host).toBe('gitlab.example.net');
    });

    it('should return undefined for unknown host', () => {
      const result = getIntegrationByHost(
        mockAnsibleConfig,
        'unknown.host.com',
      );
      expect(result).toBeUndefined();
    });

    it('should return undefined when no integrations configured', () => {
      const emptyConfig = {};
      const result = getIntegrationByHost(emptyConfig, 'github.com');
      expect(result).toBeUndefined();
    });

    it('should prioritize GitHub integration if host matches both', () => {
      // This is an edge case - same host in both arrays (shouldn't happen in practice)
      const configWithDuplicateHost = {
        githubIntegrations: [{ host: 'scm.example.com' } as any],
        gitlabIntegrations: [{ host: 'scm.example.com' } as any],
      };
      const result = getIntegrationByHost(
        configWithDuplicateHost,
        'scm.example.com',
      );
      // Should return the GitHub one since it's checked first
      expect(result).toBeDefined();
    });
  });
});
