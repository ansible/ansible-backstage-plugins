import { useState, useEffect, useRef } from 'react';
import {
  StatusOK,
  StatusError,
  StatusPending,
} from '@backstage/core-components';
import {
  Box,
  Typography,
  LinearProgress,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Paper,
  Chip,
  makeStyles,
} from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import { complianceApiRef } from '../../api';
import { formatElapsed } from '../shared/formatTime';

const useStyles = makeStyles(theme => ({
  root: {
    marginBottom: theme.spacing(3),
  },
  paper: {
    padding: theme.spacing(2, 3),
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
  progressBar: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
    height: 8,
    borderRadius: 4,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing(1),
  },
  elapsed: {
    fontFamily: 'monospace',
    color: theme.palette.text.secondary,
  },
}));

const STEPS = ['Scanning'];
const NODE_IDS = ['run-oscap'];

interface NodeStatus {
  identifier: string;
  status: string;
  jobId?: number;
}

function nodeStatusIcon(status: string) {
  switch (status) {
    case 'successful':
      return <StatusOK />;
    case 'failed':
    case 'error':
      return <StatusError />;
    case 'running':
    case 'waiting':
      return <CircularProgress size={20} thickness={4} />;
    default:
      return <StatusPending />;
  }
}

function computeProgress(nodes: NodeStatus[]): number {
  if (nodes.length === 0) return 0;
  let pct = 0;
  const step = 100 / nodes.length;
  for (const n of nodes) {
    if (n.status === 'successful') pct += step;
    else if (n.status === 'running' || n.status === 'waiting')
      pct += step * 0.5;
    else if (n.status === 'failed' || n.status === 'error') pct += step;
  }
  return Math.round(pct);
}

export interface ScanProgressProps {
  workflowJobId: number;
  profileName?: string;
  onComplete?: () => void;
  onFailed?: (status: string) => void;
  scanType?: 'assessment' | 'verification' | 'remediation';
}

