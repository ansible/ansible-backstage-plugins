import { InfoCard } from '@backstage/core-components';
import { Typography, Tooltip, makeStyles } from '@material-ui/core';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import TrendingDownIcon from '@material-ui/icons/TrendingDown';
import RemoveIcon from '@material-ui/icons/Remove';
import { ComplianceGauge } from '../ComplianceDashboard/ComplianceGauge';
import { scoreColor, STATUS_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  comparisonHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(4),
    padding: theme.spacing(3),
  },
  comparisonArrow: {
    display: 'flex',
    alignItems: 'center',
    color: theme.palette.text.secondary,
    fontSize: '2rem',
  },
  comparisonGauge: {
    textAlign: 'center' as const,
    minWidth: 140,
  },
  deltaStats: {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing(4),
    padding: theme.spacing(1, 3, 2, 3),
    flexWrap: 'wrap' as const,
  },
  deltaStat: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    fontSize: '0.9rem',
  },
  clickableStat: {
    cursor: 'pointer',
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.25, 0.75),
    margin: theme.spacing(-0.25, -0.75),
    transition: 'background-color 0.15s',
    '&:hover': { backgroundColor: theme.palette.action.hover },
  },
  deltaPositive: {
    color: STATUS_COLORS.success,
    fontWeight: 600,
  },
  deltaNegative: {
    color: STATUS_COLORS.error,
    fontWeight: 600,
  },
  deltaUnchanged: {
    color: theme.palette.text.secondary,
    fontWeight: 500,
  },
}));

interface VerificationComparisonProps {
  previousPassRate: number;
  overallPassRate: number;
  totalHosts: number;
  totalRules: number;
  comparisonStats: { improved: number; regressed: number; unchanged: number };
  title?: string;
  beforeScanLabel?: string;
  afterScanLabel?: string;
  onBeforeScanClick?: () => void;
  onAfterScanClick?: () => void;
  beforeBaselineRate?: number;
  afterBaselineRate?: number;
  beforeStandardRate?: number;
  afterStandardRate?: number;
  isBaselineView?: boolean;
  activeComparison?: string;
  onStatClick?: (stat: 'improved' | 'regressed' | 'unchanged' | 'all') => void;
}

