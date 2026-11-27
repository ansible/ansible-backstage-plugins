import {
  complianceOperations,
  complianceProfileDeleteOperation,
  complianceProfileSaveOperation,
  complianceRemediationLaunchOperation,
  complianceScanLaunchOperation,
  compliancePermissions,
  remediateLaunchPermission,
  scanLaunchPermission,
  scanReadPermission,
} from './index';

describe('compliance permissions', () => {
  it('registers only the read, launch, and remediate permissions', () => {
    expect(compliancePermissions.map(permission => permission.name)).toEqual([
      'compliance.scan.launch',
      'compliance.scan.read',
      'compliance.remediate.launch',
    ]);
    expect(scanLaunchPermission).toMatchObject({
      type: 'basic',
      name: 'compliance.scan.launch',
    });
    expect(scanReadPermission.name).toBe('compliance.scan.read');
    expect(remediateLaunchPermission.name).toBe('compliance.remediate.launch');
  });

  it('keeps scan.read off write operations', () => {
    expect(complianceScanLaunchOperation.permission).toBe(scanLaunchPermission);
    expect(complianceProfileSaveOperation.permission).toBe(
      scanLaunchPermission,
    );
    expect(complianceProfileDeleteOperation.permission).toBe(
      scanLaunchPermission,
    );
    expect(complianceRemediationLaunchOperation.permission).toBe(
      remediateLaunchPermission,
    );
    expect(
      complianceOperations.map(operation => operation.permission?.name),
    ).toEqual([
      'compliance.scan.launch',
      'compliance.remediate.launch',
      'compliance.scan.launch',
      'compliance.scan.launch',
    ]);
  });
});
