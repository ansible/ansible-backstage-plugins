/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  Box,
  Button,
  Chip,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  makeStyles,
} from '@material-ui/core';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CircularProgress from '@material-ui/core/CircularProgress';
import type { Activity } from '@ansible/backstage-apme-common/types';

const SOURCE_LABELS: Record<string, string> = {
  cli: 'CLI',
  ci: 'CI',
  gateway: 'Manual',
};

const useStyles = makeStyles(theme => ({
  root: {
    marginBottom: theme.spacing(2),
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(2),
  },
  table: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
  },
  th: {
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    color: theme.palette.text.secondary,
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
  },
  latestChip: {
    height: 18,
    fontSize: 10,
    fontWeight: 600,
    marginLeft: theme.spacing(0.5),
  },
  spinIcon: {
    animation: '$spin 1s linear infinite',
  },
  '@keyframes spin': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
}));

function formatScanDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export interface ScanHistoryViewProps {
  activity: Activity[];
  scanning?: boolean;
  onBack: () => void;
  onScan?: () => void;
}

export const ScanHistoryView = ({
  activity,
  scanning,
  onBack,
  onScan,
}: ScanHistoryViewProps) => {
  const classes = useStyles();

  return (
    <Box className={classes.root}>
      <Box className={classes.header}>
        <Button
          size="small"
          startIcon={<ChevronLeftIcon />}
          onClick={onBack}
          style={{ textTransform: 'none' }}
        >
          Back to latest scan
        </Button>
        {onScan && (
          <Button
            size="small"
            variant="outlined"
            startIcon={
              scanning ? (
                <CircularProgress size={14} className={classes.spinIcon} />
              ) : (
                <AutorenewIcon style={{ fontSize: 14 }} />
              )
            }
            disabled={scanning}
            onClick={onScan}
            style={{ textTransform: 'none', borderRadius: 20 }}
          >
            {scanning ? 'Scanning…' : 'Scan'}
          </Button>
        )}
      </Box>

      {activity.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No scan history yet.
        </Typography>
      ) : (
        <Table size="small" className={classes.table}>
          <TableHead>
            <TableRow>
              <TableCell className={classes.th}>Date</TableCell>
              <TableCell className={classes.th}>Trigger</TableCell>
              <TableCell className={classes.th}>Type</TableCell>
              <TableCell className={classes.th}>Violations</TableCell>
              <TableCell className={classes.th}>Remediation</TableCell>
              <TableCell className={classes.th} align="right">
                PR
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {activity.map((scan, idx) => {
              const isLatest = idx === 0;
              const remaining = scan.total_violations - scan.remediated_count;
              const allResolved = scan.total_violations > 0 && remaining <= 0;
              const trigger =
                SOURCE_LABELS[scan.source?.toLowerCase()] ?? scan.source ?? '—';

              return (
                <TableRow key={scan.scan_id}>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <Typography
                        variant="body2"
                        style={{ fontWeight: isLatest ? 600 : 400 }}
                      >
                        {formatScanDate(scan.created_at)}
                      </Typography>
                      {isLatest && (
                        <Chip
                          label="Latest"
                          size="small"
                          className={classes.latestChip}
                          color="primary"
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="textSecondary">
                      {trigger}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      style={{ textTransform: 'capitalize' }}
                    >
                      {scan.scan_type}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {allResolved ? (
                      <Box
                        display="flex"
                        alignItems="center"
                        style={{ gap: 4 }}
                      >
                        <CheckCircleIcon
                          style={{ fontSize: 14, color: '#4caf50' }}
                        />
                        <Typography
                          variant="body2"
                          style={{ color: '#4caf50', fontWeight: 500 }}
                        >
                          All resolved
                        </Typography>
                      </Box>
                    ) : scan.remediated_count > 0 ? (
                      <Typography variant="body2">
                        {remaining} unresolved / {scan.total_violations}
                      </Typography>
                    ) : (
                      <Typography variant="body2">
                        {scan.total_violations} found
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="textSecondary">
                      {scan.fixable > 0 ? `${scan.fixable} auto-fixable` : '—'}
                      {scan.remediated_count > 0
                        ? ` · ${scan.remediated_count} fixed`
                        : ''}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {scan.pr_url ? (
                      <Link
                        href={scan.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="body2"
                      >
                        View PR
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  );
};
