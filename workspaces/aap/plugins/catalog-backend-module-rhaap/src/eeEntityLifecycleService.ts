import {
  coreServices,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import type { EEEntityProviderService } from '@ansible/backstage-rhaap-common';
import { eeEntityProviderServiceRef } from '@ansible/backstage-rhaap-common';
import { EEEntityProvider } from './providers/EEEntityProvider';

export class EELifecycleService implements EEEntityProviderService {
  private readonly provider: EEEntityProvider;

  constructor(logger: LoggerService) {
    this.provider = new EEEntityProvider(logger);
  }

  getProviderName(): string {
    return this.provider.getProviderName();
  }

  connect(connection: EntityProviderConnection): Promise<void> {
    return this.provider.connect(connection);
  }

  async register(entity: any): Promise<void> {
    await this.provider.registerExecutionEnvironment(entity);
  }

  async unregister(name: string): Promise<void> {
    await this.provider.unregisterExecutionEnvironment(name);
  }
}

export const eeEntityLifecycleServiceFactory = createServiceFactory({
  service: eeEntityProviderServiceRef,
  deps: {
    logger: coreServices.rootLogger,
  },
  factory({ logger }) {
    return new EELifecycleService(logger);
  },
});
