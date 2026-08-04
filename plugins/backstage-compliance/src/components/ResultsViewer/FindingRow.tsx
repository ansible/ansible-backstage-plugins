import { Fragment } from 'react';
import {
  Typography,
  Chip,
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  LinearProgress,
  IconButton,
  Collapse,
  Tooltip,
  makeStyles,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import RemoveCircleOutlineIcon from '@material-ui/icons/RemoveCircleOutline';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import type {
  FindingSeverity,
  FindingState,
  MultiHostFinding,
} from '@ansible/backstage-compliance-common/types';
import {
  SEVERITY_COLORS,
  STATUS_COLORS,
  FINDING_STATE_COLORS,
} from '../shared/colors';
import { CHIP_SIZES, TABLE_STYLES } from '../shared/chipStyles';

const useStyles = makeStyles(theme => ({
  severityChip: {
    fontWeight: 600,
    minWidth: 60,
  },
  catI: { backgroundColor: SEVERITY_COLORS.CAT_I, color: '#fff' },
  catII: { backgroundColor: SEVERITY_COLORS.CAT_II, color: '#fff' },
  catIII: { backgroundColor: SEVERITY_COLORS.CAT_III, color: '#fff' },
  passBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
  },
  findingRow: {
    cursor: 'pointer',
    '&:hover': { backgroundColor: theme.palette.action.hover },
  },
  hostDetailRow: {
    backgroundColor: theme.palette.background.default,
  },
  hostStatusPass: {
    color: STATUS_COLORS.success,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  hostStatusFail: {
    color: STATUS_COLORS.error,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  hostStatusNA: {
    color: STATUS_COLORS.neutral,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  hostCountChip: {
    fontWeight: 600,
    ...CHIP_SIZES.standard,
  },
  expandedSection: {
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  ruleDescription: {
    padding: theme.spacing(1.5, 2),
    backgroundColor: theme.palette.background.default,
    borderTop: `1px solid ${theme.palette.divider}`,
  },
}));

const defaultSeverityLabel: Record<FindingSeverity, string> = {
  CAT_I: 'CAT I',
  CAT_II: 'CAT II',
  CAT_III: 'CAT III',
};

const stateConfig: Record<
  FindingState,
  {
    label: string;
    tooltip: string;
    color: string;
    bgColor: string;
    variant: 'default' | 'outlined';
  }
> = {
  new: {
    label: 'New',
    tooltip: 'First time this rule is failing on this host',
    color: FINDING_STATE_COLORS.new.color,
    bgColor: FINDING_STATE_COLORS.new.bgColor,
    variant: FINDING_STATE_COLORS.new.variant,
  },
  active: {
    label: 'Active',
    tooltip: 'Still failing from a previous scan',
    color: FINDING_STATE_COLORS.active.color,
    bgColor: FINDING_STATE_COLORS.active.bgColor,
    variant: FINDING_STATE_COLORS.active.variant,
  },
  fixed: {
    label: 'Fixed',
    tooltip: 'Was failing, now passing after remediation',
    color: FINDING_STATE_COLORS.fixed.color,
    bgColor: FINDING_STATE_COLORS.fixed.bgColor,
    variant: FINDING_STATE_COLORS.fixed.variant,
  },
  resurfaced: {
    label: 'Resurfaced',
    tooltip: 'Regression after remediation — was fixed, now failing again',
    color: FINDING_STATE_COLORS.resurfaced.color,
    bgColor: FINDING_STATE_COLORS.resurfaced.bgColor,
    variant: FINDING_STATE_COLORS.resurfaced.variant,
  },
};

interface FindingRowProps {
  finding: MultiHostFinding;
  expanded: boolean;
  onToggle: () => void;
  hostFilter?: string;
  severityLabelFn?: (key: string) => string;
}

export const FindingRow = ({
  finding,
  expanded,
  onToggle,
  hostFilter,
  severityLabelFn,
}: FindingRowProps) => {
  const classes = useStyles();

  const getSeverityClass = (severity: FindingSeverity) => {
    switch (severity) {
      case 'CAT_I':
        return classes.catI;
      case 'CAT_II':
        return classes.catII;
      case 'CAT_III':
        return classes.catIII;
      default:
        return '';
    }
  };

  const passRate =
    finding.totalCount > 0
      ? Math.round((finding.passCount / finding.totalCount) * 100)
      : 0;

  // Determine dominant state for the rule (priority: resurfaced > new > fixed > active)
  const dominantState: FindingState | null = (() => {
    if (!finding.stateSummary) return null;
    if (finding.stateSummary.resurfaced > 0) return 'resurfaced';
    if (finding.stateSummary.new > 0) return 'new';
    if (finding.stateSummary.fixed > 0) return 'fixed';
    if (finding.stateSummary.active > 0) return 'active';
    return null;
  })();

  return (
    <Fragment>
      <TableRow className={classes.findingRow} onClick={onToggle}>
        <TableCell>
          <IconButton
            size="small"
            aria-label={
              expanded
                ? `Collapse rule details for ${finding.stigId}`
                : `Expand rule details for ${finding.stigId}`
            }
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Box display="flex" alignItems="center" style={{ gap: 4 }}>
            <Chip
              label={
                severityLabelFn
                  ? severityLabelFn(finding.severity)
                  : defaultSeverityLabel[finding.severity]
              }
              size="small"
              className={`${classes.severityChip} ${getSeverityClass(
                finding.severity,
              )}`}
            />
            {dominantState && (
              <Tooltip title={stateConfig[dominantState].tooltip} arrow>
                <Chip
                  label={stateConfig[dominantState].label}
                  size="small"
                  variant={stateConfig[dominantState].variant}
                  style={{
                    color: stateConfig[dominantState].color,
                    backgroundColor: stateConfig[dominantState].bgColor,
                    borderColor:
                      stateConfig[dominantState].variant === 'outlined'
                        ? stateConfig[dominantState].color
                        : undefined,
                    fontWeight: 600,
                    fontSize: CHIP_SIZES.standard.fontSize,
                  }}
                />
              </Tooltip>
            )}
          </Box>
        </TableCell>
        <TableCell>
          <Typography variant="body2">{finding.title}</Typography>
          {finding.disruption === 'high' && (
            <Chip
              label="High disruption"
              size="small"
              color="secondary"
              style={{ marginTop: 4 }}
            />
          )}
          {finding.aapImpact === 'breaks-connectivity' && (
            <Tooltip
              title={
                finding.aapImpactReason ||
                'May break AAP connectivity to this host'
              }
            >
              <Chip
                label="Breaks AAP connectivity"
                size="small"
                style={{
                  marginTop: 4,
                  backgroundColor: STATUS_COLORS.error,
                  color: '#fff',
                }}
              />
            </Tooltip>
          )}
          {finding.aapImpact === 'caution' && (
            <Tooltip
              title={
                finding.aapImpactReason ||
                'Review before remediating — affects AAP connectivity subsystem'
              }
            >
              <Chip
                label="AAP caution"
                size="small"
                style={{
                  marginTop: 4,
                  backgroundColor: STATUS_COLORS.warning,
                  color: '#fff',
                }}
              />
            </Tooltip>
          )}
          {finding.automationAvailable === false && (
            <Tooltip title="No automated remediation available — manual fix required">
              <Chip
                label="Manual only"
                size="small"
                variant="outlined"
                style={{
                  marginTop: 4,
                  color: STATUS_COLORS.neutral,
                  borderColor: STATUS_COLORS.neutral,
                }}
              />
            </Tooltip>
          )}
        </TableCell>
        <TableCell>
          <Typography variant="body2" style={{ fontFamily: 'monospace' }}>
            {finding.ruleId}
          </Typography>
          {finding.stigId && finding.stigId !== finding.ruleId && (
            <Typography
              variant="caption"
              color="textSecondary"
              style={{ fontFamily: 'monospace', display: 'block' }}
            >
              {finding.stigId}
            </Typography>
          )}
        </TableCell>
        <TableCell align="center">
          {(() => {
            if (finding.failCount === 0 && finding.passCount > 0) {
              return (
                <Chip
                  label={`${finding.passCount}/${finding.totalCount}`}
                  size="small"
                  className={classes.hostCountChip}
                  style={{
                    backgroundColor: STATUS_COLORS.success,
                    color: '#fff',
                  }}
                />
              );
            }
            if (finding.failCount === 0 && finding.passCount === 0) {
              return (
                <Chip
                  label={`${finding.naCount} N/A`}
                  size="small"
                  variant="outlined"
                  className={classes.hostCountChip}
                  style={{ color: STATUS_COLORS.neutral }}
                />
              );
            }
            return (
              <Box display="flex" justifyContent="center" style={{ gap: 4 }}>
                {finding.passCount > 0 && (
                  <Chip
                    label={`${finding.passCount} pass`}
                    size="small"
                    style={{
                      ...CHIP_SIZES.micro,
                      backgroundColor: STATUS_COLORS.success,
                      color: '#fff',
                    }}
                  />
                )}
                <Chip
                  label={`${finding.failCount} fail`}
                  size="small"
                  style={{
                    ...CHIP_SIZES.micro,
                    backgroundColor: STATUS_COLORS.error,
                    color: '#fff',
                  }}
                />
                {finding.naCount > 0 && (
                  <Chip
                    label={`${finding.naCount} N/A`}
                    size="small"
                    variant="outlined"
                    style={{
                      ...CHIP_SIZES.micro,
                      color: STATUS_COLORS.neutral,
                    }}
                  />
                )}
              </Box>
            );
          })()}
        </TableCell>
        <TableCell>
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <LinearProgress
              variant="determinate"
              value={passRate}
              className={classes.passBar}
              style={{ flex: 1 }}
              color={
                finding.passCount === finding.totalCount
                  ? 'primary'
                  : 'secondary'
              }
            />
            <Typography variant="caption" style={{ minWidth: 36 }}>
              {passRate}%
            </Typography>
          </Box>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell
          colSpan={6}
          style={{ padding: 0, border: 'none', maxWidth: 0 }}
        >
          <Collapse in={expanded}>
            <div className={classes.ruleDescription}>
              <Typography variant="body2" gutterBottom>
                {finding.description}
              </Typography>
              <Box display="flex" style={{ gap: 24 }}>
                <div>
                  <Typography variant="caption" color="textSecondary">
                    Check
                  </Typography>
                  <Typography variant="body2">{finding.checkText}</Typography>
                </div>
                <div>
                  <Typography variant="caption" color="textSecondary">
                    Fix
                  </Typography>
                  <Typography variant="body2">{finding.fixText}</Typography>
                </div>
              </Box>
              {finding.automationAvailable === false && (
                <Box
                  mt={1.5}
                  p={1.5}
                  style={{
                    backgroundColor: '#F5F5F5',
                    borderRadius: 4,
                    border: '1px solid #D2D2D2',
                  }}
                >
                  <Box display="flex" alignItems="center" style={{ gap: 6 }}>
                    <HelpOutlineIcon
                      style={{ fontSize: 16, color: STATUS_COLORS.neutral }}
                    />
                    <Typography
                      variant="caption"
                      style={{ fontWeight: 600, color: STATUS_COLORS.neutral }}
                    >
                      Manual remediation required
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    style={{ display: 'block', marginTop: 4 }}
                  >
                    This rule has no automated remediation playbook available.
                    It must be resolved through manual configuration changes —
                    review the Check and Fix guidance above.
                  </Typography>
                </Box>
              )}
              {finding.naCount > 0 &&
                finding.failCount === 0 &&
                finding.passCount === 0 && (
                  <Box
                    mt={1.5}
                    p={1.5}
                    style={{
                      backgroundColor: '#F5F5F5',
                      borderRadius: 4,
                      border: '1px solid #D2D2D2',
                    }}
                  >
                    <Box display="flex" alignItems="center" style={{ gap: 6 }}>
                      <RemoveCircleOutlineIcon
                        style={{ fontSize: 16, color: STATUS_COLORS.neutral }}
                      />
                      <Typography
                        variant="caption"
                        style={{
                          fontWeight: 600,
                          color: STATUS_COLORS.neutral,
                        }}
                      >
                        Not Applicable
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      style={{ display: 'block', marginTop: 4 }}
                    >
                      This check was not evaluated because the preconditions are
                      not met on any scanned host — the relevant software,
                      service, or configuration is not present.
                    </Typography>
                  </Box>
                )}
            </div>

            <div className={classes.expandedSection}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell style={TABLE_STYLES.header}>Host</TableCell>
                    <TableCell style={TABLE_STYLES.header}>Status</TableCell>
                    <TableCell style={TABLE_STYLES.header}>State</TableCell>
                    <TableCell style={TABLE_STYLES.header}>
                      Actual Value
                    </TableCell>
                    <TableCell style={TABLE_STYLES.header}>
                      Expected Value
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {finding.hosts
                    .sort((a, b) => {
                      if (hostFilter) {
                        if (a.host === hostFilter) return -1;
                        if (b.host === hostFilter) return 1;
                      }
                      const order = (s: string) => {
                        if (s === 'fail') return 0;
                        if (s === 'not_applicable') return 2;
                        if (s === 'pass') return 3;
                        return 1;
                      };
                      return order(a.status) - order(b.status);
                    })
                    .map(hostFinding => (
                      <TableRow
                        key={hostFinding.host}
                        className={classes.hostDetailRow}
                        style={
                          hostFilter && hostFinding.host !== hostFilter
                            ? { opacity: 0.4 }
                            : undefined
                        }
                      >
                        <TableCell>
                          <Typography
                            variant="body2"
                            style={{ fontFamily: 'monospace' }}
                          >
                            {hostFinding.host}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <div
                            className={(() => {
                              if (hostFinding.status === 'pass')
                                return classes.hostStatusPass;
                              if (hostFinding.status === 'not_applicable')
                                return classes.hostStatusNA;
                              return classes.hostStatusFail;
                            })()}
                          >
                            {(() => {
                              if (hostFinding.status === 'pass')
                                return (
                                  <>
                                    <CheckCircleIcon fontSize="small" /> Pass
                                  </>
                                );
                              if (hostFinding.status === 'not_applicable')
                                return (
                                  <>
                                    <RemoveCircleOutlineIcon fontSize="small" />{' '}
                                    Not Applicable
                                  </>
                                );
                              return (
                                <>
                                  <ErrorIcon fontSize="small" /> Fail
                                </>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {hostFinding.findingState ? (
                            <Tooltip
                              title={
                                stateConfig[hostFinding.findingState].tooltip
                              }
                              arrow
                            >
                              <Chip
                                label={
                                  stateConfig[hostFinding.findingState].label
                                }
                                size="small"
                                variant={
                                  stateConfig[hostFinding.findingState].variant
                                }
                                style={{
                                  color:
                                    stateConfig[hostFinding.findingState].color,
                                  backgroundColor:
                                    stateConfig[hostFinding.findingState]
                                      .bgColor,
                                  borderColor:
                                    stateConfig[hostFinding.findingState]
                                      .variant === 'outlined'
                                      ? stateConfig[hostFinding.findingState]
                                          .color
                                      : undefined,
                                  fontWeight: 600,
                                  fontSize: CHIP_SIZES.standard.fontSize,
                                }}
                              />
                            </Tooltip>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            style={{
                              fontFamily: 'monospace',
                              color: (() => {
                                if (hostFinding.status === 'fail')
                                  return STATUS_COLORS.error;
                                if (hostFinding.status === 'not_applicable')
                                  return STATUS_COLORS.neutral;
                                return 'inherit';
                              })(),
                              fontWeight:
                                hostFinding.status === 'fail' ? 600 : 400,
                              fontStyle:
                                hostFinding.status === 'not_applicable'
                                  ? 'italic'
                                  : 'normal',
                              wordBreak: 'break-all',
                            }}
                          >
                            {hostFinding.status === 'not_applicable' &&
                            !hostFinding.actualValue
                              ? 'Not applicable — check not evaluated on this host'
                              : hostFinding.actualValue}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            style={{
                              fontFamily: 'monospace',
                              wordBreak: 'break-all',
                            }}
                          >
                            {hostFinding.expectedValue}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
};
