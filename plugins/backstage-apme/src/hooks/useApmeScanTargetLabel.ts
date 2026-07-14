/*
 * Copyright Red Hat
 */

import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useAsync } from 'react-use';
import { DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION } from '@ansible/backstage-apme-common/scanTargetDefaults';
import { apmeApiRef } from '../api';
import { formatAnsibleCoreVersionLabel } from '../utils/scanTargetVersion';

/**
 * Scan target label for UI copy — prefers a version from the latest project scan,
 * then portal app-config (`ansible.apme.targetAnsibleCoreVersion`), then 2.16.
 */
export function useApmeScanTargetLabel(fromLastScan?: string | null): string {
  const configApi = useApi(configApiRef);
  const apmeApi = useApi(apmeApiRef);
  const configVersion =
    configApi.getOptionalString('ansible.apme.targetAnsibleCoreVersion') ?? '';

  const { value: settings } = useAsync(
    () => apmeApi.getPortalSettings(),
    [apmeApi],
  );

  const version =
    fromLastScan?.trim() ||
    settings?.targetAnsibleCoreVersion?.trim() ||
    configVersion.trim() ||
    DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION;

  return (
    formatAnsibleCoreVersionLabel(version) ??
    `ansible-core ${DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION}`
  );
}
