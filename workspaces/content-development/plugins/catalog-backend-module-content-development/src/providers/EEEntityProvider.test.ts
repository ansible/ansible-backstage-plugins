import { EEEntityProvider } from './EEEntityProvider';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { mockServices } from '@backstage/backend-test-utils';

describe('EEEntityProvider', () => {
  let provider: EEEntityProvider;
  let mockConnection: EntityProviderConnection;
  let logger: ReturnType<typeof mockServices.logger.mock>;

  beforeEach(() => {
    logger = mockServices.logger.mock();
    provider = new EEEntityProvider(logger);
    mockConnection = {
      applyMutation: jest.fn(),
      refresh: jest.fn(),
    };
  });

  describe('getProviderName', () => {
    it('should return the correct provider name', () => {
      expect(provider.getProviderName()).toEqual('EEEntityProvider');
    });
  });

  describe('connect', () => {
    it('should connect and set the connection', async () => {
      await provider.connect(mockConnection);
      expect(logger.info).toHaveBeenCalledWith('EEEntityProvider connected!');
    });
  });

  describe('registerExecutionEnvironment', () => {
    const validEntity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-ee',
        namespace: 'default',
      },
      spec: {
        type: 'execution-environment',
      },
    };

    beforeEach(async () => {
      await provider.connect(mockConnection);
    });

    it('should successfully register a valid execution environment entity', async () => {
      await provider.registerExecutionEnvironment(validEntity);

      expect(logger.info).toHaveBeenCalledWith('Registering entity test-ee');
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [
          {
            entity: validEntity,
            locationKey: 'EEEntityProvider',
          },
        ],
        removed: [],
      });
    });

    it('should throw error when not connected', async () => {
      const unconnectedProvider = new EEEntityProvider(logger);

      await expect(
        unconnectedProvider.registerExecutionEnvironment(validEntity),
      ).rejects.toThrow('EEEntityProvider is not connected yet');
    });

    it('should throw error when metadata.name is missing', async () => {
      const entityWithoutName = {
        ...validEntity,
        metadata: {
          namespace: 'default',
        },
      };

      await expect(
        provider.registerExecutionEnvironment(entityWithoutName),
      ).rejects.toThrow(
        'Name [metadata.name] is required for Execution Environment registration',
      );
    });

    it('should throw error when spec.type is missing', async () => {
      const entityWithoutType = {
        ...validEntity,
        spec: {},
      };

      await expect(
        provider.registerExecutionEnvironment(entityWithoutType),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });

    it('should throw error when spec.type is not "execution-environment"', async () => {
      const entityWithWrongType = {
        ...validEntity,
        spec: {
          type: 'wrong-type',
        },
      };

      await expect(
        provider.registerExecutionEnvironment(entityWithWrongType),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });

    it('should handle entity with null metadata', async () => {
      const entityWithNullMetadata = {
        metadata: null,
        spec: {
          type: 'execution-environment',
        },
      };

      await expect(
        provider.registerExecutionEnvironment(entityWithNullMetadata),
      ).rejects.toThrow(
        'Name [metadata.name] is required for Execution Environment registration',
      );
    });

    it('should handle entity with null spec', async () => {
      const entityWithNullSpec = {
        metadata: {
          name: 'test-ee',
        },
        spec: null,
      };

      await expect(
        provider.registerExecutionEnvironment(entityWithNullSpec),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });
  });

  describe('unregisterExecutionEnvironment', () => {
    beforeEach(async () => {
      await provider.connect(mockConnection);
    });

    it('should successfully unregister an execution environment by name', async () => {
      await provider.unregisterExecutionEnvironment('test-ee');

      expect(logger.info).toHaveBeenCalledWith('Unregistering entity test-ee');
      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [],
        removed: [
          {
            entityRef: 'component:default/test-ee',
            locationKey: 'EEEntityProvider',
          },
        ],
      });
    });

    it('should trim whitespace from the name', async () => {
      await provider.unregisterExecutionEnvironment('  my-ee  ');

      expect(mockConnection.applyMutation).toHaveBeenCalledWith({
        type: 'delta',
        added: [],
        removed: [
          {
            entityRef: 'component:default/my-ee',
            locationKey: 'EEEntityProvider',
          },
        ],
      });
    });

    it('should throw error when not connected', async () => {
      const unconnectedProvider = new EEEntityProvider(logger);

      await expect(
        unconnectedProvider.unregisterExecutionEnvironment('test-ee'),
      ).rejects.toThrow('EEEntityProvider is not connected yet');
    });

    it('should throw error when name is empty', async () => {
      await expect(provider.unregisterExecutionEnvironment('')).rejects.toThrow(
        'Name is required for Execution Environment unregistration',
      );
    });

    it('should throw error when name is only whitespace', async () => {
      await expect(
        provider.unregisterExecutionEnvironment('   '),
      ).rejects.toThrow(
        'Name is required for Execution Environment unregistration',
      );
    });
  });
});
