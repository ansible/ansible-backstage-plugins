import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { HostRiskHeatmapWidget } from './HostRiskHeatmapWidget';
import { complianceApiRef } from '../../api';
import type { HostRiskEntry } from '@ansible/backstage-compliance-common/types';

const mockAlertApi = { post: jest.fn() };
const mockApi = {
  downloadArtifact: jest.fn().mockResolvedValue(undefined),
  getArtifacts: jest.fn().mockResolvedValue([]),
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TestApiProvider apis={[[alertApiRef, mockAlertApi], [complianceApiRef, mockApi as any]]}>
    {children}
  </TestApiProvider>
);

const host = (overrides: Partial<HostRiskEntry> = {}): HostRiskEntry => ({
  hostname: 'rhel01',
  critical: 5,
  medium: 10,
  low: 3,
  total: 18,
  score: 100,
  scannedPackages: 500,
  ...overrides,
});

describe('HostRiskHeatmapWidget', () => {
  it('renders nothing when hostRisk is empty', () => {
    const { container } = render(
      <HostRiskHeatmapWidget
        config={{ widget: 'host_risk_heatmap' }}
        tabData={{ hostRisk: [], summary: { totalPackages: 0 } }}
      />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders host rows with risk score', () => {
    render(
      <HostRiskHeatmapWidget
        config={{ widget: 'host_risk_heatmap', title: 'Host Risk' }}
        tabData={{ hostRisk: [host()], summary: { totalPackages: 500 } }}
      />,
      { wrapper },
    );
    expect(screen.getByText('rhel01')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('uses scannedPackages as denominator for bar widths', () => {
    const { container } = render(
      <HostRiskHeatmapWidget
        config={{ widget: 'host_risk_heatmap' }}
        tabData={{ hostRisk: [host({ scannedPackages: 1000, critical: 10, medium: 20, low: 5, total: 35 })], summary: { totalPackages: 1000 } }}
      />,
      { wrapper },
    );
    const segments = container.querySelectorAll('[class*="seg"]');
    expect(segments.length).toBe(3);
  });

  it('falls back to total when scannedPackages is 0', () => {
    render(
      <HostRiskHeatmapWidget
        config={{ widget: 'host_risk_heatmap' }}
        tabData={{ hostRisk: [host({ scannedPackages: 0, total: 20 })], summary: { totalPackages: 0 } }}
      />,
      { wrapper },
    );
    expect(screen.getByText('rhel01')).toBeInTheDocument();
  });

  it('uses custom labels from config', () => {
    render(
      <HostRiskHeatmapWidget
        config={{ widget: 'host_risk_heatmap', labels: { findings: 'Vulnerabilities' } }}
        tabData={{ hostRisk: [host()], summary: { totalPackages: 500 } }}
      />,
      { wrapper },
    );
    expect(screen.getByText('Vulnerabilities')).toBeInTheDocument();
  });

  it('shows download button when actions declared', () => {
    render(
      <HostRiskHeatmapWidget
        config={{ widget: 'host_risk_heatmap', actions: [{ type: 'download_artifact', artifact_key_prefix: 'sbom-', label: 'SBOM' }] }}
        tabData={{ hostRisk: [host({ latestScanId: '4151' })], summary: { totalPackages: 500 } }}
      />,
      { wrapper },
    );
    expect(screen.getByText('SBOM')).toBeInTheDocument();
  });

  it('hides download column when no actions declared', () => {
    render(
      <HostRiskHeatmapWidget
        config={{ widget: 'host_risk_heatmap' }}
        tabData={{ hostRisk: [host()], summary: { totalPackages: 500 } }}
      />,
      { wrapper },
    );
    expect(screen.queryByText('SBOM')).not.toBeInTheDocument();
  });
});