export const VerificationComparison = ({
  previousPassRate,
  overallPassRate,
  totalHosts,
  totalRules,
  comparisonStats,
  title,
  beforeScanLabel,
  afterScanLabel,
  onBeforeScanClick,
  onAfterScanClick,
  beforeBaselineRate,
  afterBaselineRate,
  beforeStandardRate,
  afterStandardRate,
  isBaselineView,
  activeComparison,
  onStatClick,
}: VerificationComparisonProps) => {
  const classes = useStyles();

  return (
    <InfoCard title={title || 'Verification Results'}>
      <div className={classes.comparisonHeader}>
        <div className={classes.comparisonGauge}>
          <ComplianceGauge value={previousPassRate} label="Before" />
          {beforeScanLabel && (
            <Typography
              variant="caption"
              color={onBeforeScanClick ? 'primary' : 'textSecondary'}
              style={
                onBeforeScanClick
                  ? { cursor: 'pointer', textDecoration: 'underline' }
                  : undefined
              }
              onClick={onBeforeScanClick}
            >
              {beforeScanLabel}
            </Typography>
          )}
          {beforeBaselineRate !== undefined && (
            <Typography
              variant="caption"
              style={{
                display: 'block',
                marginTop: 2,
                fontWeight: 600,
                color: scoreColor(
                  isBaselineView
                    ? beforeStandardRate ?? previousPassRate
                    : beforeBaselineRate,
                ),
              }}
            >
              {isBaselineView
                ? `Standard: ${beforeStandardRate ?? previousPassRate}%`
                : `Baseline: ${beforeBaselineRate}%`}
            </Typography>
          )}
        </div>
        <div className={classes.comparisonArrow}>
          <ArrowForwardIcon fontSize="large" />
        </div>
        <div className={classes.comparisonGauge}>
          <ComplianceGauge value={overallPassRate} label="After" />
          {afterScanLabel && (
            <Typography
              variant="caption"
              color={onAfterScanClick ? 'primary' : 'textSecondary'}
              style={
                onAfterScanClick
                  ? { cursor: 'pointer', textDecoration: 'underline' }
                  : undefined
              }
              onClick={onAfterScanClick}
            >
              {afterScanLabel}
            </Typography>
          )}
          {afterBaselineRate !== undefined && (
            <Typography
              variant="caption"
              style={{
                display: 'block',
                marginTop: 2,
                fontWeight: 600,
                color: scoreColor(
                  isBaselineView
                    ? afterStandardRate ?? overallPassRate
                    : afterBaselineRate,
                ),
              }}
            >
              {isBaselineView
                ? `Standard: ${afterStandardRate ?? overallPassRate}%`
                : `Baseline: ${afterBaselineRate}%`}
            </Typography>
          )}
        </div>
      </div>
      <div className={classes.deltaStats}>
        <div className={classes.deltaStat}>
          <Typography variant="body2" color="textSecondary">
            Hosts Scanned:
          </Typography>
          <Typography variant="body2" style={{ fontWeight: 600 }}>
            {totalHosts}
          </Typography>
        </div>
        <div className={classes.deltaStat}>
          <Typography variant="body2" color="textSecondary">
            Rules:
          </Typography>
          <Typography variant="body2" style={{ fontWeight: 600 }}>
            {totalRules}
          </Typography>
        </div>
        <Tooltip
          title="Click to filter: rules where all hosts changed from failing to passing"
          arrow
        >
          <div
            className={`${classes.deltaStat} ${
              onStatClick ? classes.clickableStat : ''
            }`}
            role="button"
            tabIndex={0}
            onClick={() =>
              onStatClick?.(
                activeComparison === 'improved' ? 'all' : 'improved',
              )
            }
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ')
                onStatClick?.(
                  activeComparison === 'improved' ? 'all' : 'improved',
                );
            }}
            style={
              activeComparison === 'improved'
                ? { backgroundColor: 'rgba(62,134,53,0.1)' }
                : undefined
            }
          >
            <TrendingUpIcon
              fontSize="small"
              style={{ color: STATUS_COLORS.success }}
            />
            <Typography variant="body2" className={classes.deltaPositive}>
              {comparisonStats.improved} Rules Improved
            </Typography>
          </div>
        </Tooltip>
        {comparisonStats.regressed > 0 && (
          <Tooltip
            title="Click to filter: rules that were passing but now have failures"
            arrow
          >
            <div
              className={`${classes.deltaStat} ${
                onStatClick ? classes.clickableStat : ''
              }`}
              role="button"
              tabIndex={0}
              onClick={() =>
                onStatClick?.(
                  activeComparison === 'regressed' ? 'all' : 'regressed',
                )
              }
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ')
                  onStatClick?.(
                    activeComparison === 'regressed' ? 'all' : 'regressed',
                  );
              }}
              style={
                activeComparison === 'regressed'
                  ? { backgroundColor: 'rgba(201,25,11,0.1)' }
                  : undefined
              }
            >
              <TrendingDownIcon
                fontSize="small"
                style={{ color: STATUS_COLORS.error }}
              />
              <Typography variant="body2" className={classes.deltaNegative}>
                {comparisonStats.regressed} Rules Regressed
              </Typography>
            </div>
          </Tooltip>
        )}
        <Tooltip
          title="Click to filter: rules with no change between scans"
          arrow
        >
          <div
            className={`${classes.deltaStat} ${
              onStatClick ? classes.clickableStat : ''
            }`}
            role="button"
            tabIndex={0}
            onClick={() =>
              onStatClick?.(
                activeComparison === 'unchanged' ? 'all' : 'unchanged',
              )
            }
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ')
                onStatClick?.(
                  activeComparison === 'unchanged' ? 'all' : 'unchanged',
                );
            }}
            style={
              activeComparison === 'unchanged'
                ? { backgroundColor: 'rgba(106,110,115,0.1)' }
                : undefined
            }
          >
            <RemoveIcon
              fontSize="small"
              style={{ color: STATUS_COLORS.neutral }}
            />
            <Typography variant="body2" className={classes.deltaUnchanged}>
              {comparisonStats.unchanged} Rules Unchanged
            </Typography>
          </div>
        </Tooltip>
      </div>
    </InfoCard>
  );
};
