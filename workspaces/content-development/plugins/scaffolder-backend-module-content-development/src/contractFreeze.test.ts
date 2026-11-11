import {
  createAnsibleContentAction,
  createEEDefinitionAction,
  prepareForPublishAction,
} from './actions';
import { buildCollectionsFromCatalogEntities } from './autocomplete/utils';

describe('content-development scaffolder contract', () => {
  it('preserves the three ansible action IDs', () => {
    const config = { getString: () => '' } as any;
    const lifecycle = {
      registerExecutionEnvironment: jest.fn(),
      unregisterExecutionEnvironment: jest.fn(),
    };

    expect([
      createAnsibleContentAction(config).id,
      createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        eeLifecycle: lifecycle,
        config,
      }).id,
      prepareForPublishAction({ rootConfig: config }).id,
    ]).toEqual([
      'ansible:content:create',
      'ansible:create:ee-definition',
      'ansible:prepare:publish',
    ]);
  });

  it('preserves the PAH picker source format', () => {
    const [collection] = buildCollectionsFromCatalogEntities([
      {
        spec: { collection_full_name: 'namespace.collection' },
        metadata: {
          annotations: {
            'ansible.io/collection-source': 'pah',
            'ansible.io/collection-source-repository': 'validated',
          },
        },
      },
    ]);

    expect(collection.sources).toEqual(['Private Automation Hub / validated']);
  });

  it('preserves the SCM picker source format', () => {
    const [collection] = buildCollectionsFromCatalogEntities([
      {
        spec: { collection_full_name: 'namespace.collection' },
        metadata: {
          annotations: {
            'ansible.io/scm-provider': 'github',
            'ansible.io/scm-host-name': 'github-public',
            'ansible.io/scm-organization': 'org',
            'ansible.io/scm-repository': 'repository',
          },
        },
      },
    ]);

    expect(collection.sources).toEqual([
      'Github / github-public / org / repository',
    ]);
  });
});
