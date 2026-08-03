import React, { useState, useMemo, useCallback } from 'react';
import {
  Typography,
  makeStyles,
} from '@material-ui/core';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import type { ComplianceApi } from '../../api';
import type { ComplianceProfile, DashboardStats, PostureSnapshot, RemediationEvent } from '@ansible/backstage-compliance-common/types';
import type { FilterOption } from '../ResultsViewer/FilterGroup';
import {
  detectEvents,
  buildFilteredSeries,
  formatTrendDate,
  formatTrendDateFull,
  TREND_COLORS,
  PROFILE_PALETTE,
  type TrendDataPoint,
  type MultiProfileRow,
} from './trendUtils';
import { STATUS_COLORS } from '../shared/colors';
import { TrendFilterBar } from './TrendFilterBar';

interface PostureTrendChartProps {
  initialData: PostureSnapshot[];
  remediationEvents?: RemediationEvent[];
  stats: DashboardStats;
  allProfiles?: ComplianceProfile[];
  api: ComplianceApi;
  onPointClick?: (snapshot: PostureSnapshot) => void;
}

const useStyles = makeStyles(theme => ({
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: 160,
    color: theme.palette.text.secondary,
  },
  tooltipBox: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 4,
    padding: theme.spacing(1, 1.5),
    fontSize: '0.8rem',
    lineHeight: 1.5,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  tooltipLabel: {
    fontWeight: 600,
    marginBottom: 2,
  },
  regressionLabel: {
    color: TREND_COLORS.regression,
    fontWeight: 600,
    fontSize: '0.75rem',
  },
  improvementLabel: {
    color: TREND_COLORS.improvement,
    fontWeight: 600,
    fontSize: '0.75rem',
  },
}));

const CustomDot: React.FC<any> = (props) => {
  const { cx, cy, payload } = props;
  if (!cx || !cy) return null;

  if (payload.eventType === 'regression') {
    return (
      <polygon
        points={`${cx},${cy + 7} ${cx - 5.5},${cy - 3} ${cx + 5.5},${cy - 3}`}
        fill={TREND_COLORS.regression}
        stroke="#fff"
        strokeWidth={1}
      />
    );
  }
  if (payload.eventType === 'improvement') {
    return (
      <polygon
        points={`${cx},${cy - 7} ${cx - 5.5},${cy + 3} ${cx + 5.5},${cy + 3}`}
        fill={TREND_COLORS.improvement}
        stroke="#fff"
        strokeWidth={1}
      />
    );
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill="#fff"
      stroke={TREND_COLORS.dot}
      strokeWidth={2}
    />
  );
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TrendDataPoint; value: number; dataKey: string }>;
  classes: ReturnType<typeof useStyles>;
}

function CustomTooltipContent({ active, payload, classes }: CustomTooltipProps) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  const dateStr = typeof point.timestamp === 'number' && isFinite(point.timestamp)
    ? formatTrendDateFull(point.timestamp)
    : 'Unknown date';
  const deltaStr = typeof point.delta === 'number' && isFinite(point.delta)
    ? point.delta.toFixed(1)
    : '0.0';
  return (
    <div className={classes.tooltipBox}>
      <div className={classes.tooltipLabel}>{dateStr}</div>
      {point.workflowJobId && (
        <div style={{ fontSize: '0.75rem', color: STATUS_COLORS.neutral }}>Scan #{point.workflowJobId}</div>
      )}
      <div>Compliance: {point.compliancePct ?? 0}%</div>
      <div>
        {point.passCount ?? 0} pass / {point.failCount ?? 0} fail
      </div>
      {point.eventType === 'regression' && (
        <div className={classes.regressionLabel}>
          Regression: {Number(deltaStr) > 0 ? '+' : ''}{deltaStr}pp
        </div>
      )}
      {point.eventType === 'improvement' && (
        <div className={classes.improvementLabel}>
          Improvement: +{deltaStr}pp
        </div>
      )}
    </div>
  );
}

