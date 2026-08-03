import type { PostureSnapshot } from '@ansible/backstage-compliance-common/types';

export type EventType = 'normal' | 'regression' | 'improvement';

export interface TrendDataPoint {
  timestamp: number;
  compliancePct: number;
  profileId: string;
  scanId?: string;
  workflowJobId?: number;
  eventType: EventType;
  delta: number;
  passCount: number;
  failCount: number;
}

export const TREND_COLORS = {
  line: '#0066CC',
  fill: 'rgba(0, 102, 204, 0.08)',
  dot: '#0066CC',
  grid: '#e0e0e0',
  axis: '#6a6e73',
  regression: '#C9190B',
  improvement: '#3E8635',
  remediationLine: '#6A6E73',
};

export const PROFILE_PALETTE = [
  '#0066CC',
  '#C9190B',
  '#3E8635',
  '#F0AB00',
  '#6753AC',
  '#009596',
];

const REGRESSION_THRESHOLD = -3;
const IMPROVEMENT_THRESHOLD = 5;

export function detectEvents(snapshots: PostureSnapshot[]): TrendDataPoint[] {
  if (snapshots.length === 0) return [];
  const result: TrendDataPoint[] = new Array(snapshots.length);
  let prevPct = snapshots[0].compliancePct;
  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const delta = i > 0 ? snap.compliancePct - prevPct : 0;
    let eventType: EventType = 'normal';
    if (i > 0) {
      if (delta <= REGRESSION_THRESHOLD) eventType = 'regression';
      else if (delta >= IMPROVEMENT_THRESHOLD) eventType = 'improvement';
    }
    result[i] = {
      timestamp: new Date(snap.timestamp).getTime(),
      compliancePct: snap.compliancePct,
      profileId: snap.profileId,
      scanId: snap.scanId,
      workflowJobId: snap.workflowJobId,
      eventType,
      delta,
      passCount: snap.passCount,
      failCount: snap.failCount,
    };
    prevPct = snap.compliancePct;
  }
  return result;
}

export interface MultiProfileRow {
  timestamp: number;
  [profileKey: string]: number;
}

/** @deprecated Use buildFilteredSeries which supports composite keys and stoppedSeriesIds. */
export function buildMultiProfileSeries(
  snapshots: PostureSnapshot[],
  profileMap: Map<string, string>,
): { data: MultiProfileRow[]; profileIds: string[] } {
  const byProfile = new Map<string, PostureSnapshot[]>();
  for (const snap of snapshots) {
    const existing = byProfile.get(snap.profileId) ?? [];
    existing.push(snap);
    byProfile.set(snap.profileId, existing);
  }

  const profileIds = [...byProfile.keys()].filter(id => profileMap.has(id));
  if (profileIds.length === 0) return { data: [], profileIds: [] };

  const allTimestamps = new Set<number>();
  for (const snaps of byProfile.values()) {
    for (const s of snaps) allTimestamps.add(new Date(s.timestamp).getTime());
  }
  const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);

  const lastKnown = new Map<string, number>();
  const indexByProfile = new Map<string, number>();
  for (const pid of profileIds) indexByProfile.set(pid, 0);

  const data: MultiProfileRow[] = sortedTimestamps.map(ts => {
    const row: MultiProfileRow = { timestamp: ts };
    for (const pid of profileIds) {
      const snaps = byProfile.get(pid)!;
      let idx = indexByProfile.get(pid)!;
      while (idx < snaps.length && new Date(snaps[idx].timestamp).getTime() <= ts) {
        lastKnown.set(pid, snaps[idx].compliancePct);
        idx++;
      }
      indexByProfile.set(pid, idx);
      const val = lastKnown.get(pid);
      if (val !== undefined) row[pid] = val;
    }
    return row;
  });

  return { data, profileIds };
}

export function buildFilteredSeries(
  snapshots: PostureSnapshot[],
  seriesMap: Map<string, string>,
  groupByInventory: boolean,
  stoppedSeriesIds?: Set<string>,
): { data: MultiProfileRow[]; seriesIds: string[] } {
  const bySeries = new Map<string, PostureSnapshot[]>();
  for (const snap of snapshots) {
    const key = groupByInventory
      ? `${snap.profileId}:${snap.inventoryId ?? 0}`
      : snap.profileId;
    if (!seriesMap.has(key)) continue;
    const existing = bySeries.get(key) ?? [];
    existing.push(snap);
    bySeries.set(key, existing);
  }

  const seriesIds = [...bySeries.keys()];
  if (seriesIds.length === 0) return { data: [], seriesIds: [] };

  const allTimestamps = new Set<number>();
  for (const snaps of bySeries.values()) {
    for (const s of snaps) allTimestamps.add(new Date(s.timestamp).getTime());
  }
  const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);

  const lastKnown = new Map<string, number>();
  const indexBySeries = new Map<string, number>();
  const maxTsBySeries = new Map<string, number>();
  for (const sid of seriesIds) {
    indexBySeries.set(sid, 0);
    const snaps = bySeries.get(sid)!;
    maxTsBySeries.set(sid, new Date(snaps[snaps.length - 1].timestamp).getTime());
  }

  const data: MultiProfileRow[] = sortedTimestamps.map(ts => {
    const row: MultiProfileRow = { timestamp: ts };
    for (const sid of seriesIds) {
      const snaps = bySeries.get(sid)!;
      let idx = indexBySeries.get(sid)!;
      while (idx < snaps.length && new Date(snaps[idx].timestamp).getTime() <= ts) {
        lastKnown.set(sid, snaps[idx].compliancePct);
        idx++;
      }
      indexBySeries.set(sid, idx);
      if (stoppedSeriesIds?.has(sid) && ts > maxTsBySeries.get(sid)!) continue;
      const val = lastKnown.get(sid);
      if (val !== undefined) row[sid] = val;
    }
    return row;
  });

  return { data, seriesIds };
}

export function formatTrendDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatTrendDateFull(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
