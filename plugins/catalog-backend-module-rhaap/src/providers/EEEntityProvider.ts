import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { LoggerService } from '@backstage/backend-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';

export class EEEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  constructor(private readonly logger: LoggerService) {}

  getProviderName(): string {
    // This key identifies the provider source
    return 'EEEntityProvider';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.logger.info('EEEntityProvider connected!');
    this.connection = connection;
  }

  async registerExecutionEnvironment(entity: any): Promise<void> {
    if (!this.connection) {
      throw new Error('EEEntityProvider is not connected yet');
    }

    if (!entity.metadata?.name) {
      throw new Error(
        'Name [metadata.name] is required for Execution Environment registration',
      );
    }

    if (!entity.spec?.type || entity.spec.type !== 'execution-environment') {
      throw new Error(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    }

    this.logger.info(`Registering entity ${entity.metadata?.name}`);

    await this.connection.applyMutation({
      type: 'delta',
      added: [
        {
          entity,
          locationKey: this.getProviderName(),
        },
      ],
      removed: [],
    });
  }

  /**
   * Removes a provider-managed Execution Environment entity via delta mutation.
   * Only entities owned by this provider (`locationKey: EEEntityProvider`) are removed.
   */
  async unregisterExecutionEnvironment(name: string): Promise<void> {
    if (!this.connection) {
      throw new Error('EEEntityProvider is not connected yet');
    }

    const trimmed = name?.toString().trim();
    if (!trimmed) {
      throw new Error(
        'Name is required for Execution Environment unregistration',
      );
    }

    this.logger.info(`Unregistering entity ${trimmed}`);

    await this.connection.applyMutation({
      type: 'delta',
      added: [],
      removed: [
        {
          entityRef: stringifyEntityRef({
            kind: 'Component',
            namespace: 'default',
            name: trimmed,
          }),
          locationKey: this.getProviderName(),
        },
      ],
    });
  }
}
