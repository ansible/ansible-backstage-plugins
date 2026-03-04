import { EEEntityRegistrar } from './EEEntityRegistrar';

describe('EEEntityRegistrar', () => {
  let registrar: EEEntityRegistrar;
  let mockLogger: { info: jest.Mock };
  let mockApplyMutation: jest.Mock;

  const validEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'test-ee',
      namespace: 'default',
    },
    spec: {
      type: 'execution-environment',
      lifecycle: 'production',
      owner: 'team-a',
    },
  };

  beforeEach(() => {
    mockLogger = { info: jest.fn() };
    mockApplyMutation = jest.fn().mockResolvedValue(undefined);
    registrar = new EEEntityRegistrar(mockLogger);
  });

  describe('setConnection', () => {
    it('should store the applyMutation callback and log', () => {
      registrar.setConnection(mockApplyMutation);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'EEEntityRegistrar: connection established',
      );
    });

    it('should allow overwriting a previously set connection', () => {
      const firstMutation = jest.fn();
      const secondMutation = jest.fn().mockResolvedValue(undefined);

      registrar.setConnection(firstMutation);
      registrar.setConnection(secondMutation);

      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('registerExecutionEnvironment', () => {
    beforeEach(() => {
      registrar.setConnection(mockApplyMutation);
    });

    it('should apply a delta mutation with the entity', async () => {
      await registrar.registerExecutionEnvironment(validEntity);

      expect(mockApplyMutation).toHaveBeenCalledWith({
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

    it('should log the entity name being registered', async () => {
      await registrar.registerExecutionEnvironment(validEntity);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registering entity test-ee',
      );
    });

    it('should throw when no connection has been set', async () => {
      const unconnected = new EEEntityRegistrar(mockLogger);

      await expect(
        unconnected.registerExecutionEnvironment(validEntity),
      ).rejects.toThrow('EEEntityRegistrar is not connected yet');
    });

    it('should throw when metadata is missing', async () => {
      await expect(
        registrar.registerExecutionEnvironment({ spec: validEntity.spec }),
      ).rejects.toThrow(
        'Name [metadata.name] is required for Execution Environment registration',
      );
    });

    it('should throw when metadata is null', async () => {
      await expect(
        registrar.registerExecutionEnvironment({
          metadata: null,
          spec: validEntity.spec,
        }),
      ).rejects.toThrow(
        'Name [metadata.name] is required for Execution Environment registration',
      );
    });

    it('should throw when metadata.name is missing', async () => {
      await expect(
        registrar.registerExecutionEnvironment({
          metadata: { namespace: 'default' },
          spec: validEntity.spec,
        }),
      ).rejects.toThrow(
        'Name [metadata.name] is required for Execution Environment registration',
      );
    });

    it('should throw when metadata.name is empty string', async () => {
      await expect(
        registrar.registerExecutionEnvironment({
          metadata: { name: '' },
          spec: validEntity.spec,
        }),
      ).rejects.toThrow(
        'Name [metadata.name] is required for Execution Environment registration',
      );
    });

    it('should throw when spec is missing', async () => {
      await expect(
        registrar.registerExecutionEnvironment({
          metadata: validEntity.metadata,
        }),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });

    it('should throw when spec is null', async () => {
      await expect(
        registrar.registerExecutionEnvironment({
          metadata: validEntity.metadata,
          spec: null,
        }),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });

    it('should throw when spec.type is missing', async () => {
      await expect(
        registrar.registerExecutionEnvironment({
          metadata: validEntity.metadata,
          spec: { lifecycle: 'production' },
        }),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });

    it('should throw when spec.type is not "execution-environment"', async () => {
      await expect(
        registrar.registerExecutionEnvironment({
          metadata: validEntity.metadata,
          spec: { type: 'service' },
        }),
      ).rejects.toThrow(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    });

    it('should not call applyMutation when validation fails', async () => {
      await expect(
        registrar.registerExecutionEnvironment({
          metadata: { name: 'bad' },
          spec: { type: 'service' },
        }),
      ).rejects.toThrow();

      expect(mockApplyMutation).not.toHaveBeenCalled();
    });

    it('should propagate errors from applyMutation', async () => {
      mockApplyMutation.mockRejectedValue(new Error('catalog write failed'));

      await expect(
        registrar.registerExecutionEnvironment(validEntity),
      ).rejects.toThrow('catalog write failed');
    });

    it('should use the overwritten connection after setConnection is called again', async () => {
      const secondMutation = jest.fn().mockResolvedValue(undefined);
      registrar.setConnection(secondMutation);

      await registrar.registerExecutionEnvironment(validEntity);

      expect(mockApplyMutation).not.toHaveBeenCalled();
      expect(secondMutation).toHaveBeenCalledTimes(1);
    });
  });
});
