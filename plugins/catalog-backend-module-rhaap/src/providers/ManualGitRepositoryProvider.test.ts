import { ManualGitRepositoryProvider } from './ManualGitRepositoryProvider';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { mockServices } from '@backstage/backend-test-utils';

describe('ManualGitRepositoryProvider', () => {
  let provider: ManualGitRepositoryProvider;
  let mockConnection: EntityProviderConnection;
  let logger: ReturnType<typeof mockServices.logger.mock>;

  beforeEach(() => {
    logger = mockServices.logger.mock();
    provider = new ManualGitRepositoryProvider(logger);
    mockConnection = {
      applyMutation: jest.fn(),
      refresh: jest.fn(),
    };
  });

  describe('getProviderName', () => {
    it('should return the correct provider name', () => {
      expect(provider.getProviderName()).toEqual('ManualGitRepositoryProvider');
    });
  });

  describe('connect', () => {
    it('should connect and set the connection', async () => {
      await provider.connect(mockConnection);
      expect(logger.info).toHaveBeenCalledWith(
        'ManualGitRepositoryProvider connected!',
      );
    });
  });

  describe('registerRepository', () => {
    const validEntity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-org-test-repo-github-manual',
        namespace: 'default',
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/test-org/test-repo',
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-organization': 'test-org',
          'ansible.io/scm-repository': 'test-repo',
        },
      },
      spec: {
        type: 'git-repository',
      },
    };

    beforeEach(async () => {
      await provider.connect(mockConnection);
    });

    it('should successfully register a valid git repository entity', async () => {
      await provider.registerRepository(validEntity);

      expect(logger.info).toHaveBeenCalledWith(
        'Registering manually-added Git repository entity test-org-test-repo-github-manual',
      );
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [
          {
            entity: validEntity,
            locationKey: 'ManualGitRepositoryProvider',
          },
        ],
        removed: [],
      });
    });

    it('should throw error when not connected', async () => {
      const unconnectedProvider = new ManualGitRepositoryProvider(logger);

      await expect(
        unconnectedProvider.registerRepository(validEntity),
      ).rejects.toThrow('ManualGitRepositoryProvider is not connected yet');
    });

    it('should throw error when metadata.name is missing', async () => {
      const entityWithoutName = {
        ...validEntity,
        metadata: {
          namespace: 'default',
        },
      };

      await expect(
        provider.registerRepository(entityWithoutName),
      ).rejects.toThrow(
        'Name [metadata.name] is required for Git repository registration',
      );
    });

    it('should throw error when spec.type is missing', async () => {
      const entityWithoutType = {
        ...validEntity,
        spec: {},
      };

      await expect(
        provider.registerRepository(entityWithoutType),
      ).rejects.toThrow(
        'Type [spec.type] must be "git-repository" for Git repository registration',
      );
    });

    it('should throw error when spec.type is not "git-repository"', async () => {
      const entityWithWrongType = {
        ...validEntity,
        spec: {
          type: 'wrong-type',
        },
      };

      await expect(
        provider.registerRepository(entityWithWrongType),
      ).rejects.toThrow(
        'Type [spec.type] must be "git-repository" for Git repository registration',
      );
    });

    it('should handle entity with null metadata', async () => {
      const entityWithNullMetadata = {
        metadata: null,
        spec: {
          type: 'git-repository',
        },
      };

      await expect(
        provider.registerRepository(entityWithNullMetadata),
      ).rejects.toThrow(
        'Name [metadata.name] is required for Git repository registration',
      );
    });

    it('should handle entity with null spec', async () => {
      const entityWithNullSpec = {
        metadata: {
          name: 'test-org-test-repo-github-manual',
        },
        spec: null,
      };

      await expect(
        provider.registerRepository(entityWithNullSpec),
      ).rejects.toThrow(
        'Type [spec.type] must be "git-repository" for Git repository registration',
      );
    });
  });
});
