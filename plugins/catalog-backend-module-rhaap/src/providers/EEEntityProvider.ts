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
}
