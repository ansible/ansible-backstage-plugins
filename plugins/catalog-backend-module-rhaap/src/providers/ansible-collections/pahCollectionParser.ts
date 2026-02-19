import { ICollection } from '@ansible/backstage-rhaap-common';
import { Entity } from '@backstage/catalog-model';

export const pahCollectionParser = (options: {
  collection: ICollection;
  baseUrl: string;
}): Entity => {
  const collectionBaseUrl =
    `${options.baseUrl}/content/collections/` +
    `${options.collection.repository_name}/` +
    `${options.collection.namespace}/` +
    `${options.collection.name}`;

  // Build links array from galaxy.yml metadata (same style as SCM collections in PR #156)
  const links: Array<{ url: string; title: string; icon?: string }> = [];

  if (options.collection.links?.repository) {
    links.push({
      url: options.collection.links.repository,
      title: 'Repository',
      icon: 'github',
    });
  }
  if (options.collection.links?.documentation) {
    links.push({
      url: options.collection.links.documentation,
      title: 'Documentation',
      icon: 'docs',
    });
  }
  if (options.collection.links?.homepage) {
    links.push({
      url: options.collection.links.homepage,
      title: 'Homepage',
      icon: 'web',
    });
  }
  if (options.collection.links?.issues) {
    links.push({
      url: options.collection.links.issues,
      title: 'Issues',
      icon: 'bug',
    });
  }

  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',

    metadata: {
      namespace: 'default',
      // name needs to be unique across all collections
      name: `pah-${options.collection.repository_name}-${options.collection.namespace}.${options.collection.name}-${options.collection.version}`,

      title:
        options.collection.version && options.collection.version !== 'N/A'
          ? `${options.collection.namespace}.${options.collection.name} v${options.collection.version}`
          : `${options.collection.namespace}.${options.collection.name}`,

      description:
        options.collection.description ??
        `Ansible Collection: ${options.collection.namespace}.${options.collection.name}`,

      // Tags displayed in the Backstage UI tags column
      tags: options.collection.tags || [],

      // Links from galaxy.yml metadata
      links: links.length > 0 ? links : undefined,

      annotations: {
        'backstage.io/source-url': `${collectionBaseUrl}/details?version=${options.collection.version}`,
        'backstage.io/view-url': `${collectionBaseUrl}/documentation?version=${options.collection.version}`,
        'backstage.io/managed-by-location': `url:${collectionBaseUrl}/details?version=${options.collection.version}`,
        'backstage.io/managed-by-origin-location': `url:${collectionBaseUrl}/details?version=${options.collection.version}`,

        'ansible.io/collection-source': 'pah',
        'ansible.io/collection-source-repository':
          options.collection.repository_name,
        'ansible.io/collection-install-url': `${collectionBaseUrl}/install?version=${options.collection.version}`,
        'ansible.io/collection-readme-format': 'html',
      },
    },
    spec: {
      type: 'ansible-collection',
      lifecycle: options.collection.version ? 'production' : 'development',
      owner: options.collection.namespace,
      system: `${options.collection.namespace}-collections`,

      collection_namespace: options.collection.namespace,
      collection_name: options.collection.name,
      collection_version: options.collection.version || '',
      collection_full_name: `${options.collection.namespace}.${options.collection.name}`,
      collection_dependencies: options.collection.dependencies,
      collection_description:
        options.collection.description ??
        `Ansible Collection: ${options.collection.namespace}.${options.collection.name}`,
      collection_authors: options.collection.authors || [],
      collection_readme_html: options.collection.collection_readme_html || '',
    },
  };
};
