import { computeClusters, isOutlier, hostColor } from './hostUtils';
import type { HostPosture } from '@ansible/backstage-compliance-common/types';

function host(pct: number, catI = 0): HostPosture {
  return {
    hostname: `host-${pct}`,
    passCount: Math.round(pct * 3.66),
    failCount: 366 - Math.round(pct * 3.66),
    naCount: 0,
    catIFail: catI,
    catIIFail: 10,
    catIIIFail: 5,
    compliancePct: pct,
  };
}

describe('computeClusters', () => {
  it('returns empty for empty input', () => {
    expect(computeClusters([])).toEqual([]);
  });

  it('creates a single cluster when all hosts are within 5pp', () => {
    const hosts = [host(90), host(92), host(94), host(93)];
    const clusters = computeClusters(hosts);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].hosts).toHaveLength(4);
  });

  it('splits into two clusters when gap > 5pp', () => {
    const hosts = [host(40), host(42), host(90), host(92), host(94)];
    const clusters = computeClusters(hosts);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].hosts).toHaveLength(2);
    expect(clusters[1].hosts).toHaveLength(3);
  });

  it('marks small clusters as outliers', () => {
    const hosts = [
      host(30),
      host(32),
      ...Array.from({ length: 20 }, (_, i) => host(90 + i * 0.3)),
    ];
    const clusters = computeClusters(hosts);
    const outlierCluster = clusters.find(c => c.isOutlier);
    expect(outlierCluster).toBeDefined();
    expect(outlierCluster!.hosts).toHaveLength(2);
  });

  it('does not mark the main cluster as outlier', () => {
    const hosts = Array.from({ length: 20 }, (_, i) => host(90 + i * 0.3));
    const clusters = computeClusters(hosts);
    expect(clusters.every(c => !c.isOutlier)).toBe(true);
  });
});

describe('isOutlier', () => {
  it('returns false for small arrays', () => {
    const hosts = [host(50), host(90)];
    expect(isOutlier(hosts[0], hosts)).toBe(false);
  });

  it('detects outlier host significantly below mean', () => {
    const hosts = [host(40), ...Array.from({ length: 10 }, () => host(95))];
    expect(isOutlier(hosts[0], hosts)).toBe(true);
  });

  it('does not flag normal host', () => {
    const hosts = Array.from({ length: 10 }, (_, i) => host(90 + i));
    expect(isOutlier(hosts[5], hosts)).toBe(false);
  });
});

describe('hostColor', () => {
  it('returns red for outlier', () => {
    const hosts = [host(40), ...Array.from({ length: 10 }, () => host(95))];
    expect(hostColor(hosts[0], hosts)).toBe('#C9190B');
  });

  it('returns yellow for CAT I with no outlier', () => {
    const hosts = Array.from({ length: 5 }, () => host(90, 1));
    expect(hostColor(hosts[0], hosts)).toBe('#F0AB00');
  });

  it('returns green for normal compliant host', () => {
    const hosts = Array.from({ length: 5 }, () => host(95));
    expect(hostColor(hosts[0], hosts)).toBe('#3E8635');
  });

  it('returns red for sub-threshold host even with CAT I findings', () => {
    const hosts = Array.from({ length: 5 }, () => host(60, 1));
    expect(hostColor(hosts[0], hosts)).toBe('#C9190B');
  });

  it('returns yellow for above-threshold host with CAT I findings', () => {
    const hosts = Array.from({ length: 5 }, () => host(75, 1));
    expect(hostColor(hosts[0], hosts)).toBe('#F0AB00');
  });
});
