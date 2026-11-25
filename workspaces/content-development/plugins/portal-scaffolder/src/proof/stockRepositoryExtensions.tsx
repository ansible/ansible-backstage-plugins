import { Entity } from '@backstage/catalog-model';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import { compatWrapper } from '@backstage/core-compat-api';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';

export const isRepository = (entity: Entity) =>
  entity.kind.toLowerCase() === 'component' &&
  entity.spec?.type === 'git-repository';

// Opt-in proof: no new PageBlueprint, route owner or replacement entity shell.
// Enable these four IDs through app.extensions in the local RHDH overlay.
export const stockRepositoryExtensions: ExtensionDefinition[] = [
  EntityCardBlueprint.make({
    name: 'repository-proof-readme',
    disabled: true,
    params: {
      filter: isRepository,
      type: 'content',
      loader: async () => {
        const { StockRepositoryReadme } = await import(
          './StockRepositoryContent'
        );
        return compatWrapper(<StockRepositoryReadme />);
      },
    },
  }),
  EntityCardBlueprint.make({
    name: 'repository-proof-info',
    disabled: true,
    params: {
      filter: isRepository,
      type: 'info',
      loader: async () => {
        const { StockRepositoryInfo } = await import(
          './StockRepositoryContent'
        );
        return compatWrapper(<StockRepositoryInfo />);
      },
    },
  }),
  EntityContentBlueprint.make({
    name: 'repository-proof-ci',
    disabled: true,
    params: {
      filter: isRepository,
      path: '/repository-ci',
      title: 'CI Activity',
      loader: async () => {
        const { StockRepositoryCI } = await import('./StockRepositoryContent');
        return compatWrapper(<StockRepositoryCI />);
      },
    },
  }),
  EntityContentBlueprint.make({
    name: 'repository-proof-collections',
    disabled: true,
    params: {
      filter: isRepository,
      path: '/repository-collections',
      title: 'Collections',
      loader: async () => {
        const { StockRepositoryCollections } = await import(
          './StockRepositoryContent'
        );
        return compatWrapper(<StockRepositoryCollections />);
      },
    },
  }),
];
