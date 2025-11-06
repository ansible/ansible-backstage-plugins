import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { LoggerService } from '@backstage/backend-plugin-api';

export class EEEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  constructor(private readonly logger: LoggerService) {}

  getProviderName(): string {
    // This key identifies the provider source
    return 'ee-template-entity-provider';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.logger.info('EEEntityProvider connected!');
    this.connection = connection;
  }

  async registerEntity(entity: any): Promise<void> {
    if (!this.connection) {
      throw new Error('EntityProvider not connected yet');
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
}
