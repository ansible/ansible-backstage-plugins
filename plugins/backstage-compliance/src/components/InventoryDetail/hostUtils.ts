import type { HostPosture } from '@ansible/backstage-compliance-common/types';
import { STATUS_COLORS, THRESHOLDS } from '../shared/colors';

export interface Cluster {
  id: string;
  min: number;
  max: number;
  hosts: HostPosture[];
  isOutlier: boolean;
}

// Switch from strip plot to chip matrix when cluster has ≤ this many hosts
export const CHIP_THRESHOLD = 50;

export function computeClusters(hosts: HostPosture[]): Cluster[] {
  if (hosts.length === 0) return [];
  const sorted = [...hosts].sort((a, b) => a.compliancePct - b.compliancePct);
  const clusters: Cluster[] = [];
  let current: HostPosture[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].compliancePct - sorted[i - 1].compliancePct > 5) {
      clusters.push(buildCluster(current, clusters.length));
      current = [];
    }
    current.push(sorted[i]);
  }
  if (current.length > 0) clusters.push(buildCluster(current, clusters.length));
  const mainCluster = clusters.reduce((a, b) => a.hosts.length > b.hosts.length ? a : b);
  for (const c of clusters) {
    if (c !== mainCluster && c.hosts.length < mainCluster.hosts.length * 0.15) c.isOutlier = true;
  }
  return clusters;
}

function buildCluster(hosts: HostPosture[], idx: number): Cluster {
  return {
    id: `cluster-${idx}`,
    min: Math.min(...hosts.map(h => h.compliancePct)),
    max: Math.max(...hosts.map(h => h.compliancePct)),
    hosts,
    isOutlier: false,
  };
}

export function isOutlier(host: HostPosture, allHosts: HostPosture[]): boolean {
  if (allHosts.length < 3) return false;
  const scores = allHosts.map(h => h.compliancePct);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const stdDev = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  return host.compliancePct < mean - 1.5 * stdDev;
}

export function hostColor(host: HostPosture, allHosts: HostPosture[]): string {
  if (isOutlier(host, allHosts)) return STATUS_COLORS.error;
  if (host.compliancePct < THRESHOLDS.good) return STATUS_COLORS.error;
  if (host.catIFail > 0) return STATUS_COLORS.warning;
  if (host.compliancePct < THRESHOLDS.excellent) return STATUS_COLORS.warning;
  return STATUS_COLORS.success;
}

export function getChipStyle(host: HostPosture, allHosts: HostPosture[]) {
  const c = hostColor(host, allHosts);
  return {
    borderColor: c,
    color: c,
    backgroundColor: c === STATUS_COLORS.error ? 'rgba(201,25,11,0.04)' : c === STATUS_COLORS.warning ? 'rgba(240,171,0,0.04)' : 'rgba(62,134,53,0.04)',
  };
}

export function findSectionGaps(
  hosts: HostPosture[],
  gapThreshold: number = 5,
): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < hosts.length; i++) {
    if (hosts[i].compliancePct - hosts[i - 1].compliancePct > gapThreshold) {
      gaps.push(i);
    }
  }
  return gaps;
}