function computeYDomain(data: Array<Record<string, any>>, seriesIds?: string[]): [number, number] {
  let values: number[];
  if (seriesIds) {
    values = data.flatMap(row =>
      seriesIds.map(sid => (row as any)[sid]).filter((v): v is number => v !== undefined),
    );
  } else {
    values = data.map(d => d.compliancePct!).filter((v): v is number => v !== undefined);
  }
  if (values.length === 0) return [0, 100];
  const min = Math.max(0, Math.floor(Math.min(...values) / 5) * 5 - 5);
  const max = Math.min(100, Math.ceil(Math.max(...values) / 5) * 5 + 5);
  return [min, max];
}

export const PostureTrendChart: React.FC<PostureTrendChartProps> = ({
  initialData,
  remediationEvents: initialRemediationEvents,
  stats,
  allProfiles,
  api,
  onPointClick,
}) => {
  const classes = useStyles();

  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [selectedInventories, setSelectedInventories] = useState<Set<string>>(new Set());
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [remediationEvents, setRemediationEvents] = useState<RemediationEvent[]>(
    initialRemediationEvents ?? [],
  );

  React.useEffect(() => {
    if (!initialRemediationEvents) {
      api.getRemediationEventsForTrend(90).then(setRemediationEvents).catch(() => {});
    }
  }, [api, initialRemediationEvents]);

  const profileMap = useMemo(() => {
    const map = new Map(stats.frameworkScores.map(fw => [fw.profileId, fw.name]));
    const allProfileMap = new Map(allProfiles?.map(p => [p.id, p]) ?? []);
    for (const snap of initialData) {
      if (!map.has(snap.profileId)) {
        const profile = allProfileMap.get(snap.profileId);
        if (profile) {
          const suffix = profile.connectionStatus === 'disconnected' ? ' (disconnected)' : '';
          map.set(snap.profileId, `${profile.displayName}${suffix}`);
        }
      }
    }
    return map;
  }, [stats.frameworkScores, allProfiles, initialData]);

  const inventoryMap = useMemo(() => {
    const map = new Map<string, string>();
    stats.byInventory.forEach(inv => map.set(String(inv.inventoryId), inv.inventoryName));
    return map;
  }, [stats.byInventory]);

  const profileFilterOptions: FilterOption[] = useMemo(() => {
    const options: FilterOption[] = stats.frameworkScores.map((fw, i) => ({
      key: fw.profileId,
      label: fw.name,
      color: PROFILE_PALETTE[i % PROFILE_PALETTE.length],
    }));
    const knownIds = new Set(options.map(o => o.key));
    for (const [pid, name] of profileMap) {
      if (!knownIds.has(pid)) {
        options.push({
          key: pid,
          label: name,
          color: PROFILE_PALETTE[options.length % PROFILE_PALETTE.length],
        });
      }
    }
    return options;
  }, [stats.frameworkScores, profileMap]);

  const inventoryFilterOptions: FilterOption[] = useMemo(
    () => stats.byInventory.map(inv => ({
      key: String(inv.inventoryId),
      label: inv.inventoryName,
      color: STATUS_COLORS.info,
    })),
    [stats.byInventory],
  );

  const handleToggleProfile = useCallback((profileId: string) => {
    setSelectedProfiles(prev => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }, []);

  const handleToggleInventory = useCallback((inventoryId: string) => {
    setSelectedInventories(prev => {
      const next = new Set(prev);
      if (next.has(inventoryId)) next.delete(inventoryId);
      else next.add(inventoryId);
      return next;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedProfiles(new Set());
    setSelectedInventories(new Set());
  }, []);

  const handleToggleGroup = useCallback((group: string) => {
    setExpandedGroup(prev => (prev === group ? null : group));
  }, []);

  const filteredData = useMemo(() => {
    let filtered = initialData;
    if (selectedProfiles.size > 0) {
      filtered = filtered.filter(s => selectedProfiles.has(s.profileId));
    }
    if (selectedInventories.size > 0) {
      filtered = filtered.filter(
        s => s.inventoryId !== undefined && selectedInventories.has(String(s.inventoryId)),
      );
    }
    return filtered;
  }, [initialData, selectedProfiles, selectedInventories]);

  const groupByInventory = selectedInventories.size > 0;

  const isSingleLine = useMemo(() => {
    const effectiveProfileCount = selectedProfiles.size || profileMap.size;
    return effectiveProfileCount === 1 && selectedInventories.size <= 1;
  }, [selectedProfiles, selectedInventories, profileMap]);

  const filteredRemediationEvents = useMemo(() => {
    if (selectedProfiles.size === 0 && selectedInventories.size === 0) return remediationEvents;
    let filtered = remediationEvents;
    if (selectedInventories.size > 0) {
      filtered = filtered.filter(
        evt => selectedInventories.has(String(evt.inventoryId)),
      );
    }
    if (isSingleLine && selectedProfiles.size > 0) {
      filtered = filtered.filter(
        evt => filteredData.some(s => s.inventoryId === evt.inventoryId),
      );
    }
    return filtered;
  }, [remediationEvents, selectedProfiles, selectedInventories, isSingleLine, filteredData]);

  const seriesMap = useMemo(() => {
    const map = new Map<string, string>();
    if (groupByInventory) {
      for (const snap of filteredData) {
        const key = `${snap.profileId}:${snap.inventoryId ?? 0}`;
        if (!map.has(key)) {
          const pName = profileMap.get(snap.profileId) ?? snap.profileId;
          const iName = inventoryMap.get(String(snap.inventoryId)) ?? `Inventory ${snap.inventoryId}`;
          map.set(key, `${pName} — ${iName}`);
        }
      }
    } else {
      const activeProfiles = selectedProfiles.size > 0
        ? [...selectedProfiles]
        : [...profileMap.keys()];
      activeProfiles.forEach(pid => {
        const name = profileMap.get(pid);
        if (name) map.set(pid, name);
      });
    }
    return map;
  }, [filteredData, groupByInventory, selectedProfiles, profileMap, inventoryMap]);

  const disconnectedProfileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of allProfiles ?? []) {
      if (p.connectionStatus === 'disconnected') ids.add(p.id);
    }
    return ids;
  }, [allProfiles]);

  const stoppedSeriesIds = useMemo(() => {
    const stopped = new Set<string>();
    for (const sid of seriesMap.keys()) {
      const pid = sid.includes(':') ? sid.split(':')[0] : sid;
      if (disconnectedProfileIds.has(pid)) stopped.add(sid);
    }
    return stopped;
  }, [seriesMap, disconnectedProfileIds]);

  const multiSeries = useMemo(() => {
    if (isSingleLine) return null;
    return buildFilteredSeries(filteredData, seriesMap, groupByInventory, stoppedSeriesIds);
  }, [isSingleLine, filteredData, seriesMap, groupByInventory, stoppedSeriesIds]);

  const singleLineData = useMemo(() => {
    if (!isSingleLine) return [];
    return detectEvents(filteredData);
  }, [isSingleLine, filteredData]);

  const handleDotClick = useCallback(
    (point: TrendDataPoint) => {
      if (!onPointClick) return;
      if (!point.scanId && !point.workflowJobId) return;
      const snap = filteredData.find(s => s.scanId === point.scanId);
      if (snap) onPointClick(snap);
    },
    [filteredData, onPointClick],
  );

  const hasData = isSingleLine
    ? singleLineData.length >= 2
    : (multiSeries?.data.length ?? 0) >= 2;

  return (
    <div>
      <TrendFilterBar
        profileOptions={profileFilterOptions}
        inventoryOptions={inventoryFilterOptions}
        selectedProfiles={selectedProfiles}
        selectedInventories={selectedInventories}
        expandedGroup={expandedGroup}
        onToggleGroup={handleToggleGroup}
        onToggleProfile={handleToggleProfile}
        onToggleInventory={handleToggleInventory}
        onClearAll={handleClearAll}
      />

      {!hasData ? (
        <div className={classes.empty}>
          <TrendingUpIcon style={{ fontSize: 48, opacity: 0.3, marginBottom: 8 }} />
          <Typography variant="body2">
            {filteredData.length === 0 && (selectedProfiles.size > 0 || selectedInventories.size > 0)
              ? 'No data matches the selected filters'
              : 'Run more scans to see compliance trends'}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            At least two completed scans are needed to display a trend line
          </Typography>
        </div>
      ) : isSingleLine ? (
        <SingleLineChart
          data={singleLineData}
          remediationEvents={filteredRemediationEvents}
          onDotClick={handleDotClick}
          classes={classes}
        />
      ) : multiSeries ? (
        <MultiLineChart
          data={multiSeries.data}
          seriesIds={multiSeries.seriesIds}
          seriesMap={seriesMap}
        />
      ) : null}
    </div>
  );
};

