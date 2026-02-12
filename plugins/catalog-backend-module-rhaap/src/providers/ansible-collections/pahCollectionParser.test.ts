import { ICollection } from '@ansible/backstage-rhaap-common';
import { pahCollectionParser } from './pahCollectionParser';

describe('pahCollectionParser', () => {
  const baseUrl = 'https://pah.example.com';

  const createMockCollection = (
    overrides: Partial<ICollection> = {},
  ): ICollection => ({
    namespace: 'ansible',
    name: 'posix',
    version: '1.5.4',
    dependencies: { 'ansible.builtin': '>=2.9' },
    description: 'POSIX collection for Ansible',
    tags: ['linux', 'posix', 'system'],
    repository_name: 'validated',
    collection_readme_html: '<h1>Ansible POSIX Collection</h1>',
    authors: ['Ansible Core Team'],
    ...overrides,
  });

  describe('entity structure', () => {
    it('should return a valid Backstage Entity', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.apiVersion).toBe('backstage.io/v1alpha1');
      expect(entity.kind).toBe('Component');
      expect(entity.metadata.namespace).toBe('default');
    });

    it('should generate a unique entity name with repository', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.name).toBe('pah-validated-ansible.posix-1.5.4');
    });

    it('should handle different namespaces and names', () => {
      const collection = createMockCollection({
        namespace: 'cisco',
        name: 'ios',
        version: '2.0.0',
        repository_name: 'rh-certified',
      });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.name).toBe('pah-rh-certified-cisco.ios-2.0.0');
    });
  });

  describe('metadata.title', () => {
    it('should include version in title when version is provided', () => {
      const collection = createMockCollection({ version: '1.5.4' });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.title).toBe('ansible.posix v1.5.4');
    });

    it('should not include version in title when version is null', () => {
      const collection = createMockCollection({ version: null });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.title).toBe('ansible.posix');
    });

    it('should not include version in title when version is N/A', () => {
      const collection = createMockCollection({ version: 'N/A' });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.title).toBe('ansible.posix');
    });
  });

  describe('metadata.description', () => {
    it('should use collection description when provided', () => {
      const collection = createMockCollection({
        description: 'Custom description',
      });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.description).toBe('Custom description');
    });

    it('should use default description when collection description is null', () => {
      const collection = createMockCollection({ description: null });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.description).toBe(
        'Ansible Collection: ansible.posix',
      );
    });
  });

  describe('metadata.annotations', () => {
    it('should generate correct source URL', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.annotations!['backstage.io/source-url']).toBe(
        'https://pah.example.com/content/collections/validated/ansible/posix/details?version=1.5.4',
      );
    });

    it('should generate correct view URL', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.annotations!['backstage.io/view-url']).toBe(
        'https://pah.example.com/content/collections/validated/ansible/posix/documentation?version=1.5.4',
      );
    });

    it('should set collection source annotation to pah', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.annotations!['ansible.io/collection-source']).toBe(
        'pah',
      );
    });

    it('should set repository name annotation', () => {
      const collection = createMockCollection({
        repository_name: 'rh-certified',
      });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(
        entity.metadata.annotations!['ansible.io/collection-source-repository'],
      ).toBe('rh-certified');
    });

    it('should generate correct install URL', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(
        entity.metadata.annotations!['ansible.io/collection-install-url'],
      ).toBe(
        'https://pah.example.com/content/collections/validated/ansible/posix/install?version=1.5.4',
      );
    });

    it('should set readme format annotation to html', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(
        entity.metadata.annotations!['ansible.io/collection-readme-format'],
      ).toBe('html');
    });
  });

  describe('spec', () => {
    it('should set type to ansible-collection', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.type).toBe('ansible-collection');
    });

    it('should set lifecycle to production when version is provided', () => {
      const collection = createMockCollection({ version: '1.0.0' });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.lifecycle).toBe('production');
    });

    it('should set lifecycle to development when version is null', () => {
      const collection = createMockCollection({ version: null });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.lifecycle).toBe('development');
    });

    it('should set owner to collection namespace', () => {
      const collection = createMockCollection({ namespace: 'redhat' });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.owner).toBe('redhat');
    });

    it('should set system based on namespace', () => {
      const collection = createMockCollection({ namespace: 'community' });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.system).toBe('community-collections');
    });

    it('should include collection namespace in spec', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_namespace).toBe('ansible');
    });

    it('should include collection name in spec', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_name).toBe('posix');
    });

    it('should include collection version in spec', () => {
      const collection = createMockCollection({ version: '2.0.0' });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_version).toBe('2.0.0');
    });

    it('should use empty string for version when null', () => {
      const collection = createMockCollection({ version: null });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_version).toBe('');
    });

    it('should include collection dependencies in spec', () => {
      const dependencies = {
        'ansible.builtin': '>=2.9',
        'ansible.netcommon': '>=2.0',
      };
      const collection = createMockCollection({ dependencies });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_dependencies).toEqual(dependencies);
    });

    it('should handle null dependencies', () => {
      const collection = createMockCollection({ dependencies: null });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_dependencies).toBeNull();
    });

    it('should include collection tags in spec', () => {
      const tags = ['networking', 'cloud', 'aws'];
      const collection = createMockCollection({ tags });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_tags).toEqual(tags);
    });

    it('should use empty array for tags when null', () => {
      const collection = createMockCollection({ tags: null });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_tags).toEqual([]);
    });

    it('should include collection authors in spec', () => {
      const authors = ['John Doe', 'Jane Smith'];
      const collection = createMockCollection({ authors });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_authors).toEqual(authors);
    });

    it('should use empty array for authors when null', () => {
      const collection = createMockCollection({ authors: null });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_authors).toEqual([]);
    });

    it('should include collection readme html in spec', () => {
      const readmeHtml = '<h1>My Collection</h1><p>Description</p>';
      const collection = createMockCollection({
        collection_readme_html: readmeHtml,
      });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_readme_html).toBe(readmeHtml);
    });

    it('should use empty string for readme html when null', () => {
      const collection = createMockCollection({
        collection_readme_html: null,
      });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.spec!.collection_readme_html).toBe('');
    });
  });

  describe('URL construction', () => {
    it('should handle base URLs without trailing slash', () => {
      const collection = createMockCollection();
      const entity = pahCollectionParser({
        collection,
        baseUrl: 'https://pah.example.com',
      });

      expect(entity.metadata.annotations!['backstage.io/source-url']).toContain(
        'https://pah.example.com/content/collections/',
      );
    });

    it('should construct URLs with different repository names', () => {
      const collection = createMockCollection({ repository_name: 'published' });
      const entity = pahCollectionParser({ collection, baseUrl });

      expect(entity.metadata.annotations!['backstage.io/source-url']).toContain(
        '/published/',
      );
    });
  });
});
