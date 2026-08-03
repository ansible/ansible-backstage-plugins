import React from 'react';
import { Typography, ButtonBase, makeStyles } from '@material-ui/core';
import { scoreColor, STATUS_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: theme.spacing(1, 0),
    width: '100%',
  },
  clickable: {
    borderRadius: theme.shape.borderRadius,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    '&:hover': {
      transform: 'scale(1.04)',
      boxShadow: theme.shadows[2],
    },
  },
  label: {
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
    fontWeight: 500,
    maxWidth: 140,
    textAlign: 'center' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  subtitle: {
    color: theme.palette.text.secondary,
    fontSize: '0.7rem',
    marginTop: 2,
  },
}));

interface ComplianceGaugeProps {
  value: number;
  label?: string;
  subtitle?: string;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  clickable?: boolean;
  dimmed?: boolean;
}

export const getColor = scoreColor;

export const ComplianceGauge: React.FC<ComplianceGaugeProps> = ({
  value,
  label,
  subtitle,
  onClick,
  clickable: isClickable,
  dimmed,
}) => {
  const classes = useStyles();

  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const degToRad = (d: number) => (d * Math.PI) / 180;
  const pointOnCircle = (angleDeg: number) => ({
    x: cx + radius * Math.sin(degToRad(angleDeg)),
    y: cy - radius * Math.cos(degToRad(angleDeg)),
  });

  const arcStartDeg = 240;
  const arcEndDeg = 120 + 360;
  const totalSweepDeg = arcEndDeg - arcStartDeg;

  const clampedValue = Math.min(Math.max(value, 0), 100);
  const valueSweepDeg = (totalSweepDeg * clampedValue) / 100;
  const valueEndDeg = arcStartDeg + valueSweepDeg;

  const makeSvgArc = (fromDeg: number, toDeg: number) => {
    const startPt = pointOnCircle(fromDeg % 360);
    const endPt = pointOnCircle(toDeg % 360);
    const sweep = toDeg - fromDeg;
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`;
  };

  const color = getColor(value);
  const gapTopY = pointOnCircle(arcStartDeg).y;
  const svgHeight = gapTopY + strokeWidth / 2 + 2;

  const content = (
    <div className={`${classes.container} ${isClickable ? classes.clickable : ''}`}>
      <svg
        viewBox={`0 0 ${size} ${svgHeight}`}
        style={{ width: '100%', maxWidth: size, height: 'auto', opacity: dimmed ? 0.4 : 1 }}
      >
        <path d={makeSvgArc(arcStartDeg, arcEndDeg)} fill="none" stroke="#e0e0e0" strokeWidth={strokeWidth} strokeLinecap="round" />
        {clampedValue > 0.5 && (
          <path d={makeSvgArc(arcStartDeg, valueEndDeg)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="central" fill={dimmed ? STATUS_COLORS.neutral : color} fontSize="28" fontWeight={700} fontFamily='"Red Hat Text", "Red Hat Display", sans-serif'>
          {dimmed ? '--' : `${Math.round(value)}%`}
        </text>
      </svg>
      {label && (
        <Typography className={classes.label} title={label}>{label}</Typography>
      )}
      {subtitle && (
        <Typography className={classes.subtitle}>{subtitle}</Typography>
      )}
    </div>
  );

  if (onClick && isClickable) {
    return (
      <ButtonBase onClick={onClick} style={{ borderRadius: 8 }} focusRipple>
        {content}
      </ButtonBase>
    );
  }

  return content;
};
