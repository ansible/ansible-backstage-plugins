import { useState, useEffect } from 'react';
import type { ScanCertification, ProfileDisplayConfig } from '@ansible/backstage-compliance-common/types';
import type { ComplianceApi } from '../../../api';

export interface ScanMetadata {
  scanType: 'assessment' | 'verification' | 'remediation';
  profileName: string;
  frameworkLabel: string;
  profileCert: ScanCertification | null;
  profileDisplayConfig: ProfileDisplayConfig | undefined;
  scanComplianceProfileId: string;
  scanInventoryId: number | null;
  scanInventoryName: string;
  scanStartedAt: string;
  resolvedScanId: string | null;
  resolvedWorkflowJobId: number | null;
}

export function useScanMetadata(
  api: ComplianceApi,
  jobId: string | undefined,
): ScanMetadata {
  const [scanType, setScanType] = useState<'assessment' | 'verification' | 'remediation'>('assessment');
  const [profileName, setProfileName] = useState('');
  const [frameworkLabel, setFrameworkLabel] = useState('');
  const [profileCert, setProfileCert] = useState<ScanCertification | null>(null);
  const [profileDisplayConfig, setProfileDisplayConfig] = useState<ProfileDisplayConfig | undefined>(undefined);
  const [scanComplianceProfileId, setScanComplianceProfileId] = useState('');
  const [scanInventoryId, setScanInventoryId] = useState<number | null>(null);
  const [scanInventoryName, setScanInventoryName] = useState('');
  const [scanStartedAt, setScanStartedAt] = useState('');
  const [resolvedScanId, setResolvedScanId] = useState<string | null>(null);
  const [resolvedWorkflowJobId, setResolvedWorkflowJobId] = useState<number | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    api.getScans().then(scans => {
      if (cancelled) return;
      const match = scans.find(
        s => s.id === jobId || String(s.workflowJobId) === jobId,
      );
      if (match?.scanType) {
        setScanType(match.scanType);
      }
      if (match) {
        setResolvedScanId(match.id);
        setResolvedWorkflowJobId(match.workflowJobId ?? null);
        setScanComplianceProfileId(match.profileId);
        setScanInventoryId(match.inventoryId);
        setScanStartedAt(match.startedAt);
        api.getRegisteredProfiles({ includeDisconnected: true }).then(profiles => {
          if (cancelled) return;
          const cart = profiles.find(c => c.id === match.profileId);
          if (cart) {
            setProfileName(cart.displayName);
            setFrameworkLabel(cart.framework);
            setProfileCert(cart.certification);
            setProfileDisplayConfig(cart.displayConfig);
          }
        }).catch(() => {});
        api.getInventories().then(inventories => {
          if (cancelled) return;
          const inv = inventories.find(i => i.id === match.inventoryId);
          if (inv) {
            setScanInventoryName(inv.name);
          }
        }).catch(() => {});
      }
    }).catch(err => {
      console.error('Failed to load scan metadata for scan type:', err);
    });
    return () => { cancelled = true; };
  }, [api, jobId]);

  return {
    scanType,
    profileName,
    frameworkLabel,
    profileCert,
    profileDisplayConfig,
    scanComplianceProfileId,
    scanInventoryId,
    scanInventoryName,
    scanStartedAt,
    resolvedScanId,
    resolvedWorkflowJobId,
  };
}