const MultiLineChart = React.memo(({
  data,
  seriesIds,
  seriesMap,
}: {
  data: MultiProfileRow[];
  seriesIds: string[];
  seriesMap: Map<string, string>;
}) => {
  const [min, max] = React.useMemo(() => computeYDomain(data, seriesIds), [data, seriesIds]);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 40 }}>
        <CartesianGrid strokeDasharray="4 3" stroke={TREND_COLORS.grid} />
        <XAxis
          dataKey="timestamp"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={formatTrendDate}
          stroke={TREND_COLORS.axis}
          fontSize={11}
          fontFamily='"Red Hat Text", sans-serif'
        />
        <YAxis
          domain={[min, max]}
          allowDataOverflow
          tickFormatter={(v: number) => `${v}%`}
          stroke={TREND_COLORS.axis}
          fontSize={11}
          fontFamily='"Red Hat Text", sans-serif'
        />
        <RechartsTooltip
          labelFormatter={(ts: number) => formatTrendDateFull(ts)}
          formatter={(value: number, name: string) => [`${value}%`, seriesMap.get(name) ?? name]}
        />
        <Legend
          formatter={(value: string) => seriesMap.get(value) ?? value}
          iconType="plainline"
        />
        {seriesIds.map((sid, i) => (
          <Line
            key={sid}
            type="monotone"
            dataKey={sid}
            stroke={PROFILE_PALETTE[i % PROFILE_PALETTE.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});
MultiLineChart.displayName = 'MultiLineChart';

function SingleLineChart({
  data,
  remediationEvents,
  onDotClick,
  classes,
}: {
  data: TrendDataPoint[];
  remediationEvents: RemediationEvent[];
  onDotClick: (point: TrendDataPoint) => void;
  classes: any;
}) {
  const [min, max] = computeYDomain(data);
  const chartDomain = data.length >= 2
    ? [data[0].timestamp, data[data.length - 1].timestamp]
    : ['dataMin', 'dataMax'];

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 40 }}>
        <CartesianGrid strokeDasharray="4 3" stroke={TREND_COLORS.grid} />
        <XAxis
          dataKey="timestamp"
          type="number"
          domain={chartDomain as any}
          tickFormatter={formatTrendDate}
          stroke={TREND_COLORS.axis}
          fontSize={11}
          fontFamily='"Red Hat Text", sans-serif'
        />
        <YAxis
          domain={[min, max]}
          allowDataOverflow
          tickFormatter={(v: number) => `${v}%`}
          stroke={TREND_COLORS.axis}
          fontSize={11}
          fontFamily='"Red Hat Text", sans-serif'
        />
        <RechartsTooltip content={<CustomTooltipContent classes={classes} />} />

        {remediationEvents.map(evt => (
          <ReferenceLine
            key={evt.id}
            x={new Date(evt.completedAt).getTime()}
            stroke={TREND_COLORS.remediationLine}
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: `${evt.rulesApplied ?? '?'} rules`,
              position: 'insideTopRight',
              fontSize: 10,
              fill: TREND_COLORS.remediationLine,
            }}
          />
        ))}

        <Line
          type="monotone"
          dataKey="compliancePct"
          stroke={TREND_COLORS.line}
          strokeWidth={2.5}
          dot={<CustomDot />}
          activeDot={{
            r: 6,
            stroke: TREND_COLORS.line,
            strokeWidth: 2,
            fill: '#fff',
            cursor: 'pointer',
            onClick: (_: any, entry: any) => {
              if (entry?.payload) onDotClick(entry.payload);
            },
          }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