export const ScanProgress = ({
  workflowJobId,
  profileName,
  onComplete,
  onFailed,
  scanType = 'assessment',
}: ScanProgressProps) => {
  const classes = useStyles();
  const api = useApi(complianceApiRef);
  const steps = STEPS;
  const nodeIds = NODE_IDS;
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [overallStatus, setOverallStatus] = useState('pending');
  const [serverElapsed, setServerElapsed] = useState(0);
  const [localElapsed, setLocalElapsed] = useState(0);
  const [hostProgress, setHostProgress] = useState('');
  const isSimpleJob = useRef(false);
  const completeFired = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  // Independent 1s tick for smooth elapsed display
  const isTerminal = ['successful', 'failed', 'error', 'canceled'].includes(
    overallStatus,
  );
  useEffect(() => {
    if (isTerminal) return undefined;
    const tick = setInterval(() => setLocalElapsed(prev => prev + 1), 1000);
    return () => clearInterval(tick);
  }, [isTerminal]);

  // Sync local elapsed with server on each poll
  useEffect(() => {
    setLocalElapsed(serverElapsed);
  }, [serverElapsed]);

  // Pause polling when tab is hidden
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    if (!visible || isTerminal) return undefined;
    let cancelled = false;

    const pollStatus = async () => {
      try {
        const status = await api.getWorkflowStatus(workflowJobId);
        if (cancelled) return;

        setOverallStatus(status.status);
        setServerElapsed(status.elapsed);

        let mapped: NodeStatus[];
        const wfNodes = isSimpleJob.current
          ? []
          : await api.getWorkflowNodes(workflowJobId);
        if (cancelled) return;

        if (wfNodes.length > 0) {
          mapped = nodeIds.map(id => {
            const node = wfNodes.find(
              n =>
                n.identifier === id ||
                n.summary_fields?.unified_job_template?.name
                  ?.toLowerCase()
                  .includes(id.replace('-', ' ')),
            );
            const job = node?.summary_fields?.job;
            return {
              identifier: id,
              status: job?.status ?? 'pending',
              jobId: job?.id,
            };
          });
        } else {
          isSimpleJob.current = true;
          mapped = [
            {
              identifier: 'run-oscap',
              status: status.status,
              jobId: workflowJobId,
            },
          ];
        }
        setNodes(mapped);

        const runningNode = mapped.find(
          n => n.status === 'running' || n.status === 'waiting',
        );
        if (runningNode?.jobId) {
          try {
            const events = await api.getJobEvents(runningNode.jobId);
            if (!cancelled) {
              const remoteHosts = new Set(
                events
                  .filter(e => e.host_name && e.host_name !== 'localhost')
                  .map(e => e.host_name),
              );
              const hasLocalhostEvents = events.some(
                e => e.host_name === 'localhost',
              );
              if (hasLocalhostEvents && remoteHosts.size > 0) {
                setHostProgress(
                  `Processing results from ${remoteHosts.size} host${
                    remoteHosts.size !== 1 ? 's' : ''
                  }...`,
                );
              } else if (remoteHosts.size > 0) {
                setHostProgress(
                  `Scanning: ${remoteHosts.size} host${
                    remoteHosts.size !== 1 ? 's' : ''
                  } completed`,
                );
              } else {
                setHostProgress('Initializing scan...');
              }
            }
          } catch {
            // Job events may not be available yet — expected during startup
          }
        }

        const terminal = ['successful', 'failed', 'error', 'canceled'];
        if (terminal.includes(status.status) && !completeFired.current) {
          completeFired.current = true;
          if (status.status === 'successful') {
            onCompleteRef.current?.();
          } else {
            onFailedRef.current?.(status.status);
          }
        }
      } catch {
        // API not available — will retry on next poll interval
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 5_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [api, workflowJobId, visible, isTerminal, nodeIds, steps]);

  const terminal = ['successful', 'failed', 'error', 'canceled'];
  const isFailed =
    overallStatus === 'failed' ||
    overallStatus === 'error' ||
    overallStatus === 'canceled';
  if (
    overallStatus === 'successful' &&
    nodes.every(n => terminal.includes(n.status))
  ) {
    return null;
  }

  const progress = computeProgress(nodes);
  const activeStep = nodes.filter(
    n =>
      n.status === 'successful' ||
      n.status === 'failed' ||
      n.status === 'error',
  ).length;

  return (
    <Box className={classes.root}>
      <Paper className={classes.paper} variant="outlined">
        <Box className={classes.header}>
          <Typography variant="subtitle1">
            {isFailed ? (
              <StatusError />
            ) : (
              <CircularProgress
                size={18}
                thickness={4}
                style={{ marginRight: 8 }}
              />
            )}{' '}
            {(() => {
              if (scanType === 'verification') return 'Verification Scan';
              if (scanType === 'remediation') return 'Remediation';
              return 'Assessment Scan';
            })()}
            {profileName ? `: ${profileName}` : ''}
          </Typography>
          <Chip
            size="small"
            label={isFailed ? `Scan ${overallStatus}` : overallStatus}
            color={(() => {
              if (isFailed) return 'secondary' as const;
              if (overallStatus === 'running') return 'primary' as const;
              return 'default' as const;
            })()}
          />
        </Box>

        <Stepper activeStep={activeStep} alternativeLabel>
          {steps.map((label, i) => {
            const node = nodes[i];
            return (
              <Step key={label} completed={node?.status === 'successful'}>
                <StepLabel
                  error={node?.status === 'failed' || node?.status === 'error'}
                  icon={node ? nodeStatusIcon(node.status) : <StatusPending />}
                >
                  {isFailed ? 'Scan Failed' : label}
                </StepLabel>
              </Step>
            );
          })}
        </Stepper>

        <LinearProgress
          variant="determinate"
          value={progress}
          className={classes.progressBar}
        />

        <Box className={classes.footer}>
          <Typography variant="body2" color="textSecondary">
            {hostProgress || `${progress}% complete`}
          </Typography>
          <Typography variant="body2" className={classes.elapsed}>
            Elapsed: {formatElapsed(localElapsed)}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};
