import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { LoggerService } from '@backstage/backend-plugin-api';

/**
 * A lightweight {@link EntityProvider} for Git repositories registered
 * directly by users (e.g. via a scaffolder template), as opposed to
 * repositories discovered by the scheduled {@link AnsibleGitContentsProvider}
 * crawlers.
 *
 * Unlike `AnsibleGitContentsProvider`, this provider never performs a
 * `'full'` reconciliation. It only ever applies `'delta'` additions, so
 * manually-registered entities persist across restarts and are never wiped
 * out by an unrelated provider's scheduled sync cycle.
 */
export class ManualGitRepositoryProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  constructor(private readonly logger: LoggerService) {}

  getProviderName(): string {
    // This key identifies the provider source
    return 'ManualGitRepositoryProvider';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.logger.info('ManualGitRepositoryProvider connected!');
    this.connection = connection;
  }

  async registerRepository(entity: any): Promise<void> {
    if (!this.connection) {
      throw new Error('ManualGitRepositoryProvider is not connected yet');
    }

    if (!entity?.metadata?.name) {
      throw new Error(
        'Name [metadata.name] is required for Git repository registration',
      );
    }

    if (!entity?.spec?.type || entity.spec.type !== 'git-repository') {
      throw new Error(
        'Type [spec.type] must be "git-repository" for Git repository registration',
      );
    }

    this.logger.info(
      `Registering manually-added Git repository entity ${entity.metadata.name}`,
    );

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
