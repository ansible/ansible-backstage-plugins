/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useCallback, useState, Fragment } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  makeStyles,
} from '@material-ui/core';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import { useApi } from '@backstage/core-plugin-api';
import type {
  Activity,
  ActivityDetail,
} from '@ansible/backstage-apme-common/types';
import type { ReactNode } from 'react';
import { apmeApiRef } from '../../api';
import { buildGithubBranchUrl } from '../../utils/githubCompareUrl';
import {
  BranchFileChangesPanel,
  type BranchFileChange,
} from '../BranchFileChangesPanel';

const SOURCE_LABELS: Record<string, string> = {
  cli: 'CLI',
  ci: 'CI',
  gateway: 'Manual',
};

export type { BranchFileChange };

function githubReviewHint(
  prUrl: string | null | undefined,
  branchUrl: string | null | undefined,
): string {
  if (prUrl) {
    return ' See the PR column for the GitHub diff.';
  }
  if (branchUrl) {
    return ' Open the branch link to review on GitHub.';
  }
  return '';
}

function renderViolationSummary(
  scan: Activity,
  remaining: number,
  allResolved: boolean,
): ReactNode {
  if (allResolved) {
    return (
      <Box display="flex" alignItems="center" style={{ gap: 4 }}>
        <CheckCircleIcon style={{ fontSize: 14, color: '#4caf50' }} />
        <Typography
          variant="body2"
          style={{ color: '#4caf50', fontWeight: 500 }}
        >
          All resolved
        </Typography>
      </Box>
    );
  }
  if (scan.remediated_count > 0) {
    return (
      <Typography variant="body2">
        {remaining} unresolved / {scan.total_violations}
      </Typography>
    );
  }
  return <Typography variant="body2">{scan.total_violations} found</Typography>;
}

function statusLabel(scan: Activity): { label: string; ok: boolean } {
  if (scan.scan_type === 'remediate' && scan.pr_url) {
    return { label: 'PR opened', ok: true };
  }
  if (scan.scan_type === 'remediate' && scan.remediated_count > 0) {
    return { label: 'Remediated', ok: true };
  }
  if (scan.total_violations === 0) {
    return { label: 'Clean', ok: true };
  }
  return { label: 'Completed', ok: true };
}

function formatScanDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function resolveRemediationLinks(
  scan: Activity,
  repoUrl: string | null | undefined,
  isCurrentRemedia: boolean,
  currentBranchName?: string | null,
): {
  branchName: string | null;
  branchUrl: string | null;
  prUrl: string | null;
} {
  const branchName =
    scan.branch_name?.trim() ||
    (isCurrentRemedia ? currentBranchName?.trim() : null) ||
    null;
  const prUrl = scan.pr_url?.trim() || null;
  const branchUrl = buildGithubBranchUrl(repoUrl, branchName);

  return { branchName, branchUrl, prUrl };
}

function renderBranchName(
  branchName: string,
  branchUrl: string | null,
  className: string,
): ReactNode {
  if (branchUrl) {
    return (
      <Link
        href={branchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title={branchName}
      >
        {branchName}
      </Link>
    );
  }
  return (
    <Typography variant="body2" className={className} title={branchName}>
      {branchName}
    </Typography>
  );
}

function renderBranchCell(
  branchName: string | null,
  branchUrl: string | null,
  branchClassName: string,
): ReactNode {
  if (!branchName) {
    return (
      <Typography variant="body2" color="textSecondary">
        —
      </Typography>
    );
  }
  return renderBranchName(branchName, branchUrl, branchClassName);
}

function extractPrNumber(prUrl: string): string | null {
  const match = prUrl.match(/\/pull\/(\d+)/);
  return match ? match[1] : null;
}

function renderPrCell(
  prUrl: string | null,
  className: string,
): ReactNode {
  if (!prUrl) {
    return (
      <Typography variant="body2" color="textSecondary">
        —
      </Typography>
    );
  }
  const prNumber = extractPrNumber(prUrl);
  return (
    <Link
      href={prUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={prUrl}
    >
      {prNumber ? `#${prNumber}` : 'View PR'}
    </Link>
  );
}

const useStyles = makeStyles(theme => ({
  root: {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    boxSizing: 'border-box',
  },
  pageHeader: {
    marginBottom: theme.spacing(2),
    flexShrink: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: theme.spacing(0.5),
  },
  subtitle: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    flexShrink: 0,
  },
  tablePanel: {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
    backgroundColor: theme.palette.background.paper,
  },
  tableContainer: {
    width: '100%',
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
  },
  th: {
    fontWeight: 600,
  },
  latestChip: {
    height: 18,
    fontSize: 10,
    fontWeight: 600,
    marginLeft: theme.spacing(0.5),
  },
  actionLink: {
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  expandCell: {
    paddingBottom: 0,
    paddingTop: 0,
    borderBottom: 'none',
  },
  expandColumn: {
    width: 40,
    maxWidth: 40,
    paddingLeft: theme.spacing(0.5),
    paddingRight: theme.spacing(0.5),
  },
  detailPanel: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(1),
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.03)'
        : theme.palette.grey[50],
    borderRadius: theme.shape.borderRadius,
  },
  statusCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    textTransform: 'capitalize',
  },
  branchName: {
    fontFamily: 'monospace',
    fontSize: 12,
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
  },
}));

