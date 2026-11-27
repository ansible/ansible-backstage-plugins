import type { BasicPermission } from '@backstage/plugin-permission-common';
import { complianceManifest } from './complianceManifest';

describe('compliance manifest permissions', () => {
  it('assigns read, launch, and remediate to the declared entry points', () => {
    const permissions = new Map<string, string>();
    for (const capability of complianceManifest.capabilities) {
      for (const entryPoint of capability.entryPoints) {
        const permission = entryPoint.requiredPermission as
          | BasicPermission
          | undefined;
        permissions.set(entryPoint.id, permission?.name ?? '');
      }
    }

    expect(Object.fromEntries(permissions)).toEqual({
      'compliance.scan-and-assess.overview-tab': 'compliance.scan.read',
      'compliance.scan-and-assess.scan-tab': 'compliance.scan.launch',
      'compliance.scan-and-assess.results-tab': 'compliance.scan.read',
      'compliance.scan-and-assess.launch-scan-action': 'compliance.scan.launch',
      'compliance.scan-and-assess.profile-tab': 'compliance.scan.read',
      'compliance.remediation.remediations-tab': '',
      'compliance.remediation.launch-remediation-action':
        'compliance.remediate.launch',
      'compliance.inventory-management.inventories-tab': 'compliance.scan.read',
      'compliance.settings.settings-tab': 'compliance.scan.read',
    });
  });
});
