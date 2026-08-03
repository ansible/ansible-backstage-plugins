import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  InfoCard,
  Breadcrumbs,
  Progress,
  StatusOK,
  StatusError,
  StatusWarning,
  StatusRunning,
  StatusPending,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  Typography,
  Box,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Paper,
  Chip,
  Button,
  makeStyles,
} from '@material-ui/core';
import AssessmentIcon from '@material-ui/icons/Assessment';
import BuildIcon from '@material-ui/icons/Build';
import VerifiedUserIcon from '@material-ui/icons/VerifiedUser';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import { complianceApiRef } from '../../api';
import { formatDuration } from '../shared/formatTime';
import { STATUS_COLORS } from '../shared/colors';
import type { ChainResponse } from '@ansible/backstage-compliance-common/types';

const useStyles = makeStyles(theme => ({
  stepCard: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginTop: theme.spacing(1),
    flexWrap: 'wrap' as const,
  },
  passRate: {
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  deltaPositive: {
    color: STATUS_COLORS.success,
    fontWeight: 600,
  },
  deltaNegative: {
    color: STATUS_COLORS.error,
    fontWeight: 600,
  },
  connector: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 0),
    color: theme.palette.text.secondary,
  },
  linkButton: {
    textTransform: 'none' as const,
    padding: theme.spacing(0.5, 1),
    fontSize: '0.8rem',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: theme.spacing(6),
  },
  executionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
}));

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function passRate(pass: number, fail: number): string {
  const total = pass + fail;
  if (total === 0) return '—';
  return `${Math.round((pass / total) * 1000) / 10}%`;
}

const ExecutionStatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'succeeded': return <StatusOK />;
    case 'failed': return <StatusError />;
    case 'running': return <StatusRunning />;
    case 'pending': return <StatusPending />;
    case 'cancelled': return <StatusWarning />;
    default: return <StatusPending />;
  }
};

