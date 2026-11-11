import {
  coreServices,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { EntityProviderConnection } from '@backstage/plugin-catalog-node';
import type { Entity } from '@backstage/catalog-model';
import type { EEEntityProviderService } from '@ansible/content-development-common';
import { eeEntityProviderServiceRef } from '@ansible/content-development-common';
import { EEEntityProvider } from './providers/EEEntityProvider';

export class EEEntityProviderServiceImpl implements EEEntityProviderService {
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

  async register(entity: Entity): Promise<void> {
    await this.provider.registerExecutionEnvironment(entity);
  }

  async unregister(name: string): Promise<void> {
    await this.provider.unregisterExecutionEnvironment(name);
  }
}

export const eeEntityProviderServiceFactory = createServiceFactory({
  service: eeEntityProviderServiceRef,
  deps: {
    logger: coreServices.rootLogger,
  },
  factory({ logger }) {
    return new EEEntityProviderServiceImpl(logger);
  },
});
