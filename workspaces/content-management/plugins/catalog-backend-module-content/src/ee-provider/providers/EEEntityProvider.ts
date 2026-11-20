import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import type {
  CatalogEntityMutation,
  CatalogEntityProvider,
} from '@ansible/portal-plugin-node';
import type { EERegistrationLock } from '../EERegistrationLock';

export class EEEntityProvider implements EntityProvider, CatalogEntityProvider {
  private connection?: EntityProviderConnection;

  private registrationLock?: EERegistrationLock;

  constructor(private readonly logger: LoggerService) {}

  getProviderName(): string {
    return 'EEEntityProvider';
  }

  isReady(): boolean {
    return (
      this.connection !== undefined && this.registrationLock?.isReady() === true
    );
  }

  connect(connection: EntityProviderConnection): Promise<void> {
    this.logger.info('EEEntityProvider connected!');
    this.connection = connection;
    return Promise.resolve();
  }

  initializeRegistrationLock(lock: EERegistrationLock): void {
    if (this.registrationLock && this.registrationLock !== lock) {
      throw new Error('EE registration lock is already initialized');
    }
    this.registrationLock = lock;
  }

  withEntityMutation<T>(
    options: { entityRef: string },
    operation: (mutation: CatalogEntityMutation) => Promise<T>,
  ): Promise<T> {
    if (!this.isReady() || !this.registrationLock) {
      return Promise.reject(new Error('EEEntityProvider is not ready'));
    }

    const entityRef = options.entityRef;
    return this.registrationLock(entityRef, async lock => {
      let active = true;
      const assertLockHeld = () => {
        if (!active) {
          throw new Error('EE catalog entity mutation handle has expired');
        }
        lock.assertLockHeld();
      };
      const mutation: CatalogEntityMutation = {
        assertLockHeld,
        get registrationState() {
          assertLockHeld();
          return lock.registrationState;
        },
        upsert: async (entity: Entity) => {
          assertLockHeld();
          this.validateEntity(entity);
          if (stringifyEntityRef(entity) !== entityRef) {
            throw new Error('Execution environment entity reference mismatch');
          }
          await lock.beginRegistrationMutation();
          assertLockHeld();
          await this.registerExecutionEnvironment(entity, assertLockHeld);
          assertLockHeld();
          await lock.completeRegistration();
        },
        remove: async () => {
          assertLockHeld();
          await lock.beginMutation();
          assertLockHeld();
          await this.unregisterExecutionEnvironment(
            this.nameFromEntityRef(entityRef),
            assertLockHeld,
          );
          assertLockHeld();
          await lock.clearRegistration();
        },
        clearRegistration: async () => {
          assertLockHeld();
          await lock.beginMutation();
          assertLockHeld();
          await lock.clearRegistration();
        },
      };

      try {
        assertLockHeld();
        return await operation(mutation);
      } finally {
        active = false;
      }
    });
  }

  async registerExecutionEnvironment(
    entity: Entity,
    assertLockHeld: () => void = () => undefined,
  ): Promise<void> {
    this.validateEntity(entity);
    const connection = this.requireConnection();
    assertLockHeld();
    this.logger.info(`Registering entity ${entity.metadata.name}`);
    await connection.applyMutation({
      type: 'delta',
      added: [{ entity, locationKey: this.getProviderName() }],
      removed: [],
    });
    assertLockHeld();
  }

  async unregisterExecutionEnvironment(
    name: string,
    assertLockHeld: () => void = () => undefined,
  ): Promise<void> {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) {
      throw new Error(
        'Name is required for Execution Environment unregistration',
      );
    }
    const connection = this.requireConnection();
    assertLockHeld();
    this.logger.info(`Unregistering entity ${normalizedName}`);
    await connection.applyMutation({
      type: 'delta',
      added: [],
      removed: [
        {
          entityRef: stringifyEntityRef({
            kind: 'Component',
            namespace: 'default',
            name: normalizedName,
          }),
          locationKey: this.getProviderName(),
        },
      ],
    });
    assertLockHeld();
  }

  private validateEntity(entity: Entity): void {
    if (!entity.metadata?.name) {
      throw new Error(
        'Name [metadata.name] is required for Execution Environment registration',
      );
    }
    if (entity.spec?.type !== 'execution-environment') {
      throw new Error(
        'Type [spec.type] must be "execution-environment" for Execution Environment registration',
      );
    }
    if (entity.kind !== 'Component') {
      throw new Error('Execution Environment entities must be Components');
    }
  }

  private requireConnection(): EntityProviderConnection {
    if (!this.connection) {
      throw new Error('EEEntityProvider is not connected yet');
    }
    return this.connection;
  }

  private nameFromEntityRef(entityRef: string): string {
    return entityRef.slice(entityRef.lastIndexOf('/') + 1);
  }
}
