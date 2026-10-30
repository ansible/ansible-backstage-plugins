import type { BasicPermission } from '@backstage/plugin-permission-common';

/**
 * Compliance plugin RBAC permissions.
 *
 * These gate access to the compliance backend's routes: scan launch,
 * findings ingest, remediation launch, profile management, and findings
 * export. They are registered with the Backstage permissions framework via
 * `permissionsRegistry.addPermissions()` in the compliance-backend plugin,
 * and enforced per-route with `requirePermission()`.
 *
 * `compliance.findings.ingest` is the most security-sensitive permission:
 * it governs the `/findings/ingest` and scan-artifact registration routes,
 * which are called by an AAP Controller job (not an interactive user) using
 * a Backstage `externalAccess` static token. See
 * `workspaces/compliance/README.md` for the full ingest security model.
 */

export const findingsIngestPermission: BasicPermission = {
  type: 'basic',
  name: 'compliance.findings.ingest',
  attributes: {},
};

export const scanLaunchPermission: BasicPermission = {
  type: 'basic',
  name: 'compliance.scan.launch',
  attributes: {},
};

export const scanReadPermission: BasicPermission = {
  type: 'basic',
  name: 'compliance.scan.read',
  attributes: {},
};

export const remediateLaunchPermission: BasicPermission = {
  type: 'basic',
  name: 'compliance.remediate.launch',
  attributes: {},
};

export const profileManagePermission: BasicPermission = {
  type: 'basic',
  name: 'compliance.profile.manage',
  attributes: {},
};

export const findingsExportPermission: BasicPermission = {
  type: 'basic',
  name: 'compliance.findings.export',
  attributes: {},
};

export const compliancePermissions: BasicPermission[] = [
  findingsIngestPermission,
  scanLaunchPermission,
  scanReadPermission,
  remediateLaunchPermission,
  profileManagePermission,
  findingsExportPermission,
];
