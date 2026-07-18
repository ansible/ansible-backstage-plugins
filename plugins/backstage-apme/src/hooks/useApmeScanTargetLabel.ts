/*
 * Copyright Red Hat
 */

import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useAsync } from 'react-use';
import type { ProjectScanTarget, ScanTargetSource } from '@ansible/backstage-apme-common/types';
import { DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION } from '@ansible/backstage-apme-common/scanTargetDefaults';
import { apmeApiRef } from '../api';
import { formatAnsibleCoreVersionLabel } from '../utils/scanTargetVersion';

export interface ScanTargetDisplay {
  label: string;
  effective: string;
  source: ScanTargetSource;
  globalDefault: string;
  projectOverride?: string;
}

function toDisplay(
  resolution: Pick<
    ProjectScanTarget,
    'effective' | 'source' | 'globalDefault' | 'projectOverride'
  >,
): ScanTargetDisplay {
  const label =
    formatAnsibleCoreVersionLabel(resolution.effective) ??
    `ansible-core ${DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION}`;
  return {
    label,
    effective: resolution.effective,
    source: resolution.source,
    globalDefault: resolution.globalDefault,
    projectOverride: resolution.projectOverride,
  };
}

/** Portal-wide scan target (Quality Overview, Rules caption). */
export function useApmeScanTargetLabel(): ScanTargetDisplay {
  const configApi = useApi(configApiRef);
  const apmeApi = useApi(apmeApiRef);
  const configVersion =
    configApi.getOptionalString('ansible.apme.targetAnsibleCoreVersion') ?? '';

  const { value: settings } = useAsync(
    () => apmeApi.getPortalSettings(),
    [apmeApi],
  );

  const version =
    settings?.targetAnsibleCoreVersion?.trim() ||
    configVersion.trim() ||
    DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION;

  return toDisplay({
    effective: version,
    source: settings?.targetAnsibleCoreVersion ? 'global' : 'default',
    globalDefault: version,
  });
}

