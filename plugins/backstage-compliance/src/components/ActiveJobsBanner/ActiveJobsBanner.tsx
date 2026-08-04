import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { StatusRunning, StatusPending } from '@backstage/core-components';
import {
  Box,
  Typography,
  Chip,
  Paper,
  LinearProgress,
  IconButton,
  makeStyles,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import { useApi } from '@backstage/core-plugin-api';
import { complianceApiRef } from '../../api';
import { formatElapsed } from '../shared/formatTime';
import type {
  ComplianceScan,
  RemediationExecution,
} from '@ansible/backstage-compliance-common/types';

const useStyles = makeStyles(theme => ({
  root: {
    position: 'fixed',
    bottom: 0,
    left: 248,
    right: 0,
    zIndex: 1300,
    padding: theme.spacing(0.5, 2),
    backgroundColor: theme.palette.background.paper,
    borderTop: `1px solid ${theme.palette.divider}`,
    boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
    [theme.breakpoints.down('md')]: {
      left: 72,
    },
  },
  banner: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0.75, 1.5),
    marginBottom: theme.spacing(0.5),
    cursor: 'pointer',
    '&:last-child': {
      marginBottom: 0,
    },
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  statusSection: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    minWidth: 180,
  },
  progressSection: {
    flex: 1,
    marginLeft: theme.spacing(2),
    marginRight: theme.spacing(2),
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  elapsed: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    minWidth: 50,
    textAlign: 'right' as const,
  },
  dismissButton: {
    marginLeft: theme.spacing(1),
    padding: theme.spacing(0.5),
  },
}));

/** Format seconds into human-readable elapsed time. */
function scanTypeLabel(scan: ComplianceScan): string {
  if (scan.scanType === 'verification') return 'Verification Scan';
  return 'Assessment Scan';
}

type ActiveItem =
  | {
      kind: 'scan';
      scan: ComplianceScan;
      id: string;
      elapsed: number;
      startTime: number;
    }
  | {
      kind: 'execution';
      execution: RemediationExecution;
      id: string;
      elapsed: number;
      startTime: number;
    };

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export const ActiveJobsBanner = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const api = useApi(complianceApiRef);
  const [activeItems, setActiveItems] = useState<ActiveItem[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(true);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dismissJob = useCallback((id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  }, []);

  // Track tab visibility for polling pause
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Poll for active scans and executions
  useEffect(() => {
    if (!visible) return undefined;

    let cancelled = false;

    const poll = async () => {
      try {
        const [scans, executions] = await Promise.all([
          api.getScans(),
          api.getAllRecentExecutions(20),
        ]);
        if (cancelled) return;

        const cutoff = Date.now() - TWO_HOURS_MS;
        const now = Date.now();

        const activeScanItems: ActiveItem[] = scans
          .filter(
            s =>
              s.scanner !== 'remediation' &&
              (s.status === 'pending' || s.status === 'running') &&
              new Date(s.startedAt).getTime() > cutoff,
          )
          .map(scan => ({
            kind: 'scan' as const,
            scan,
            id: `scan-${scan.id}`,
            elapsed: (now - new Date(scan.startedAt).getTime()) / 1000,
            startTime: new Date(scan.startedAt).getTime(),
          }));

        const activeExecItems: ActiveItem[] = executions
          .filter(
            e =>
              (e.status === 'pending' || e.status === 'running') &&
              new Date(e.startedAt).getTime() > cutoff,
          )
          .map(exec => ({
            kind: 'execution' as const,
            execution: exec,
            id: `exec-${exec.id}`,
            elapsed: (now - new Date(exec.startedAt).getTime()) / 1000,
            startTime: new Date(exec.startedAt).getTime(),
          }));

        const combined = [...activeScanItems, ...activeExecItems].sort(
          (a, b) => b.startTime - a.startTime,
        );

        setActiveItems(combined);
      } catch {
        // API not available — will retry on next poll
      }
    };

    poll();
    const interval = setInterval(poll, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [api, visible]);

  // Tick elapsed time every second for smooth display
  useEffect(() => {
    if (activeItems.length === 0) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return undefined;
    }

    tickRef.current = setInterval(() => {
      setActiveItems(prev =>
        prev.map(item => ({
          ...item,
          elapsed: (Date.now() - item.startTime) / 1000,
        })),
      );
    }, 1000);

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [activeItems.length]);

  const visibleItems = activeItems.filter(item => !dismissedIds.has(item.id));

  if (visibleItems.length === 0) return null;

  return (
    <Box className={classes.root}>
      {visibleItems.map(item => {
        const isRunning =
          item.kind === 'scan'
            ? item.scan.status === 'running'
            : item.execution.status === 'running';
        const label =
          item.kind === 'scan' ? scanTypeLabel(item.scan) : 'Remediation';

        return (
          <Paper
            key={item.id}
            variant="outlined"
            className={classes.banner}
            onClick={() => {
              if (item.kind === 'scan') {
                const id = item.scan.workflowJobId ?? item.scan.id;
                const target = `/compliance/results/${id}`;
                if (location.pathname.endsWith(target)) return;
                navigate(target);
              } else {
                const id = item.execution.primaryJobId ?? item.execution.id;
                navigate(`/compliance/remediation-result/${id}`);
              }
            }}
          >
            <Box className={classes.statusSection}>
              {isRunning ? <StatusRunning /> : <StatusPending />}
              <Typography variant="body2" style={{ fontWeight: 500 }}>
                {label}
              </Typography>
              <Chip
                size="small"
                label={isRunning ? 'Running' : 'Pending'}
                color={isRunning ? 'primary' : 'default'}
                variant="outlined"
              />
            </Box>

            <Box className={classes.progressSection}>
              {isRunning && <LinearProgress className={classes.progressBar} />}
            </Box>

            <Typography variant="body2" className={classes.elapsed}>
              {formatElapsed(item.elapsed)}
            </Typography>

            <IconButton
              className={classes.dismissButton}
              size="small"
              onClick={e => {
                e.stopPropagation();
                dismissJob(item.id);
              }}
              aria-label="Dismiss job notification"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Paper>
        );
      })}
    </Box>
  );
};
