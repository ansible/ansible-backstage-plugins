import { InfoCard } from '@backstage/core-components';
import { Typography, makeStyles } from '@material-ui/core';
import { scoreColor, STATUS_COLORS } from '../shared/colors';
import type { ResolvedDisplayConfig } from './hooks/useDisplayConfig';

const useStyles = makeStyles(theme => ({
  summarySection: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  summaryCard: {
    flex: '1 1 200px',
    textAlign: 'center',
    padding: theme.spacing(2),
  },
  summaryValue: {
    fontSize: '2rem',
    fontWeight: 700,
  },
  summaryLabel: {
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
  },
}));

interface SummaryCardsProps {
  overallPassRate: number;
  totalHosts: number;
  totalRules: number;
  rulesWithFailures: number;
  baselineRate?: number;
  standardRate?: number;
  isBaselineView?: boolean;
  displayConfig?: ResolvedDisplayConfig;
}

const getColor = scoreColor;

export const SummaryCards = ({
  overallPassRate,
  totalHosts,
  totalRules,
  rulesWithFailures,
  baselineRate,
  standardRate,
  isBaselineView,
  displayConfig,
}: SummaryCardsProps) => {
  const classes = useStyles();

  const displayRate = isBaselineView && baselineRate !== undefined ? baselineRate : overallPassRate;

  return (
    <div className={classes.summarySection}>
      <InfoCard>
        <div className={classes.summaryCard}>
          <Typography className={classes.summaryValue} style={{ color: getColor(displayRate) }}>
            {displayRate}%
          </Typography>
          <Typography className={classes.summaryLabel} style={{ textTransform: 'capitalize' }}>
            {isBaselineView ? `Baseline ${displayConfig?.gaugeLabel ?? 'compliance'}` : `Overall ${displayConfig?.gaugeLabel ?? 'compliance'}`}
          </Typography>
          {baselineRate !== undefined && (
            <Typography variant="caption" style={{ display: 'block', marginTop: 4, fontWeight: 600, color: getColor(isBaselineView ? (standardRate ?? overallPassRate) : baselineRate!) }}>
              {isBaselineView ? `Standard: ${standardRate ?? overallPassRate}%` : `Baseline: ${baselineRate}%`}
            </Typography>
          )}
        </div>
      </InfoCard>
      <InfoCard>
        <div className={classes.summaryCard}>
          <Typography className={classes.summaryValue}>{totalHosts}</Typography>
          <Typography className={classes.summaryLabel}>Hosts Scanned</Typography>
        </div>
      </InfoCard>
      <InfoCard>
        <div className={classes.summaryCard}>
          <Typography className={classes.summaryValue}>{totalRules}</Typography>
          <Typography className={classes.summaryLabel} style={{ textTransform: 'capitalize' }}>
            {displayConfig?.gaugeUnit ?? 'Rules'} Evaluated
          </Typography>
        </div>
      </InfoCard>
      <InfoCard>
        <div className={classes.summaryCard}>
          <Typography className={classes.summaryValue} style={{ color: STATUS_COLORS.error }}>
            {rulesWithFailures}
          </Typography>
          <Typography className={classes.summaryLabel} style={{ textTransform: 'capitalize' }}>
            {displayConfig?.gaugeUnit ?? 'Rules'} with Failures
          </Typography>
        </div>
      </InfoCard>
    </div>
  );
};
