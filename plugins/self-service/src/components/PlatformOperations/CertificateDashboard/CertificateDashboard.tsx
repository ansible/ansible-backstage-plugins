/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useState } from 'react';
import {
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  TextField,
  makeStyles,
  Paper,
  CardActionArea,
} from '@material-ui/core';
import {
  Table,
  TableColumn,
  Progress,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import RefreshIcon from '@material-ui/icons/Refresh';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import WarningIcon from '@material-ui/icons/Warning';
import ErrorIcon from '@material-ui/icons/Error';
import SecurityIcon from '@material-ui/icons/Security';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import ClearIcon from '@material-ui/icons/Clear';

import type {
  CertificateInfo,
  CertificateSummary,
  CertificateStatus,
  CertificateThresholds,
} from '@ansible/backstage-rhaap-common';
import {
  platformOpsApiRef,
  extractCertificateReport,
} from '../../../apis';

type FilterType = 'total' | 'ok' | 'warning' | 'critical' | 'expired' | 'missing' | null;

const useStyles = makeStyles(theme => ({
  headerCard: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    color: '#fff',
    marginBottom: theme.spacing(3),
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  headerIcon: {
    fontSize: '2.5rem',
    color: '#4fc3f7',
  },
  headerMeta: {
    opacity: 0.8,
    fontSize: '0.875rem',
  },
  thresholdBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: theme.spacing(0.5, 1.5),
    borderRadius: 16,
    fontSize: '0.75rem',
    marginRight: theme.spacing(1),
  },
  summaryContainer: {
    marginBottom: theme.spacing(3),
  },
  summaryCard: {
    height: '100%',
    textAlign: 'center',
    transition: 'transform 0.2s, box-shadow 0.2s',
    cursor: 'pointer',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows[4],
    },
  },
  summaryCardSelected: {
    boxShadow: `0 0 0 3px ${theme.palette.primary.main}`,
    transform: 'translateY(-2px)',
  },
  summaryValue: {
    fontSize: '3rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  summaryLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statusOk: {
    color: '#2e7d32',
  },
  statusWarning: {
    color: '#ed6c02',
  },
  statusCritical: {
    color: '#d32f2f',
  },
  statusExpired: {
    color: '#9c27b0',
  },
  chipOk: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
    fontWeight: 600,
  },
  chipWarning: {
    backgroundColor: '#fff3e0',
    color: '#e65100',
    fontWeight: 600,
  },
  chipCritical: {
    backgroundColor: '#ffebee',
    color: '#c62828',
    fontWeight: 600,
  },
  chipExpired: {
    backgroundColor: '#f3e5f5',
    color: '#7b1fa2',
    fontWeight: 600,
  },
  tableCard: {
    marginTop: theme.spacing(3),
  },
  tableHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  tableHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
  },
  filterChip: {
    marginLeft: theme.spacing(1),
  },
  controlsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
  },
  thresholdInput: {
    width: 100,
    '& .MuiOutlinedInput-root': {
      backgroundColor: '#fff',
    },
  },
  runButton: {
    minWidth: 140,
  },
  daysCell: {
    fontWeight: 600,
    fontFamily: 'monospace',
    fontSize: '1rem',
  },
  pathCell: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  noDataMessage: {
    textAlign: 'center',
    padding: theme.spacing(6),
    color: theme.palette.text.secondary,
  },
  progressContainer: {
    padding: theme.spacing(4),
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
}));

const emptySummary: CertificateSummary = {
  total: 0,
  ok: 0,
  warning: 0,
  critical: 0,
  expired: 0,
  missing: 0,
  error: 0,
};

const StatusChip: React.FC<{ status: CertificateStatus }> = ({ status }) => {
  const classes = useStyles();

  const getChipProps = () => {
    switch (status) {
      case 'ok':
        return {
          label: 'OK',
          icon: <CheckCircleIcon style={{ fontSize: 16 }} />,
          className: classes.chipOk,
        };
      case 'warning':
        return {
          label: 'WARNING',
          icon: <WarningIcon style={{ fontSize: 16 }} />,
          className: classes.chipWarning,
        };
      case 'critical':
        return {
          label: 'CRITICAL',
          icon: <ErrorIcon style={{ fontSize: 16 }} />,
          className: classes.chipCritical,
        };
      case 'expired':
        return {
          label: 'EXPIRED',
          icon: <ErrorOutlineIcon style={{ fontSize: 16 }} />,
          className: classes.chipExpired,
        };
      case 'missing':
      case 'error':
        return {
          label: status.toUpperCase(),
          icon: <ErrorIcon style={{ fontSize: 16 }} />,
          className: classes.chipCritical,
        };
      default:
        return { label: status, className: '' };
    }
  };

  const props = getChipProps();
  return <Chip size="small" {...props} />;
};

