import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { EEEntityRegistrar } from '@ansible/backstage-rhaap-common';

/**
 * Catalog EntityProvider that bridges the shared EEEntityRegistrar
 * with the catalog's EntityProviderConnection.
 */
export class EEEntityProvider implements EntityProvider {
  constructor(private readonly registrar: EEEntityRegistrar) {}

  getProviderName(): string {
    return 'EEEntityProvider';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.registrar.setConnection(connection.applyMutation.bind(connection));
  }
}
