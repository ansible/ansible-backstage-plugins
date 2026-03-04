import { EEEntityProvider } from './EEEntityProvider';
import { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { EEEntityRegistrar } from '@ansible/backstage-rhaap-common';
import { mockServices } from '@backstage/backend-test-utils';

describe('EEEntityProvider', () => {
  let provider: EEEntityProvider;
  let registrar: EEEntityRegistrar;
  let mockConnection: EntityProviderConnection;
  let logger: ReturnType<typeof mockServices.logger.mock>;

  beforeEach(() => {
    logger = mockServices.logger.mock();
    registrar = new EEEntityRegistrar(logger);
    provider = new EEEntityProvider(registrar);
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
    it('should connect and set the connection on the registrar', async () => {
      await provider.connect(mockConnection);
      expect(logger.info).toHaveBeenCalledWith(
        'EEEntityRegistrar: connection established',
      );
    });
  });

  describe('registerExecutionEnvironment (via registrar)', () => {
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
      await registrar.registerExecutionEnvironment(validEntity);

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
      const unconnectedRegistrar = new EEEntityRegistrar(logger);

      await expect(
        unconnectedRegistrar.registerExecutionEnvironment(validEntity),
      ).rejects.toThrow('EEEntityRegistrar is not connected yet');
    });

    it('should throw error when metadata.name is missing', async () => {
      const entityWithoutName = {
        ...validEntity,
        metadata: {
          namespace: 'default',
        },
      };

      await expect(
        registrar.registerExecutionEnvironment(entityWithoutName),
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
        registrar.registerExecutionEnvironment(entityWithoutType),
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
        registrar.registerExecutionEnvironment(entityWithWrongType),
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
        registrar.registerExecutionEnvironment(entityWithNullMetadata),
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
        registrar.registerExecutionEnvironment(entityWithNullSpec),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });
  });
});
