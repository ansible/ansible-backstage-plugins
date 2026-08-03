import React, { useCallback } from 'react';
import { makeStyles } from '@material-ui/core';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ReferenceArea,
  Customized,
} from 'recharts';
import type { HostPosture } from '@ansible/backstage-compliance-common/types';
import { hostColor, type Cluster } from './hostUtils';
import { STATUS_COLORS } from '../shared/colors';
import type { ResolvedDisplayConfig } from '../ResultsViewer/hooks/useDisplayConfig';

const useStyles = makeStyles(theme => ({
  hint: {
    textAlign: 'center' as const,
    marginTop: theme.spacing(1),
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
  },
}));

function seededRand(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function ClusterLabels({ clusters, xAxisMap, yAxisMap, onClusterClick }: any) {
  const xAxis = xAxisMap?.[0] ?? xAxisMap?.xAxis_0;
  const yAxis = yAxisMap?.[0] ?? yAxisMap?.yAxis_0;
  if (!xAxis || !yAxis) return null;
  return (
    <g>
      {clusters.map((c: Cluster) => {
        const x1 = xAxis.scale(Math.max(xAxis.domain[0], c.min - 1.5));
        const x2 = xAxis.scale(Math.min(xAxis.domain[1], c.max + 1.5));
        if (x1 == null || x2 == null) return null;
        const cx = (x1 + x2) / 2;
        const labelY = 12;
        const color = c.isOutlier ? STATUS_COLORS.error : STATUS_COLORS.success;
        const label = `${c.hosts.length} hosts · ${c.min.toFixed(0)}–${c.max.toFixed(0)}%`;
        return (
          <g key={c.id} onClick={() => onClusterClick(c)} style={{ cursor: 'pointer' }}>
            <rect x={cx - 60} y={labelY - 9} width={120} height={16} rx={3}
              fill={c.isOutlier ? 'rgba(201,25,11,0.08)' : 'rgba(62,134,53,0.08)'}
              stroke={color} strokeWidth={1} strokeOpacity={0.4}
            />
            <text x={cx} y={labelY + 2} textAnchor="middle" fontSize={9}
              fontFamily='"Red Hat Text", sans-serif' fontWeight={600} fill={color}
              style={{ cursor: 'pointer' }}
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

interface StripPlotProps {
  hosts: HostPosture[];
  allHosts: HostPosture[];
  clusters: Cluster[];
  onClusterClick: (cluster: Cluster) => void;
  onDotClick: (host: HostPosture) => void;
  height?: number;
  displayConfig?: ResolvedDisplayConfig;
}

export const StripPlot: React.FC<StripPlotProps> = ({
  hosts, allHosts, clusters, onClusterClick, onDotClick, height, displayConfig,
}) => {
  const classes = useStyles();
  const rand = seededRand(99);
  const scatterData = hosts.map(h => ({ x: h.compliancePct, y: 0.15 + rand() * 0.7, host: h }));
  const mean = hosts.reduce((a, h) => a + h.compliancePct, 0) / hosts.length;
  const xMin = Math.max(0, Math.floor(Math.min(...hosts.map(h => h.compliancePct)) / 5) * 5 - 5);
  const xMax = Math.min(100, Math.ceil(Math.max(...hosts.map(h => h.compliancePct)) / 5) * 5 + 5);

  const handleDotClick = useCallback((data: any) => {
    if (data?.host) onDotClick(data.host);
  }, [onDotClick]);

  const dotShape: any = (props: any) => {
    const { cx, cy, payload } = props;
    const color = hostColor(payload.host, allHosts);
    return <circle cx={cx || 0} cy={cy || 0} r={5} fill={color} stroke="#fff" strokeWidth={1.5} style={{ cursor: 'pointer' }} />;
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={height || 180}>
        <ScatterChart margin={{ top: 24, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="4 3" stroke="#e0e0e0" horizontal={false} />
          <XAxis dataKey="x" type="number" domain={[xMin, xMax]}
            tickFormatter={(v: number) => `${v}%`}
            stroke={STATUS_COLORS.neutral} fontSize={11} fontFamily='"Red Hat Text", sans-serif'
          />
          <YAxis dataKey="y" type="number" domain={[0, 1]} hide />
          <RechartsTooltip content={({ payload }: any) => {
            if (!payload?.[0]) return null;
            const d = payload[0].payload;
            return (
              <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: '6px 10px', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                <div style={{ fontWeight: 600 }}>{d.host.hostname}</div>
                <div>{d.host.compliancePct}% · {d.host.failCount} failing</div>
                {d.host.catIFail > 0 && <div style={{ color: STATUS_COLORS.error }}>{d.host.catIFail} {displayConfig?.severityLabel('CAT_I') ?? 'CAT I'}</div>}
                {d.host.os && <div style={{ color: STATUS_COLORS.neutral, fontSize: '0.7rem' }}>{d.host.os}</div>}
              </div>
            );
          }} />
          <ReferenceLine x={mean} stroke={STATUS_COLORS.info} strokeDasharray="6 3" strokeWidth={1.5} />
          {clusters.map(c => (
            <ReferenceArea key={c.id}
              x1={Math.max(xMin, c.min - 1.5)} x2={Math.min(xMax, c.max + 1.5)} y1={0} y2={1}
              fill={c.isOutlier ? 'rgba(201,25,11,0.06)' : 'rgba(62,134,53,0.04)'}
              stroke={c.isOutlier ? STATUS_COLORS.error : STATUS_COLORS.success} strokeDasharray="4 2" strokeOpacity={0.3}
            />
          ))}
          <Scatter data={scatterData} isAnimationActive={false} cursor="pointer" onClick={handleDotClick} shape={dotShape} />
          <Customized component={(props: any) => (
            <ClusterLabels {...props} clusters={clusters} onClusterClick={onClusterClick} />
          )} />
        </ScatterChart>
      </ResponsiveContainer>
      <div className={classes.hint}>
        <span style={{ color: STATUS_COLORS.info, fontWeight: 600 }}>Mean: {mean.toFixed(1)}%</span>
        {' · '}Click a dot for host details · Click a cluster label to zoom in · {clusters.length} cluster{clusters.length !== 1 ? 's' : ''} detected
      </div>
    </div>
  );
};
