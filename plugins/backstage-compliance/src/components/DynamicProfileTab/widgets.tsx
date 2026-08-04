import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  makeStyles,
} from '@material-ui/core';
import { InfoCard } from '@backstage/core-components';
import type {
  TabWidget,
  DisplayColumn,
} from '@ansible/backstage-compliance-common/types';
import type { MultiHostFinding } from '@ansible/backstage-compliance-common/types';
import { SEVERITY_COLORS, SURFACE_COLORS } from '../shared/colors';
import { TABLE_STYLES, CHIP_SIZES } from '../shared/chipStyles';

const useStyles = makeStyles(theme => ({
  widgetContainer: {
    marginBottom: theme.spacing(2),
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  statLabel: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
  },
  severityChip: {
    margin: theme.spacing(0.5),
    fontWeight: 600,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
}));

interface WidgetProps {
  config: TabWidget;
  findings: MultiHostFinding[];
  severityLabel: (key: string) => string;
  scanMeta?: {
    totalPackages?: number;
    totalVulnerabilities?: number;
    totalScannedPackages?: number;
    totalVulnerablePackages?: number;
  };
}

function computeMetric(
  findings: MultiHostFinding[],
  metric?: string,
  scanMeta?: {
    totalPackages?: number;
    totalScannedPackages?: number;
    totalVulnerablePackages?: number;
  },
): { value: number; label: string } {
  const totalFindings = findings.length;
  const failCount = findings.filter(f => f.failCount > 0).length;
  const passCount = totalFindings - failCount;

  switch (metric) {
    case 'vulnerability_free_rate': {
      const scanned = scanMeta?.totalScannedPackages;
      const vulnerable = scanMeta?.totalVulnerablePackages;
      if (scanned && scanned > 0 && vulnerable !== undefined) {
        const rate = Math.round(((scanned - vulnerable) / scanned) * 100);
        return { value: rate, label: `${rate}%` };
      }
      const denominator = scanMeta?.totalPackages ?? totalFindings;
      const rate =
        denominator > 0
          ? Math.round(((denominator - failCount) / denominator) * 100)
          : 100;
      return { value: rate, label: `${rate}%` };
    }
    case 'compliance_rate': {
      const rate =
        totalFindings > 0 ? Math.round((passCount / totalFindings) * 100) : 100;
      return { value: rate, label: `${rate}%` };
    }
    case 'finding_count':
      return { value: failCount, label: String(failCount) };
    default:
      return { value: totalFindings, label: String(totalFindings) };
  }
}

export const SummaryCardWidget = ({
  config,
  findings,
  scanMeta,
}: WidgetProps) => {
  const classes = useStyles();
  const metric = computeMetric(findings, config.metric, scanMeta);
  const unit = config.unit ?? 'findings';

  return (
    <Paper className={classes.widgetContainer} variant="outlined">
      <Box p={2}>
        <Typography variant="subtitle2" color="textSecondary">
          {config.title ?? 'Summary'}
        </Typography>
        <Typography className={classes.statValue}>{metric.label}</Typography>
        <Typography className={classes.statLabel}>
          {scanMeta?.totalScannedPackages ??
            scanMeta?.totalPackages ??
            findings.length}{' '}
          {unit} evaluated
        </Typography>
        <LinearProgress
          variant="determinate"
          value={metric.value}
          className={classes.progressBar}
          style={{ backgroundColor: '#e0e0e0' }}
          color="primary"
        />
      </Box>
    </Paper>
  );
};

export const SeverityBreakdownWidget = ({
  config,
  findings,
  severityLabel,
}: WidgetProps) => {
  const classes = useStyles();
  const catI = findings.filter(
    f => f.severity === 'CAT_I' && f.failCount > 0,
  ).length;
  const catII = findings.filter(
    f => f.severity === 'CAT_II' && f.failCount > 0,
  ).length;
  const catIII = findings.filter(
    f => f.severity === 'CAT_III' && f.failCount > 0,
  ).length;

  const customLabels = config.labels ?? {};

  return (
    <Paper className={classes.widgetContainer} variant="outlined">
      <Box p={2}>
        <Typography variant="subtitle2" color="textSecondary" gutterBottom>
          {config.title ?? 'Severity Breakdown'}
        </Typography>
        <Box display="flex" flexWrap="wrap">
          <Chip
            label={`${customLabels.CAT_I ?? severityLabel('CAT_I')}: ${catI}`}
            className={classes.severityChip}
            style={{
              backgroundColor: SEVERITY_COLORS.CAT_I,
              color: SURFACE_COLORS.onDark,
              ...CHIP_SIZES.standard,
            }}
            size="small"
          />
          <Chip
            label={`${
              customLabels.CAT_II ?? severityLabel('CAT_II')
            }: ${catII}`}
            className={classes.severityChip}
            style={{
              backgroundColor: SEVERITY_COLORS.CAT_II,
              color: SURFACE_COLORS.onDark,
              ...CHIP_SIZES.standard,
            }}
            size="small"
          />
          <Chip
            label={`${
              customLabels.CAT_III ?? severityLabel('CAT_III')
            }: ${catIII}`}
            className={classes.severityChip}
            style={{
              backgroundColor: SEVERITY_COLORS.CAT_III,
              color: SURFACE_COLORS.onDark,
              ...CHIP_SIZES.standard,
            }}
            size="small"
          />
        </Box>
      </Box>
    </Paper>
  );
};

export const FindingsTableWidget = ({
  config,
  findings,
  severityLabel,
}: WidgetProps) => {
  const columns: DisplayColumn[] = config.columns ?? [
    { field: 'rule_id', label: 'Rule ID' },
    { field: 'title', label: 'Title' },
    { field: 'severity', label: 'Severity' },
  ];

  const failingFindings = findings.filter(f => f.failCount > 0);

  const getCellValue = (finding: MultiHostFinding, field: string): string => {
    if (field === 'rule_id') return finding.ruleId;
    if (field === 'stig_id') return finding.stigId;
    if (field === 'title') return finding.title;
    if (field === 'severity') return severityLabel(finding.severity);
    if (field === 'status') return finding.failCount > 0 ? 'Fail' : 'Pass';
    if (field === 'fix_text') return finding.fixText;
    if (field === 'check_text') return finding.checkText;
    if (field.startsWith('evidence.')) {
      return '';
    }
    return '';
  };

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map(col => (
              <TableCell key={col.field} style={TABLE_STYLES.header}>
                {col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {failingFindings.slice(0, 50).map(finding => (
            <TableRow key={finding.ruleId}>
              {columns.map(col => (
                <TableCell key={col.field}>
                  {getCellValue(finding, col.field)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export const TrendChartWidget = ({ config }: WidgetProps) => {
  return (
    <InfoCard title={config.label ?? 'Trend'}>
      <Box p={2}>
        <Typography variant="body2" color="textSecondary">
          Trend chart rendering requires posture history data. Available when
          connected to a live backend.
        </Typography>
      </Box>
    </InfoCard>
  );
};

export const HostBreakdownWidget = ({ config, findings }: WidgetProps) => {
  const hostMap = new Map<string, { pass: number; fail: number }>();
  for (const f of findings) {
    for (const h of f.hosts) {
      const existing = hostMap.get(h.host) ?? { pass: 0, fail: 0 };
      if (h.status === 'fail') existing.fail++;
      else if (h.status === 'pass') existing.pass++;
      hostMap.set(h.host, existing);
    }
  }

  const hosts = Array.from(hostMap.entries())
    .map(([hostname, counts]) => ({ hostname, ...counts }))
    .sort((a, b) => b.fail - a.fail);

  return (
    <InfoCard title={config.title ?? 'Hosts'}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell style={TABLE_STYLES.header}>Host</TableCell>
              <TableCell style={TABLE_STYLES.header} align="right">
                Failing
              </TableCell>
              <TableCell style={TABLE_STYLES.header} align="right">
                Passing
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {hosts.slice(0, 20).map(h => (
              <TableRow key={h.hostname}>
                <TableCell>{h.hostname}</TableCell>
                <TableCell align="right">{h.fail}</TableCell>
                <TableCell align="right">{h.pass}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </InfoCard>
  );
};

export const GaugeWidget = ({ config, findings, scanMeta }: WidgetProps) => {
  const metric = computeMetric(findings, config.metric, scanMeta);
  return (
    <Paper variant="outlined">
      <Box p={2} textAlign="center">
        <Typography variant="h3">{metric.label}</Typography>
        <Typography variant="body2" color="textSecondary">
          {config.label ?? config.title ?? 'Score'}
        </Typography>
      </Box>
    </Paper>
  );
};
