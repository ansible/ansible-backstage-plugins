import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { usePermission } from '@backstage/plugin-permission-react';
import { screen } from '@testing-library/react';
import { scanLaunchPermission } from '@ansible/compliance-common';
import { complianceApiRef } from '../../api';
import { createMockComplianceApi } from '../../__testutils__/mockComplianceApi';
import { LaunchScanDialog } from './LaunchScanDialog';

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: jest.fn(() => ({ allowed: true, loading: false })),
}));

describe('LaunchScanDialog', () => {
  const renderDialog = () =>
    renderInTestApp(
      <TestApiProvider apis={[[complianceApiRef, createMockComplianceApi()]]}>
        <LaunchScanDialog
          open
          onClose={jest.fn()}
          inventoryId={1}
          inventoryName="Production"
          profileOptions={[{ value: 'rhel9-stig', label: 'DISA STIG' }]}
          initialProfileId="rhel9-stig"
        />
      </TestApiProvider>,
    );

  it('requires compliance.scan.launch before enabling Launch Scan', async () => {
    jest.mocked(usePermission).mockReturnValue({
      allowed: false,
      loading: false,
    });

    await renderDialog();

    const button = screen.getByRole('button', { name: 'Launch Scan' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      'You do not have permission to launch scans',
    );
    expect(usePermission).toHaveBeenCalledWith({
      permission: scanLaunchPermission,
    });
  });
});
