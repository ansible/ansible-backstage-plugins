import {
  coreServices,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import type {
  AuthService,
  BackstageCredentials,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  catalogEntityCreatePermission,
  catalogEntityDeletePermission,
} from '@backstage/plugin-catalog-common/alpha';
import { CatalogClient } from '@backstage/catalog-client';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type { EntityProvider, EntityProviderConnection } from '@backstage/plugin-catalog-node';
import type {
  EEEntityLifecycleService,
  EELifecycleCleanupResult,
} from '@ansible/backstage-rhaap-common';
import { EEEntityProvider } from './providers/EEEntityProvider';

const EE_ENTITY_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/;

function parseName(name: string): string {
  const value = name.trim().toLowerCase();
  if (!value || value.length > 63 || !EE_ENTITY_NAME_PATTERN.test(value)) {
    throw new Error('Invalid execution environment name.');
  }
  return value;
}

export class EELifecycleService implements EEEntityLifecycleService {
  private readonly provider: EEEntityProvider;

  constructor(
    private readonly logger: LoggerService,
    private readonly auth: AuthService,
    private readonly permissions: PermissionsService,
    private readonly catalogClient: CatalogClient,
  ) {
    this.provider = new EEEntityProvider(logger);
  }

  getProviderName(): string {
    return this.provider.getProviderName();
  }

  connect(connection: EntityProviderConnection): Promise<void> {
    return this.provider.connect(connection);
  }

  async register(entity: any): Promise<void> {
    return this.provider.registerExecutionEnvironment(entity);
  }

  async unregister(name: string): Promise<void> {
    return this.provider.unregisterExecutionEnvironment(name);
  }

  async registerExecutionEnvironment(
    entity: any,
    credentials: BackstageCredentials,
  ): Promise<void> {
    const entityRef = stringifyEntityRef(entity);
    const [createDecision] = await this.permissions.authorize(
      [{ permission: catalogEntityCreatePermission }],
      { credentials },
    );
    if (createDecision.result !== AuthorizeResult.ALLOW) {
      throw new Error('Forbidden: insufficient permissions to create entity');
    }

    const token = await this.getCatalogToken(credentials);
    const existing = await this.catalogClient.getEntityByRef(entityRef, {
      token,
    });
    if (existing) {
      const [deleteDecision] = await this.permissions.authorize(
        [{ permission: catalogEntityDeletePermission, resourceRef: entityRef }],
        { credentials },
      );
      if (deleteDecision.result !== AuthorizeResult.ALLOW) {
        throw new Error(
          'Forbidden: insufficient permissions to replace existing entity',
        );
      }
    }

    await this.provider.registerExecutionEnvironment(entity);
  }

  async unregisterExecutionEnvironment(
    rawName: string,
    credentials: BackstageCredentials,
    options: { skipProviderManaged?: boolean } = {},
  ): Promise<EELifecycleCleanupResult> {
    const name = parseName(rawName);
    const entityRef = stringifyEntityRef({
      kind: 'Component',
      namespace: 'default',
      name,
    });
    const token = await this.getCatalogToken(credentials);
    const catalogOpts = { token };
    const entity = await this.catalogClient.getEntityByRef(entityRef, catalogOpts);
    if (!entity) return { mode: 'noop' };
    if (entity.kind !== 'Component' || entity.spec?.type !== 'execution-environment') {
      throw new Error('Refusing to delete non-execution-environment entity');
    }

    const [deleteDecision] = await this.permissions.authorize(
      [{ permission: catalogEntityDeletePermission, resourceRef: entityRef }],
      { credentials },
    );
    if (deleteDecision.result !== AuthorizeResult.ALLOW) {
      throw new Error('Forbidden: insufficient permissions to delete entity');
    }

    if (
      options.skipProviderManaged &&
      entity.metadata?.annotations?.['ansible.io/download-experience'] === 'true'
    ) {
      return { mode: 'provider' };
    }

    const location = await this.catalogClient.getLocationByEntity(entityRef, catalogOpts);
    if (location?.id) {
      const originLocationRef = `${location.type}:${location.target}`;
      const serviceCredentials = await this.auth.getOwnServiceCredentials();
      const serviceToken = await this.getCatalogToken(serviceCredentials);
      const { items } = await this.catalogClient.getEntities(
        {
          filter: {
            'metadata.annotations.backstage.io/managed-by-origin-location':
              originLocationRef,
          },
          fields: ['kind', 'metadata.name', 'metadata.namespace'],
        },
        { token: serviceToken },
      );
      if (items.length > 1) {
        if (!entity.metadata?.uid) {
          throw new Error('Refusing to remove shared catalog location with colocated entities');
        }
        await this.catalogClient.removeEntityByUid(entity.metadata.uid, catalogOpts);
        return {
          mode: 'entity-transient',
          warning:
            'Shared catalog location still exists; the entity may reappear until catalog-info.yaml is updated.',
        };
      }
      await this.catalogClient.removeLocationById(location.id, catalogOpts);
      return { mode: 'location' };
    }

    await this.provider.unregisterExecutionEnvironment(name);
    if (entity.metadata?.uid) {
      await this.catalogClient.removeEntityByUid(entity.metadata.uid, catalogOpts).catch(error => {
        this.logger.debug(`EE entity was already removed by provider delta: ${String(error)}`);
      });
    }
    return { mode: 'provider' };
  }

  private async getCatalogToken(credentials: BackstageCredentials): Promise<string> {
    const { token } = await this.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    return token;
  }
}

export const eeEntityLifecycleServiceFactory = createServiceFactory({
  service: eeEntityLifecycleServiceRef,
  deps: {
    logger: coreServices.logger,
    auth: coreServices.auth,
    permissions: coreServices.permissions,
    discovery: coreServices.discovery,
  },
  factory({ logger, auth, permissions, discovery }) {
    return new EELifecycleService(
      logger,
      auth,
      permissions,
      new CatalogClient({ discoveryApi: discovery }),
    );
  },
});
