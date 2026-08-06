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
import {
  buildPortalPahGalaxyServers,
  isPortalManagedGalaxyServerName,
  normalizePahRepoIdentifier,
  PORTAL_HUB_GALAXY_SERVER_PREFIX,
  syncPortalGalaxyServers,
} from './portalGalaxyServers';

describe('portalGalaxyServers', () => {
  describe('normalizePahRepoIdentifier', () => {
    it('normalizes repo names', () => {
      expect(normalizePahRepoIdentifier('rh-certified')).toBe('rh_certified');
      expect(normalizePahRepoIdentifier('__Published__')).toBe('published');
    });
  });

  describe('isPortalManagedGalaxyServerName', () => {
    it('detects portal_hub_ prefix', () => {
      expect(isPortalManagedGalaxyServerName('portal_hub_rh_certified')).toBe(
        true,
      );
      expect(isPortalManagedGalaxyServerName('galaxy')).toBe(false);
    });
  });

  describe('buildPortalPahGalaxyServers', () => {
    it('returns empty when no AAP base URL', () => {
      const config = new ConfigReader({
        catalog: {
          providers: {
            rhaap: {
              production: {
                sync: {
                  pahCollections: {
                    enabled: true,
                    repositories: [{ name: 'published' }],
                  },
                },
              },
            },
          },
        },
      });
      expect(buildPortalPahGalaxyServers(config)).toEqual([]);
    });

    it('builds portal_hub servers from pahCollections', () => {
      const config = new ConfigReader({
        ansible: {
          rhaap: {
            baseUrl: 'https://aap.example.com/',
            token: 'secret-token',
          },
        },
        catalog: {
          providers: {
            rhaap: {
              production: {
                sync: {
                  pahCollections: {
                    enabled: true,
                    repositories: [
                      { name: 'rh-certified' },
                      { name: 'validated' },
                      { name: 'published' },
                    ],
                  },
                },
              },
            },
          },
        },
      });

      const servers = buildPortalPahGalaxyServers(config);
      expect(servers).toHaveLength(3);
      expect(servers[0]).toEqual({
        name: `${PORTAL_HUB_GALAXY_SERVER_PREFIX}rh_certified`,
        url: 'https://aap.example.com/api/galaxy/content/rh-certified/',
        token: 'secret-token',
      });
      expect(servers.map(s => s.name)).toEqual([
        'portal_hub_rh_certified',
        'portal_hub_validated',
        'portal_hub_published',
      ]);
    });

    it('skips environments with pahCollections.enabled false', () => {
      const config = new ConfigReader({
        ansible: {
          rhaap: { baseUrl: 'https://aap.example.com', token: 't' },
        },
        catalog: {
          providers: {
            rhaap: {
              production: {
                sync: {
                  pahCollections: {
                    enabled: false,
                    repositories: [{ name: 'published' }],
                  },
                },
              },
            },
          },
        },
      });
      expect(buildPortalPahGalaxyServers(config)).toEqual([]);
    });

    it('dedupes repository names across envs', () => {
      const config = new ConfigReader({
        ansible: {
          rhaap: { baseUrl: 'https://aap.example.com', token: 't' },
        },
        catalog: {
          providers: {
            rhaap: {
              a: {
                sync: {
                  pahCollections: {
                    repositories: [{ name: 'published' }],
                  },
                },
              },
              b: {
                sync: {
                  pahCollections: {
                    repositories: [{ name: 'published' }],
                  },
                },
              },
            },
          },
        },
      });
      expect(buildPortalPahGalaxyServers(config)).toHaveLength(1);
    });
  });

  describe('syncPortalGalaxyServers', () => {
    it('creates missing portal servers and skips manual ones', async () => {
      const listGalaxyServers = jest.fn().mockResolvedValue([
        {
          id: 9,
          name: 'galaxy',
          url: 'https://galaxy.ansible.com/api/',
          auth_url: '',
          has_token: false,
          created_at: '',
          updated_at: '',
        },
      ]);
      const createGalaxyServer = jest.fn().mockResolvedValue({});
      const updateGalaxyServer = jest.fn().mockResolvedValue({});

      const result = await syncPortalGalaxyServers(
        { listGalaxyServers, createGalaxyServer, updateGalaxyServer },
        [
          {
            name: 'portal_hub_published',
            url: 'https://aap.example.com/api/galaxy/content/published/',
            token: 'tok',
          },
        ],
      );

      expect(result.created).toBe(1);
      expect(createGalaxyServer).toHaveBeenCalledWith({
        name: 'portal_hub_published',
        url: 'https://aap.example.com/api/galaxy/content/published/',
        token: 'tok',
      });
      expect(updateGalaxyServer).not.toHaveBeenCalled();
    });

    it('updates URL when changed', async () => {
      const listGalaxyServers = jest.fn().mockResolvedValue([
        {
          id: 3,
          name: 'portal_hub_published',
          url: 'https://old.example.com/api/galaxy/content/published/',
          auth_url: '',
          has_token: true,
          created_at: '',
          updated_at: '',
        },
      ]);
      const createGalaxyServer = jest.fn();
      const updateGalaxyServer = jest.fn().mockResolvedValue({});

      const result = await syncPortalGalaxyServers(
        { listGalaxyServers, createGalaxyServer, updateGalaxyServer },
        [
          {
            name: 'portal_hub_published',
            url: 'https://aap.example.com/api/galaxy/content/published/',
            token: 'tok',
          },
        ],
      );

      expect(result.updated).toBe(1);
      expect(updateGalaxyServer).toHaveBeenCalledWith(3, {
        url: 'https://aap.example.com/api/galaxy/content/published/',
        token: 'tok',
      });
      expect(createGalaxyServer).not.toHaveBeenCalled();
    });
  });
});
