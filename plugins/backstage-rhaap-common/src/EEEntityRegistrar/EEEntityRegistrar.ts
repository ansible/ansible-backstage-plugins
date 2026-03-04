import {
  createServiceFactory,
  createServiceRef,
  coreServices,
} from '@backstage/backend-plugin-api';

/**
 * Interface for registering Execution Environment entities in the catalog.
 * Shared across the catalog and scaffolder plugins via a root-scoped service ref.
 *
 * @public
 */
export interface IEEEntityRegistrar {
  registerExecutionEnvironment(entity: any): Promise<void>;
}

type ApplyMutationFn = (mutation: {
  type: 'delta';
  added: Array<{ entity: any; locationKey: string }>;
  removed: Array<{ entity: any; locationKey: string }>;
}) => Promise<void>;

/**
 * Default implementation that defers to a catalog EntityProviderConnection
 * set at runtime by the catalog module via `setConnection`.
 */
export class EEEntityRegistrar implements IEEEntityRegistrar {
  private applyMutation?: ApplyMutationFn;
  private readonly providerName = 'EEEntityProvider';

  constructor(private readonly logger: { info: (msg: string) => void }) {}

  setConnection(applyMutation: ApplyMutationFn): void {
    this.applyMutation = applyMutation;
    this.logger.info('EEEntityRegistrar: connection established');
  }

  async registerExecutionEnvironment(entity: any): Promise<void> {
    if (!this.applyMutation) {
      throw new Error('EEEntityRegistrar is not connected yet');
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

    await this.applyMutation({
      type: 'delta',
      added: [
        {
          entity,
          locationKey: this.providerName,
        },
      ],
      removed: [],
    });
  }
}

/**
 * Root-scoped service ref so both catalog and scaffolder plugins
 * share the same EEEntityRegistrar instance.
 *
 * @public
 */
export const eeEntityRegistrarRef = createServiceRef<EEEntityRegistrar>({
  id: 'rhaap.ee-entity-registrar',
  scope: 'root',
  defaultFactory: async (service: any) =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.rootLogger,
      },
      async factory({ logger }) {
        return new EEEntityRegistrar(logger);
      },
    }),
});
