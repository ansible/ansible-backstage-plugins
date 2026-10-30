import { configApiRef, useApi } from '@backstage/core-plugin-api';

/**
 * Plugin Factory config-gated zero-footprint guard.
 *
 * Reads `ansible.compliance.enabled` from the Backstage config.
 * Returns false when the key is absent or explicitly false,
 * preventing all frontend rendering.
 */
export function useComplianceEnabled(): boolean {
  const config = useApi(configApiRef);
  return config.getOptionalBoolean('ansible.compliance.enabled') ?? false;
}