export const ChainView = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const { executionId } = useParams<{ executionId: string }>();
  const api = useApi(complianceApiRef);
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!executionId) return;
    api.getChain(executionId)
      .then(data => { setChain(data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : String(err)); setLoading(false); });
  }, [api, executionId]);

  if (loading) {
    return <Box p={4}><Progress /></Box>;
  }

  if (error || !chain) {
    return (
      <Box p={4}>
        <Breadcrumbs>
          <Typography color="primary" style={{ cursor: 'pointer' }} onClick={() => navigate('/compliance/results')}>Results</Typography>
          <Typography>Chain View</Typography>
        </Breadcrumbs>
        <Box mt={2} />
        <InfoCard title="Chain View">
          <div className={classes.emptyState}>
            <Typography variant="h6" color="textSecondary" gutterBottom>
              {error || 'Execution not found'}
            </Typography>
            <Button variant="outlined" onClick={() => navigate('/compliance/results')}>
              Back to Results
            </Button>
          </div>
        </InfoCard>
      </Box>
    );
  }

  const { execution, assessmentScan, assessmentStats, verificationScan, verificationStats, delta } = chain;
  const activeStep = verificationScan ? 2 : execution.status === 'succeeded' ? 1 : 0;

  return (
    <>
      <Breadcrumbs>
        <Typography color="primary" style={{ cursor: 'pointer' }} onClick={() => navigate('/compliance/results')}>Results</Typography>
        <Typography>Assessment Chain</Typography>
      </Breadcrumbs>
      <Box mt={2} />
      <InfoCard title="Assessment Chain" subheader={`Remediation execution ${executionId?.slice(0, 8)}...`}>
        <Stepper activeStep={activeStep} orientation="vertical" nonLinear>
          {/* Step 1: Assessment Scan */}
          <Step completed={!!assessmentScan}>
            <StepLabel
              StepIconComponent={() => <AssessmentIcon color={assessmentScan ? 'primary' : 'disabled'} />}
            >
              Assessment Scan
            </StepLabel>
            <StepContent>
              {assessmentScan && assessmentStats ? (
                <Paper variant="outlined" className={classes.stepCard}>
                  <Typography variant="subtitle2">{formatDate(assessmentScan.startedAt)}</Typography>
                  <div className={classes.statsRow}>
                    <Typography className={classes.passRate}>
                      {passRate(assessmentStats.pass, assessmentStats.fail)}
                    </Typography>
                    <Chip label={`${assessmentStats.rules} rules`} size="small" variant="outlined" />
                    <Chip label={`${assessmentStats.hosts} hosts`} size="small" variant="outlined" />
                    <Chip label={`${assessmentStats.pass} pass`} size="small" style={{ backgroundColor: STATUS_COLORS.success, color: '#fff' }} />
                    <Chip label={`${assessmentStats.fail} fail`} size="small" style={{ backgroundColor: STATUS_COLORS.error, color: '#fff' }} />
                  </div>
                  <Box mt={1}>
                    <Button
                      size="small"
                      className={classes.linkButton}
                      onClick={() => navigate(`/compliance/results/${assessmentScan.workflowJobId ?? assessmentScan.id}`)}
                    >
                      View full results
                    </Button>
                  </Box>
                </Paper>
              ) : (
                <Typography variant="body2" color="textSecondary">Assessment scan not linked</Typography>
              )}
              <div className={classes.connector}>
                <ArrowForwardIcon fontSize="small" />
                <Typography variant="body2">
                  {execution.rulesApplied ?? '?'} rules selected on {execution.hostsTargeted ?? '?'} hosts
                </Typography>
              </div>
            </StepContent>
          </Step>

          {/* Step 2: Remediation Execution */}
          <Step completed={execution.status === 'succeeded'}>
            <StepLabel
              StepIconComponent={() => <BuildIcon color={execution.status === 'succeeded' ? 'primary' : 'disabled'} />}
            >
              Remediation
            </StepLabel>
            <StepContent>
              <Paper variant="outlined" className={classes.stepCard}>
                <div className={classes.executionStatus}>
                  <ExecutionStatusIcon status={execution.status} />
                  <Typography variant="subtitle2" style={{ textTransform: 'capitalize' }}>
                    {execution.status}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {formatDuration(execution.elapsedSeconds)}
                  </Typography>
                </div>
                <div className={classes.statsRow}>
                  {execution.hostsSucceeded !== null && (
                    <Chip
                      icon={<CheckCircleIcon style={{ color: STATUS_COLORS.success }} />}
                      label={`${execution.hostsSucceeded} hosts succeeded`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  {execution.hostsFailed !== null && execution.hostsFailed > 0 && (
                    <Chip
                      icon={<ErrorIcon style={{ color: STATUS_COLORS.error }} />}
                      label={`${execution.hostsFailed} hosts failed`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  {execution.rulesApplied !== null && (
                    <Chip label={`${execution.rulesApplied} rules applied`} size="small" variant="outlined" />
                  )}
                </div>
                {execution.primaryJobId && (
                  <Box mt={1}>
                    <Button
                      size="small"
                      className={classes.linkButton}
                      onClick={() => navigate(`/compliance/remediation-result/${execution.primaryJobId}`)}
                    >
                      View execution details
                    </Button>
                  </Box>
                )}
              </Paper>
              {verificationScan ? (
                <div className={classes.connector}>
                  <ArrowForwardIcon fontSize="small" />
                  <Typography variant="body2">Verification scan triggered</Typography>
                </div>
              ) : execution.status === 'succeeded' ? (
                <div className={classes.connector}>
                  <Typography variant="body2" color="textSecondary">No verification scan yet</Typography>
                </div>
              ) : null}
            </StepContent>
          </Step>

          {/* Step 3: Verification Scan */}
          <Step completed={verificationScan?.status === 'completed'}>
            <StepLabel
              StepIconComponent={() => <VerifiedUserIcon color={verificationScan ? 'primary' : 'disabled'} />}
            >
              Verification
            </StepLabel>
            <StepContent>
              {verificationScan && verificationStats ? (
                <Paper variant="outlined" className={classes.stepCard}>
                  <Typography variant="subtitle2">{formatDate(verificationScan.startedAt)}</Typography>
                  <div className={classes.statsRow}>
                    <Typography className={classes.passRate}>
                      {passRate(verificationStats.pass, verificationStats.fail)}
                    </Typography>
                    <Chip label={`${verificationStats.rules} rules`} size="small" variant="outlined" />
                    <Chip label={`${verificationStats.hosts} hosts`} size="small" variant="outlined" />
                    <Chip label={`${verificationStats.pass} pass`} size="small" style={{ backgroundColor: STATUS_COLORS.success, color: '#fff' }} />
                    <Chip label={`${verificationStats.fail} fail`} size="small" style={{ backgroundColor: STATUS_COLORS.error, color: '#fff' }} />
                  </div>
                  {delta && (
                    <Box mt={1.5} display="flex" style={{ gap: 16 }}>
                      {delta.fixed > 0 && (
                        <Typography variant="body2" className={classes.deltaPositive}>
                          +{delta.fixed} fixed
                        </Typography>
                      )}
                      {delta.regressed > 0 && (
                        <Typography variant="body2" className={classes.deltaNegative}>
                          -{delta.regressed} regressed
                        </Typography>
                      )}
                      {delta.fixed === 0 && delta.regressed === 0 && (
                        <Typography variant="body2" color="textSecondary">
                          No changes detected
                        </Typography>
                      )}
                    </Box>
                  )}
                  <Box mt={1}>
                    <Button
                      size="small"
                      className={classes.linkButton}
                      onClick={() => navigate(`/compliance/results/${verificationScan.workflowJobId ?? verificationScan.id}`)}
                    >
                      View verification results
                    </Button>
                  </Box>
                </Paper>
              ) : (
                <Typography variant="body2" color="textSecondary">
                  {execution.status === 'succeeded'
                    ? 'Run a verification scan to confirm remediation effectiveness'
                    : 'Awaiting remediation completion'}
                </Typography>
              )}
            </StepContent>
          </Step>
        </Stepper>
      </InfoCard>
    </>
  );
};
