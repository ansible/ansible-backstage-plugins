import type { BasicPermission } from '@backstage/plugin-permission-common';

/**
 * Compliance plugin RBAC permissions.
 *
 * `compliance.scan.read` authorizes GET routes other than the remediations
 * view. Any signed-in user can read remediations. Launching a scan or
 * changing profiles and settings requires `compliance.scan.launch`.
 * Remediation writes require `compliance.remediate.launch`.
 *
 * Findings ingest and scan-artifact registration are called by an AAP
 * Controller job with a Backstage `externalAccess` static token and a
 * per-scan ingest token.
 */

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

export const compliancePermissions: BasicPermission[] = [
  scanLaunchPermission,
  scanReadPermission,
  remediateLaunchPermission,
];