const SummaryCard: React.FC<{
  title: string;
  value: number;
  colorClass?: string;
  icon?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}> = ({ title, value, colorClass, icon, selected, onClick }) => {
  const classes = useStyles();
  return (
    <Card
      className={`${classes.summaryCard} ${selected ? classes.summaryCardSelected : ''}`}
      elevation={selected ? 4 : 1}
      onClick={onClick}
    >
      <CardActionArea style={{ height: '100%' }}>
        <CardContent>
          {icon && <Box mb={1}>{icon}</Box>}
          <Typography className={`${classes.summaryValue} ${colorClass || ''}`}>
            {value}
          </Typography>
          <Typography className={classes.summaryLabel} color="textSecondary">
            {title}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export const CertificateDashboard: React.FC = () => {
  const classes = useStyles();
  const platformOpsApi = useApi(platformOpsApiRef);

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<CertificateThresholds | null>(null);
  const [summary, setSummary] = useState<CertificateSummary>(emptySummary);
  const [certificates, setCertificates] = useState<CertificateInfo[]>([]);
  const [filter, setFilter] = useState<FilterType>(null);

  const [criticalDays, setCriticalDays] = useState<number>(5);
  const [warningDays, setWarningDays] = useState<number>(47);

  const handleFilterClick = (filterType: FilterType) => {
    setFilter(current => (current === filterType ? null : filterType));
  };

  const filteredCertificates = filter && filter !== 'total'
    ? certificates.filter(c => c.status === filter)
    : certificates;

  const getFilterLabel = () => {
    if (!filter || filter === 'total') return 'All Certificates';
    return `${filter.charAt(0).toUpperCase() + filter.slice(1)} Certificates`;
  };

  const handleRunCheck = async () => {
    setIsRunning(true);
    setError(null);
    setFilter(null);

    try {
      const result = await platformOpsApi.executeTask('cert-check', '', {
        critical_water_mark: criticalDays,
        high_water_mark: warningDays,
      });

      const report = extractCertificateReport(result.execution);

      if (report && report.certificates.length > 0) {
        setCertificates(report.certificates);
        setSummary(report.summary);
        setHost(report.host || null);
        setThresholds(report.thresholds || null);
        setLastRun(report.checkDate || new Date().toISOString());
      } else if (result.execution.error) {
        const errMsg =
          typeof result.execution.error === 'string'
            ? result.execution.error
            : JSON.stringify(result.execution.error);
        setError(errMsg);
      } else if (result.execution.status === 'failed') {
        setError(`Job failed with status: ${result.execution.status}`);
      } else {
        setLastRun(new Date().toISOString());
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null
            ? JSON.stringify(err, null, 2)
            : String(err);
      setError(message);
      console.error('Certificate check failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const columns: TableColumn<CertificateInfo>[] = [
    {
      title: 'Certificate',
      field: 'name',
      render: row => (
        <Box>
          <Typography variant="body2" style={{ fontWeight: 600 }}>
            {row.name}
          </Typography>
          <Typography className={classes.pathCell}>{row.path}</Typography>
        </Box>
      ),
    },
    {
      title: 'Status',
      field: 'status',
      render: row => <StatusChip status={row.status} />,
    },
    {
      title: 'Days Left',
      field: 'daysRemaining',
      render: row => {
        let colorClass = '';
        if (row.daysRemaining < 0) {
          colorClass = classes.statusExpired;
        } else if (row.daysRemaining <= criticalDays) {
          colorClass = classes.statusCritical;
        } else if (row.daysRemaining <= warningDays) {
          colorClass = classes.statusWarning;
        } else {
          colorClass = classes.statusOk;
        }
        return (
          <Typography className={`${classes.daysCell} ${colorClass}`}>
            {row.daysRemaining}
          </Typography>
        );
      },
    },
    { title: 'Expiry Date', field: 'expiryDate' },
    { title: 'Source', field: 'source' },
    { title: 'Host', field: 'host' },
  ];

  return (
    <Box>
      {/* Header Card */}
      <Card className={classes.headerCard}>
        <CardContent>
          <Box className={classes.headerContent}>
            <Box className={classes.headerTitle}>
              <SecurityIcon className={classes.headerIcon} />
              <Box>
                <Typography variant="h4" style={{ fontWeight: 600 }}>
                  AAP Certificate Discovery
                </Typography>
                {host && (
                  <Typography className={classes.headerMeta}>
                    Host: {host}
                    {lastRun && ` | Last checked: ${new Date(lastRun).toLocaleString()}`}
                  </Typography>
                )}
              </Box>
            </Box>
            <Box>
              {thresholds && (
                <Box mb={1}>
                  <span className={classes.thresholdBadge}>
                    Warning: {thresholds.highWaterMark} days
                  </span>
                  <span className={classes.thresholdBadge}>
                    Critical: {thresholds.criticalWaterMark} days
                  </span>
                </Box>
              )}
              <Box className={classes.controlsContainer}>
                <TextField
                  label="Critical"
                  type="number"
                  size="small"
                  variant="outlined"
                  value={criticalDays}
                  onChange={e =>
                    setCriticalDays(Math.max(1, parseInt(e.target.value, 10) || 5))
                  }
                  inputProps={{ min: 1 }}
                  className={classes.thresholdInput}
                  disabled={isRunning}
                />
                <TextField
                  label="Warning"
                  type="number"
                  size="small"
                  variant="outlined"
                  value={warningDays}
                  onChange={e =>
                    setWarningDays(Math.max(1, parseInt(e.target.value, 10) || 47))
                  }
                  inputProps={{ min: 1 }}
                  className={classes.thresholdInput}
                  disabled={isRunning}
                />
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={isRunning ? undefined : <RefreshIcon />}
                  onClick={handleRunCheck}
                  disabled={isRunning}
                  className={classes.runButton}
                >
                  {isRunning ? 'Running...' : 'Run Check'}
                </Button>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Progress */}
      {isRunning && (
        <Paper className={classes.progressContainer}>
          <Progress />
          <Typography variant="body2" color="textSecondary" style={{ marginTop: 16 }}>
            Executing AAP Job Template... This may take a minute.
          </Typography>
        </Paper>
      )}

      {/* Error */}
      {error && (
        <Box className={classes.errorBox}>
          <Typography color="error" style={{ fontWeight: 600 }}>
            Error
          </Typography>
          <Typography
            color="error"
            component="pre"
            style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem' }}
          >
            {error}
          </Typography>
        </Box>
      )}

      {/* Summary Cards - Clickable */}
      {certificates.length > 0 && (
        <>
          <Typography variant="body2" color="textSecondary" style={{ marginBottom: 8 }}>
            Click a card to filter certificates
          </Typography>
          <Grid container spacing={2} className={classes.summaryContainer}>
            <Grid item xs={6} sm={4} md={2}>
              <SummaryCard
                title="Total"
                value={summary.total}
                selected={filter === 'total'}
                onClick={() => handleFilterClick('total')}
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <SummaryCard
                title="OK"
                value={summary.ok}
                colorClass={classes.statusOk}
                icon={<CheckCircleIcon style={{ color: '#2e7d32', fontSize: 28 }} />}
                selected={filter === 'ok'}
                onClick={() => handleFilterClick('ok')}
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <SummaryCard
                title="Warning"
                value={summary.warning}
                colorClass={classes.statusWarning}
                icon={<WarningIcon style={{ color: '#ed6c02', fontSize: 28 }} />}
                selected={filter === 'warning'}
                onClick={() => handleFilterClick('warning')}
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <SummaryCard
                title="Critical"
                value={summary.critical}
                colorClass={classes.statusCritical}
                icon={<ErrorIcon style={{ color: '#d32f2f', fontSize: 28 }} />}
                selected={filter === 'critical'}
                onClick={() => handleFilterClick('critical')}
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <SummaryCard
                title="Expired"
                value={summary.expired}
                colorClass={classes.statusExpired}
                icon={<ErrorOutlineIcon style={{ color: '#9c27b0', fontSize: 28 }} />}
                selected={filter === 'expired'}
                onClick={() => handleFilterClick('expired')}
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <SummaryCard
                title="Missing"
                value={summary.missing}
                colorClass={classes.statusCritical}
                selected={filter === 'missing'}
                onClick={() => handleFilterClick('missing')}
              />
            </Grid>
          </Grid>

          {/* Certificate Table */}
          <Paper className={classes.tableCard}>
            <Box className={classes.tableHeader}>
              <Box className={classes.tableHeaderLeft}>
                <Typography variant="h6">{getFilterLabel()}</Typography>
                {filter && filter !== 'total' && (
                  <Chip
                    size="small"
                    label="Clear filter"
                    icon={<ClearIcon style={{ fontSize: 16 }} />}
                    onClick={() => setFilter(null)}
                    className={classes.filterChip}
                  />
                )}
              </Box>
              <Typography variant="body2" color="textSecondary">
                {filteredCertificates.length} certificate{filteredCertificates.length !== 1 ? 's' : ''}
              </Typography>
            </Box>
            <Table
              columns={columns}
              data={filteredCertificates}
              options={{
                search: true,
                paging: true,
                pageSize: 10,
                sorting: true,
              }}
            />
          </Paper>
        </>
      )}

      {/* No Data State */}
      {!isRunning && certificates.length === 0 && !error && (
        <Paper className={classes.noDataMessage}>
          <SecurityIcon style={{ fontSize: 64, color: '#bdbdbd', marginBottom: 16 }} />
          <Typography variant="h6" gutterBottom>
            No Certificate Data
          </Typography>
          <Typography color="textSecondary">
            Click "Run Check" to discover certificates across your AAP infrastructure.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};
