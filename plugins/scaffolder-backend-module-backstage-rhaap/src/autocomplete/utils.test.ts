/*
 * Copyright 2024 The Ansible plugin Authors
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

import { mockServices } from '@backstage/backend-test-utils';
import { buildCollectionsFromCatalogEntities, getCollections } from './utils';

const mockFetch = jest.fn();

describe('autocomplete utils', () => {
  const logger = mockServices.logger.mock();
  const mockAuthService = mockServices.auth.mock();
  const mockDiscoveryService = mockServices.discovery.mock();

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = mockFetch;
    mockAuthService.getOwnServiceCredentials.mockResolvedValue({} as any);
    mockAuthService.getPluginRequestToken.mockResolvedValue({
      token: 'catalog-token',
    });
    mockDiscoveryService.getBaseUrl.mockResolvedValue(
      'http://catalog.example.com',
    );
  });

  describe('buildCollectionsFromCatalogEntities', () => {
    it('returns empty array for empty entities', () => {
      expect(buildCollectionsFromCatalogEntities([])).toEqual([]);
    });

    it('builds collection from entity with collection_full_name', () => {
      const entities = [
        {
          spec: {
            collection_full_name: 'community.general',
            collection_version: '1.0.0',
          },
          metadata: { annotations: {} },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'community.general',
        versions: [
          {
            ref: '',
            version: '1.0.0',
            label: '1.0.0',
          },
        ],
        sources: [],
        sourceVersions: {},
      });
    });

    it('builds collection from entity with collection_namespace and collection_name', () => {
      const entities = [
        {
          spec: {
            collection_namespace: 'ansible',
            collection_name: 'builtin',
            collection_version: '2.14.0',
          },
          metadata: { annotations: {} },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ansible.builtin');
      expect(result[0].versions).toEqual([
        { ref: '', version: '2.14.0', label: '2.14.0' },
      ]);
    });

    it('merges multiple entities with same name and different versions', () => {
      const entities = [
        {
          spec: {
            collection_full_name: 'community.general',
            collection_version: '1.0.0',
          },
          metadata: { annotations: {} },
        },
        {
          spec: {
            collection_full_name: 'community.general',
            collection_version: '2.0.0',
          },
          metadata: { annotations: {} },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result).toHaveLength(1);
      expect(result[0].versions).toEqual([
        { ref: '', version: '2.0.0', label: '2.0.0' },
        { ref: '', version: '1.0.0', label: '1.0.0' },
      ]);
    });

    it('includes entity with valid name when another has empty spec', () => {
      const entities = [
        { spec: {}, metadata: {} },
        {
          spec: { collection_full_name: 'valid.collection' },
          metadata: {},
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      const validCollection = result.find(c => c.name === 'valid.collection');
      expect(validCollection).toBeDefined();
      expect(validCollection?.name).toBe('valid.collection');
    });

    it('adds PAH source when ansible.io/collection-source is pah', () => {
      const entities = [
        {
          spec: {
            collection_full_name: 'my.namespace',
            collection_version: '1.0.0',
          },
          metadata: {
            annotations: {
              'ansible.io/collection-source': 'pah',
              'ansible.io/collection-source-repository': 'my-repo',
            },
          },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result).toHaveLength(1);
      expect(result[0].sources).toContain('Private Automation Hub / my-repo');
      expect(
        result[0].sourceVersions!['Private Automation Hub / my-repo'],
      ).toEqual(['1.0.0']);
    });

    it('uses "unknown" when pah repo name is missing', () => {
      const entities = [
        {
          spec: {
            collection_full_name: 'my.namespace',
            collection_version: '1.0.0',
          },
          metadata: {
            annotations: { 'ansible.io/collection-source': 'pah' },
          },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result[0].sources).toContain('Private Automation Hub / unknown');
    });

    it('adds SCM source when scm annotations are present', () => {
      const entities = [
        {
          spec: {
            collection_full_name: 'my.collection',
            collection_version: '1.0.0',
          },
          metadata: {
            annotations: {
              'ansible.io/scm-provider': 'github',
              'ansible.io/scm-host-name': 'github.com',
              'ansible.io/scm-organization': 'myorg',
              'ansible.io/scm-repository': 'myrepo',
            },
          },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result).toHaveLength(1);
      expect(result[0].sources).toContain(
        'Github / github.com / myorg / myrepo',
      );
      expect(
        result[0].sourceVersions!['Github / github.com / myorg / myrepo'],
      ).toEqual(['1.0.0']);
    });

    it('keeps separate version rows per source when the same collection exists in multiple sources', () => {
      const pah = 'Private Automation Hub / hub-repo';
      const gh = 'Github / github.com / myorg / myrepo';
      const entities = [
        {
          spec: {
            collection_full_name: 'dup.multi',
            collection_version: '1.0.0',
          },
          metadata: {
            annotations: {
              'ansible.io/collection-source': 'pah',
              'ansible.io/collection-source-repository': 'hub-repo',
            },
          },
        },
        {
          spec: {
            collection_full_name: 'dup.multi',
            collection_version: '1.0.0',
          },
          metadata: {
            annotations: {
              'ansible.io/scm-provider': 'github',
              'ansible.io/scm-host-name': 'github.com',
              'ansible.io/scm-organization': 'myorg',
              'ansible.io/scm-repository': 'myrepo',
            },
          },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result).toHaveLength(1);
      expect(result[0].versions).toEqual([
        { ref: '', version: '1.0.0', label: '1.0.0', source: pah },
        { ref: '', version: '1.0.0', label: '1.0.0', source: gh },
      ]);
      expect(result[0].sourceVersions![pah]).toEqual(['1.0.0']);
      expect(result[0].sourceVersions![gh]).toEqual(['1.0.0']);
    });

    it('adds ref and version label in versions for SCM collections', () => {
      const entities = [
        {
          spec: {
            collection_full_name: 'my.collection',
            collection_version: '1.0.0',
          },
          metadata: {
            annotations: {
              'ansible.io/scm-provider': 'github',
              'ansible.io/scm-host-name': 'github.com',
              'ansible.io/scm-organization': 'myorg',
              'ansible.io/scm-repository': 'myrepo',
              'ansible.io/ref': 'main',
            },
          },
        },
        {
          spec: {
            collection_full_name: 'my.collection',
            collection_version: null,
          },
          metadata: {
            annotations: {
              'ansible.io/scm-provider': 'github',
              'ansible.io/scm-host-name': 'github.com',
              'ansible.io/scm-organization': 'myorg',
              'ansible.io/scm-repository': 'myrepo',
              'ansible.io/ref': 'v1.0.1',
            },
          },
        },
      ];

      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result).toHaveLength(1);
      const scmSource = 'Github / github.com / myorg / myrepo';
      expect(result[0].versions).toEqual([
        {
          ref: 'main',
          version: '1.0.0',
          label: 'main / 1.0.0',
          source: scmSource,
        },
        {
          ref: 'v1.0.1',
          version: null,
          label: 'null',
          source: scmSource,
        },
      ]);
    });

    it('handles missing metadata.annotations', () => {
      const entities = [
        {
          spec: {
            collection_full_name: 'no.annotations',
            collection_version: '1.0.0',
          },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result).toHaveLength(1);
      expect(result[0].sources).toEqual([]);
      expect(result[0].sourceVersions).toEqual({});
    });

    it('does not duplicate version in versions array', () => {
      const entities = [
        {
          spec: {
            collection_full_name: 'dup.ver',
            collection_version: '1.0.0',
          },
          metadata: { annotations: {} },
        },
        {
          spec: {
            collection_full_name: 'dup.ver',
            collection_version: '1.0.0',
          },
          metadata: { annotations: {} },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result[0].versions).toEqual([
        { ref: '', version: '1.0.0', label: '1.0.0' },
      ]);
    });

    it('returns multiple collections for different names', () => {
      const entities = [
        {
          spec: {
            collection_full_name: 'community.general',
            collection_version: '1.0.0',
          },
          metadata: { annotations: {} },
        },
        {
          spec: {
            collection_full_name: 'ansible.builtin',
            collection_version: '2.14.0',
          },
          metadata: { annotations: {} },
        },
      ];
      const result = buildCollectionsFromCatalogEntities(entities);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.name).sort()).toEqual([
        'ansible.builtin',
        'community.general',
      ]);
    });
  });

  describe('getCollections', () => {
    it('returns collections when fetch returns array body', async () => {
      const catalogEntities = [
        {
          spec: {
            collection_full_name: 'community.general',
            collection_version: '1.0.0',
          },
          metadata: { annotations: {} },
        },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => catalogEntities,
      });

      const result = await getCollections({
        auth: mockAuthService,
        discovery: mockDiscoveryService,
        logger,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].name).toBe('community.general');
      expect(result.results[0].versions).toEqual([
        { ref: '', version: '1.0.0', label: '1.0.0' },
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('entities?filter='),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer catalog-token',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('returns collections when fetch returns body with items array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              spec: {
                collection_full_name: 'ansible.builtin',
                collection_version: '2.14.0',
              },
              metadata: { annotations: {} },
            },
          ],
        }),
      });

      const result = await getCollections({
        auth: mockAuthService,
        discovery: mockDiscoveryService,
        logger,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].name).toBe('ansible.builtin');
    });

    it('uses custom searchQuery when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await getCollections({
        auth: mockAuthService,
        discovery: mockDiscoveryService,
        logger,
        searchQuery: 'kind=Component,spec.type=ansible-collection',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/filter=kind%3DComponent/),
        expect.any(Object),
      );
    });

    it('uses default filter when searchQuery is not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await getCollections({
        auth: mockAuthService,
        discovery: mockDiscoveryService,
        logger,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('ansible-collection'),
        expect.any(Object),
      );
    });

    it('returns empty results and logs warn when response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await getCollections({
        auth: mockAuthService,
        discovery: mockDiscoveryService,
        logger,
      });

      expect(result.results).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Catalog entities request failed: 500 Internal Server Error',
      );
    });

    it('calls discovery.getBaseUrl and auth.getPluginRequestToken', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

      await getCollections({
        auth: mockAuthService,
        discovery: mockDiscoveryService,
        logger,
      });

      expect(mockDiscoveryService.getBaseUrl).toHaveBeenCalledWith('catalog');
      expect(mockAuthService.getOwnServiceCredentials).toHaveBeenCalled();
      expect(mockAuthService.getPluginRequestToken).toHaveBeenCalledWith(
        expect.objectContaining({ targetPluginId: 'catalog' }),
      );
    });
  });
});
