import { Card, CardContent, Typography } from '@material-ui/core';
import type { TrendPoint } from '../types/api';

interface TrendChartProps {
  data: TrendPoint[];
  title?: string;
}

export const TrendChart = ({
  data,
  title = 'Violation Trend',
}: TrendChartProps) => {
  if (data.length < 2) return null;

  const sorted = [...data].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const yMax = Math.max(
    ...sorted.map(d => d.total_violations),
    ...sorted.map(d => d.fixable),
    1,
  );
  const width = 600;
  const height = 200;
  const padX = 40;
  const padY = 24;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const toX = (i: number) => padX + (i / (sorted.length - 1)) * chartW;
  const toY = (v: number) => padY + chartH - (v / yMax) * chartH;

  const violationLine = sorted
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(d.total_violations)}`)
    .join(' ');
  const fixableLine = sorted
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(d.fixable)}`)
    .join(' ');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(frac => ({
    val: Math.round(yMax * (1 - frac)),
    y: padY + frac * chartH,
  }));

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', maxHeight: 220 }}
        >
          {gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={padX}
                y1={g.y}
                x2={width - padX}
                y2={g.y}
                stroke="#e0e0e0"
                strokeWidth={0.5}
              />
              <text
                x={padX - 6}
                y={g.y + 4}
                textAnchor="end"
                fontSize={10}
                fill="currentColor"
                opacity={0.5}
              >
                {g.val}
              </text>
            </g>
          ))}
          <path
            d={violationLine}
            fill="none"
            stroke="#c9190b"
            strokeWidth={2}
          />
          <path
            d={fixableLine}
            fill="none"
            stroke="#3e8635"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          {sorted.map((d, i) => (
            <g key={d.scan_id}>
              <circle
                cx={toX(i)}
                cy={toY(d.total_violations)}
                r={3}
                fill="#c9190b"
              />
              <circle cx={toX(i)} cy={toY(d.fixable)} r={2.5} fill="#3e8635" />
            </g>
          ))}
          <text
            x={width - padX}
            y={height - 4}
            textAnchor="end"
            fontSize={10}
            fill="currentColor"
            opacity={0.5}
          >
            {sorted.length} scans
          </text>
        </svg>
        <div
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 12,
            opacity: 0.7,
            marginTop: 4,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 12,
                height: 2,
                background: '#c9190b',
                display: 'inline-block',
              }}
            />{' '}
            Violations
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 12,
                height: 2,
                background: '#3e8635',
                display: 'inline-block',
                borderTop: '1px dashed',
              }}
            />{' '}
            Fixable
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