export interface ScanHistoryViewProps {
  activity: Activity[];
  onBack: () => void;
  repoUrl?: string | null;
  /** Activity id for the remedia run that produced fileDiffs in this session. */
  currentRemediationActivityId?: string | null;
  /** In-session file diffs for the current remedia (shown when that row is expanded). */
  currentBranchFileChanges?: BranchFileChange[];
  /** Branch name for the current remediation session (before portal persist). */
  currentBranchName?: string | null;
}

export const ScanHistoryView = ({
  activity,
  onBack,
  repoUrl,
  currentRemediationActivityId,
  currentBranchFileChanges = [],
  currentBranchName,
}: ScanHistoryViewProps) => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<
    Record<string, ActivityDetail | 'loading' | 'error'>
  >({});

  const paged = activity.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  const loadDetail = useCallback(
    async (scanId: string) => {
      setDetailById(prev => ({ ...prev, [scanId]: 'loading' }));
      try {
        const detail = await apmeApi.getActivityDetail(scanId);
        setDetailById(prev => ({ ...prev, [scanId]: detail }));
      } catch {
        setDetailById(prev => ({ ...prev, [scanId]: 'error' }));
      }
    },
    [apmeApi],
  );

  const toggleExpand = (scanId: string) => {
    if (expandedId === scanId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(scanId);
    if (!detailById[scanId]) {
      void loadDetail(scanId);
    }
  };

  return (
    <Box className={classes.root}>
      <div className={classes.pageHeader}>
        <Typography className={classes.title}>Quality scan history</Typography>
        <Typography variant="body2" className={classes.subtitle}>
          Past scans and remediations for this repository — same idea as the
          self-service task list.
        </Typography>
      </div>

      <Box className={classes.toolbar}>
        <Button
          size="small"
          startIcon={<ChevronLeftIcon />}
          onClick={onBack}
          style={{ textTransform: 'none' }}
        >
          Back to latest scan
        </Button>
      </Box>

      {activity.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No scan history yet.
        </Typography>
      ) : (
        <div className={classes.tablePanel}>
          <TableContainer className={classes.tableContainer}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell className={classes.th}>Scan ID</TableCell>
                  <TableCell className={classes.th}>Type</TableCell>
                  <TableCell className={classes.th}>Created at</TableCell>
                  <TableCell className={classes.th}>Trigger</TableCell>
                  <TableCell className={classes.th}>Violations</TableCell>
                  <TableCell className={classes.th}>Status</TableCell>
                  <TableCell className={classes.th}>Branch</TableCell>
                  <TableCell className={classes.th}>PR</TableCell>
                  <TableCell
                    className={classes.expandColumn}
                    align="right"
                    aria-label="Expand row"
                  />
                </TableRow>
              </TableHead>
              <TableBody>
                {paged.map((scan, idx) => {
                  const globalIdx = page * rowsPerPage + idx;
                  const isLatest = globalIdx === 0;
                  const remaining =
                    scan.total_violations - scan.remediated_count;
                  const allResolved =
                    scan.total_violations > 0 && remaining <= 0;
                  const trigger =
                    SOURCE_LABELS[scan.source?.toLowerCase()] ??
                    scan.source ??
                    '—';
                  const status = statusLabel(scan);
                  const isExpanded = expandedId === scan.scan_id;
                  const isCurrentRemedia =
                    Boolean(currentRemediationActivityId) &&
                    scan.scan_id === currentRemediationActivityId;
                  const { branchName, branchUrl, prUrl } = resolveRemediationLinks(
                    scan,
                    repoUrl,
                    isCurrentRemedia,
                    currentBranchName,
                  );
                  const canExpand =
                    scan.scan_type === 'remediate' ||
                    scan.remediated_count > 0 ||
                    Boolean(prUrl) ||
                    Boolean(branchName) ||
                    isCurrentRemedia;

                  return (
                    <Fragment key={scan.scan_id}>
                      <TableRow hover>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            <Typography variant="body2">
                              {scan.scan_id.slice(0, 8)}…
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
                          <Typography
                            variant="body2"
                            style={{ textTransform: 'capitalize' }}
                          >
                            {scan.scan_type}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatScanDate(scan.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="textSecondary">
                            {trigger}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {renderViolationSummary(
                            scan,
                            remaining,
                            allResolved,
                          )}
                        </TableCell>
                        <TableCell>
                          <div className={classes.statusCell}>
                            {status.ok ? (
                              <CheckCircleOutlineIcon
                                style={{ fontSize: 18, color: 'green' }}
                              />
                            ) : (
                              <ErrorOutlineIcon
                                style={{ fontSize: 18, color: 'red' }}
                              />
                            )}
                            <Typography variant="body2">
                              {status.label}
                            </Typography>
                          </div>
                        </TableCell>
                        <TableCell>
                          {renderBranchCell(
                            branchName,
                            branchUrl,
                            classes.branchName,
                          )}
                        </TableCell>
                        <TableCell>
                          {renderPrCell(prUrl, classes.actionLink)}
                        </TableCell>
                        <TableCell
                          className={classes.expandColumn}
                          align="right"
                          padding="checkbox"
                        >
                          {canExpand ? (
                            <IconButton
                              size="small"
                              onClick={() => toggleExpand(scan.scan_id)}
                              aria-label={
                                isExpanded
                                  ? 'Collapse scan details'
                                  : 'Expand scan details'
                              }
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? (
                                <ExpandLessIcon fontSize="small" />
                              ) : (
                                <ExpandMoreIcon fontSize="small" />
                              )}
                            </IconButton>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {canExpand && (
                        <TableRow>
                          <TableCell
                            className={classes.expandCell}
                            colSpan={9}
                          >
                            <Collapse
                              in={isExpanded}
                              timeout="auto"
                              unmountOnExit
                            >
                              <Box className={classes.detailPanel}>
                                {isCurrentRemedia &&
                                  currentBranchFileChanges.length > 0 && (
                                    <BranchFileChangesPanel
                                      title="Changes on branch (this session)"
                                      subtitle=""
                                      files={currentBranchFileChanges}
                                      defaultExpanded
                                    />
                                  )}
                                {(() => {
                                  const detail = detailById[scan.scan_id];
                                  if (detail === 'loading') {
                                    return (
                                      <Typography
                                        variant="body2"
                                        color="textSecondary"
                                      >
                                        Loading activity detail…
                                      </Typography>
                                    );
                                  }
                                  if (detail === 'error') {
                                    return (
                                      <Typography
                                        variant="body2"
                                        color="textSecondary"
                                      >
                                        Could not load activity detail.
                                        {githubReviewHint(prUrl, branchUrl)}
                                      </Typography>
                                    );
                                  }
                                  if (
                                    detail &&
                                    typeof detail === 'object' &&
                                    detail.proposals?.length > 0
                                  ) {
                                    return (
                                      <>
                                        <Typography
                                          variant="subtitle2"
                                          gutterBottom
                                          style={{ marginTop: 8 }}
                                        >
                                          Proposals ({detail.proposals.length})
                                        </Typography>
                                        <Table size="small">
                                          <TableHead>
                                            <TableRow>
                                              <TableCell>File</TableCell>
                                              <TableCell>Rule</TableCell>
                                              <TableCell>Tier</TableCell>
                                              <TableCell>Status</TableCell>
                                            </TableRow>
                                          </TableHead>
                                          <TableBody>
                                            {detail.proposals.map(p => (
                                              <TableRow key={p.proposal_id}>
                                                <TableCell>
                                                  <Typography
                                                    variant="body2"
                                                    style={{
                                                      fontFamily: 'monospace',
                                                      fontSize: 12,
                                                    }}
                                                  >
                                                    {p.file}
                                                  </Typography>
                                                </TableCell>
                                                <TableCell>
                                                  <Typography variant="body2">
                                                    {p.rule_id}
                                                  </Typography>
                                                </TableCell>
                                                <TableCell>
                                                  {p.tier}
                                                </TableCell>
                                                <TableCell>
                                                  {p.status}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </>
                                    );
                                  }
                                  if (
                                    !(
                                      isCurrentRemedia &&
                                      currentBranchFileChanges.length > 0
                                    )
                                  ) {
                                    return (
                                      <Typography
                                        variant="body2"
                                        color="textSecondary"
                                      >
                                        {scan.fixable > 0
                                          ? `${scan.fixable} auto-fixable`
                                          : 'No proposal list for this run.'}
                                        {scan.remediated_count > 0
                                          ? ` · ${scan.remediated_count} fixed`
                                          : ''}
                                        {githubReviewHint(prUrl, branchUrl)}
                                      </Typography>
                                    );
                                  }
                                  return null;
                                })()}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={activity.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={e => {
              setRowsPerPage(Number.parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25]}
          />
        </div>
      )}
    </Box>
  );
};
