import React from 'react';
import { Typography, Chip, makeStyles } from '@material-ui/core';
import type { HostPosture } from '@ansible/backstage-compliance-common/types';
import { isOutlier, getChipStyle, findSectionGaps } from './hostUtils';
import { STATUS_COLORS, THRESHOLDS } from '../shared/colors';
import type { ResolvedDisplayConfig } from '../ResultsViewer/hooks/useDisplayConfig';

const useStyles = makeStyles(theme => ({
  section: { marginBottom: theme.spacing(2) },
  sectionLabel: {
    display: 'flex', alignItems: 'center', gap: theme.spacing(1), marginBottom: theme.spacing(1),
  },
  grid: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  chip: {
    minWidth: 120, height: 48, borderRadius: 6, borderWidth: 2, cursor: 'pointer',
    transition: 'box-shadow 0.15s ease, transform 0.1s ease',
    '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transform: 'translateY(-1px)' },
  },
  chipLabel: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    lineHeight: 1.3, padding: '2px 4px',
  },
  hostname: { fontSize: '0.75rem', fontWeight: 600 },
  score: { fontSize: '0.7rem', fontWeight: 400 },
}));

interface ChipMatrixProps {
  hosts: HostPosture[];
  allHosts: HostPosture[];
  onHostClick: (host: HostPosture) => void;
  displayConfig?: ResolvedDisplayConfig;
}

export const ChipMatrix: React.FC<ChipMatrixProps> = ({ hosts, allHosts, onHostClick, displayConfig }) => {
  const classes = useStyles();
  const catILabel = displayConfig?.severityLabel('CAT_I') ?? 'CAT I';
  const outliers = hosts.filter(h => isOutlier(h, allHosts)).sort((a, b) => a.compliancePct - b.compliancePct);
  const nonCompliant = hosts.filter(h => !isOutlier(h, allHosts) && h.compliancePct < THRESHOLDS.good).sort((a, b) => a.compliancePct - b.compliancePct);
  const yellow = hosts.filter(h => !isOutlier(h, allHosts) && h.compliancePct >= THRESHOLDS.good && h.catIFail > 0).sort((a, b) => a.compliancePct - b.compliancePct);
  const green = hosts.filter(h => !isOutlier(h, allHosts) && h.compliancePct >= THRESHOLDS.good && h.catIFail === 0).sort((a, b) => a.compliancePct - b.compliancePct);

  const renderChips = (chipHosts: HostPosture[]) =>
    chipHosts.map(host => {
      const style = getChipStyle(host, allHosts);
      return (
        <Chip key={host.hostname} className={classes.chip} variant="outlined"
          onClick={() => onHostClick(host)}
          style={{ borderColor: style.borderColor, backgroundColor: style.backgroundColor }}
          label={
            <div className={classes.chipLabel}>
              <span className={classes.hostname} style={{ color: style.color }}>{host.hostname}</span>
              <span className={classes.score} style={{ color: style.color }}>
                {host.compliancePct}% · {host.failCount} fail
              </span>
            </div>
          }
        />
      );
    });

  const renderSection = (label: string, color: string, sectionHosts: HostPosture[]) => {
    if (sectionHosts.length === 0) return null;
    const gaps = findSectionGaps(sectionHosts);

    if (gaps.length === 0) {
      return (
        <div className={classes.section}>
          <div className={classes.sectionLabel}>
            <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
            <Typography variant="caption" style={{ fontWeight: 600, color }}>
              {label} ({sectionHosts.length})
            </Typography>
          </div>
          <div className={classes.grid}>{renderChips(sectionHosts)}</div>
        </div>
      );
    }

    const blocks: HostPosture[][] = [];
    let start = 0;
    for (const gapIdx of gaps) {
      blocks.push(sectionHosts.slice(start, gapIdx));
      start = gapIdx;
    }
    blocks.push(sectionHosts.slice(start));

    return (
      <div className={classes.section}>
        <div className={classes.sectionLabel}>
          <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
          <Typography variant="caption" style={{ fontWeight: 600, color }}>
            {label} ({sectionHosts.length})
          </Typography>
        </div>
        {blocks.map((block, idx) => {
          const minPct = block[0].compliancePct;
          const maxPct = block[block.length - 1].compliancePct;
          const range = minPct === maxPct ? `${minPct}%` : `${minPct}–${maxPct}%`;
          return (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <div style={{ width: '100%', borderTop: `1px dashed ${color}`, opacity: 0.35, margin: '6px 0' }} />
              )}
              <Typography variant="caption" style={{ fontSize: '0.7rem', marginBottom: 4, display: 'block', color, opacity: 0.75 }}>
                {range} · {block.length} host{block.length !== 1 ? 's' : ''}
              </Typography>
              <div className={classes.grid}>{renderChips(block)}</div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        {hosts.length} hosts · {outliers.length} outlier{outliers.length !== 1 ? 's' : ''}
        {nonCompliant.length > 0 ? ` · ${nonCompliant.length} non-compliant` : ''}
        {yellow.length > 0 ? ` · ${yellow.length} with ${catILabel}` : ''}
        {` · ${green.length} compliant`}
      </Typography>
      {renderSection('Outliers', STATUS_COLORS.error, outliers)}
      {renderSection('Non-Compliant', STATUS_COLORS.error, nonCompliant)}
      {renderSection(`${catILabel} Findings`, STATUS_COLORS.warning, yellow)}
      {renderSection('Compliant', STATUS_COLORS.success, green)}
    </div>
  );
};
