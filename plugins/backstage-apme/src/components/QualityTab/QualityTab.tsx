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

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useAsyncRetry } from 'react-use';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import RefreshIcon from '@material-ui/icons/Refresh';
import CodeIcon from '@material-ui/icons/Code';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import { buildDevSpacesUrlFromRepoUrl } from '@ansible/backstage-rhaap-common/devSpaces';
import { Project, Violation } from '@ansible/backstage-apme-common/types';
import {
  isTerminalOperationState,
  formatOperationError,
  latestOperationProgressMessage,
  projectHasActiveOperation,
} from '@ansible/backstage-apme-common/operationStatus';
import { effectiveFixType } from '@ansible/backstage-apme-common/severity';
import { useApmeAiEnabled } from '../../hooks/useApmeEnabled';
import { useApmeScanTargetLabel } from '../../hooks/useApmeScanTargetLabel';
import { apmeApiRef } from '../../api';
import { ApmeUnavailable } from '../ApmeUnavailable';
import {
  APME_GATEWAY_UNAVAILABLE_MESSAGE,
  isApmeConnectionError,
} from '../../utils/apmeConnectionError';

const useStyles = makeStyles(theme => ({
  summary: {
    marginBottom: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
  },
  filters: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
  },
  formControl: {
    minWidth: 140,
  },
  scanPanel: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.grey[900]
        : theme.palette.grey[100],
    padding: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    whiteSpace: 'pre-wrap',
    overflowX: 'auto',
  },
  highlightLine: {
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(244, 67, 54, 0.15)' : '#ffebee',
  },
  fixAuto: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
  },
  fixAi: {
    backgroundColor: theme.palette.info.main,
    color: theme.palette.info.contrastText,
  },
  fixManual: {
    backgroundColor: theme.palette.grey[500],
    color: theme.palette.common.white,
  },
}));

const levelOrder: Record<string, number> = {
  blocker: 0,
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
  info: 5,
};

const fixTypeLabel = (remediationClass: number): string => {
  if (remediationClass === 1) return 'Auto';
  if (remediationClass === 2) return 'AI';
  if (remediationClass === 3) return 'Manual';
  return 'Manual';
};

const fixTypeTooltip = (remediationClass: number): string => {
  if (remediationClass === 1) {
    return 'Safe deterministic auto-fix';
  }
  if (remediationClass === 2) {
    return 'AI-generated proposal — review required';
  }
  return 'Manual fix required';
};
const fixTypeClass = (
  classes: ReturnType<typeof useStyles>,
  remediationClass: number,
): string => {
  if (remediationClass === 1) return classes.fixAuto;
  if (remediationClass === 2) return classes.fixAi;
  return classes.fixManual;
};

function formatQualityLastChecked(scanning: boolean, project: Project): string {
  if (scanning || projectHasActiveOperation(project)) {
    return 'Scan in progress…';
  }
  if (project.last_scanned_at) {
    return new Date(project.last_scanned_at).toLocaleString();
  }
  return 'Never';
}

export interface QualityTabProps {
  repoUrl?: string | null;
  branch?: string;
  projectId?: string;
  /** Pre-filter violations by rule (Inc 10 fleet drill-down). */
  initialRuleFilter?: string;
}

export const QualityTab = ({
  repoUrl,
  branch,
  projectId,
  initialRuleFilter,
}: QualityTabProps) => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const configApi = useApi(configApiRef);
  const enableAi = useApmeAiEnabled();
  const [scanning, setScanning] = useState(false);
  const [expectActiveScan, setExpectActiveScan] = useState(false);
  const [scanProgressMessage, setScanProgressMessage] = useState<string | null>(
    null,
  );
  const [scanError, setScanError] = useState<Error | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<Error | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [levelFilter, setLevelFilter] = useState('all');
  const [fixFilter, setFixFilter] = useState('all');
  const [ruleFilter, setRuleFilter] = useState<string | null>(
    initialRuleFilter ?? null,
  );
  const [remediationPhase, setRemediationPhase] = useState<
    'idle' | 'generating' | 'review' | 'pr'
  >('idle');
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const {
    value: data,
    loading,
    error,
    retry,
  } = useAsyncRetry(async () => {
    let project: Project | null = null;
    if (projectId) {
      project = await apmeApi.getProject(projectId);
    } else if (repoUrl) {
      project = await apmeApi.getProjectByRepoUrl(repoUrl, branch);
    }
    if (!project) {
      return { project: null, violations: [] as Violation[] };
    }
    const violations = await apmeApi.getViolations(project.id);
    return { project, violations };
  }, [repoUrl, branch, projectId, apmeApi]);

  const project = data?.project ?? null;
  const violations = useMemo(() => data?.violations ?? [], [data?.violations]);

  const { value: dependencies } = useAsyncRetry(async () => {
    if (!project?.id) return null;
    return apmeApi.getProjectDependencies(project.id);
  }, [project?.id, apmeApi]);

  const scanTargetLabel = useApmeScanTargetLabel(
    dependencies?.ansible_core_version,
  );

  useEffect(() => {
    if (!project?.id) {
      return undefined;
    }
    if (projectHasActiveOperation(project)) {
      setExpectActiveScan(true);
      setScanning(true);
      setScanError(null);
      return undefined;
    }
    let cancelled = false;
    void apmeApi.getOperationState(project.id).then(state => {
      if (cancelled) {
        return;
      }
      if (state?.status === 'failed') {
        setScanning(false);
        setExpectActiveScan(false);
        setScanProgressMessage(null);
        setScanError(new Error(formatOperationError(state.error)));
        return;
      }
      const active = state && !isTerminalOperationState(state, 0);
      const progressMessage = latestOperationProgressMessage(state);
      if (progressMessage) {
        setScanProgressMessage(progressMessage);
      }
      if (active) {
        setExpectActiveScan(true);
        setScanning(true);
        setScanError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project, apmeApi]);

  useEffect(() => {
    if (!scanning || !project?.id) {
      return undefined;
    }

    let pollCount = 0;
    const maxPolls = 180;

    const pollInterval = setInterval(async () => {
      pollCount += 1;
      try {
        const state = await apmeApi.getOperationState(project.id);
        const progressMessage = latestOperationProgressMessage(state);
        if (progressMessage) {
          setScanProgressMessage(progressMessage);
        }
        const completed = isTerminalOperationState(
          state,
          pollCount,
          2,
          expectActiveScan,
        );

        if (completed) {
          clearInterval(pollInterval);
          setScanning(false);
          setExpectActiveScan(false);
          setScanProgressMessage(null);
          if (state?.status === 'failed') {
            setScanError(new Error(formatOperationError(state.error)));
          }
          retry();
        }
      } catch (pollError) {
        clearInterval(pollInterval);
        setScanning(false);
        setExpectActiveScan(false);
        setScanProgressMessage(null);
        setScanError(
          pollError instanceof Error
            ? pollError
            : new Error('Scan polling failed'),
        );
      }

      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        setScanning(false);
        setExpectActiveScan(false);
        setScanProgressMessage(null);
        setScanError(new Error('Scan timed out. Try again in a moment.'));
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [scanning, project?.id, apmeApi, retry, expectActiveScan]);

  const filteredViolations = useMemo(
    () =>
      violations
        .filter(v => !ruleFilter || v.rule_id === ruleFilter)
        .filter(v => levelFilter === 'all' || v.level === levelFilter)
        .filter(v => {
          if (fixFilter === 'all') return true;
          const ft = effectiveFixType(v.remediation_class, enableAi);
          if (fixFilter === 'auto') return ft === 'auto';
          if (fixFilter === 'ai') return ft === 'ai';
          if (fixFilter === 'manual') return ft === 'manual';
          return true;
        })
        .sort(
          (a, b) => (levelOrder[a.level] ?? 99) - (levelOrder[b.level] ?? 99),
        ),
    [violations, levelFilter, fixFilter, ruleFilter, enableAi],
  );

  useEffect(() => {
    if (initialRuleFilter) {
      setRuleFilter(initialRuleFilter);
    }
  }, [initialRuleFilter]);

  useEffect(() => {
    if (
      ruleFilter &&
      filteredViolations.length > 0 &&
      filteredViolations.length <= 3
    ) {
      setExpandedId(filteredViolations[0].id);
    }
  }, [ruleFilter, filteredViolations]);

  const autoFixableCount = violations.filter(
    v => v.remediation_class === 1,
  ).length;
  const aiCount = violations.filter(
    v => effectiveFixType(v.remediation_class, enableAi) === 'ai',
  ).length;

  const handleScan = useCallback(async () => {
    if (!project) return;
    setScanError(null);
    if (projectHasActiveOperation(project)) {
      setExpectActiveScan(true);
      setScanning(true);
      return;
    }
    setScanning(true);
    setExpectActiveScan(true);
    try {
      await apmeApi.triggerScan(project.id);
    } catch (err) {
      setScanError(err as Error);
      setScanning(false);
      setExpectActiveScan(false);
    }
  }, [project, apmeApi]);

  const handleRegister = useCallback(async () => {
    if (!repoUrl) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      const segments = repoUrl
        .replace(/\.git$/, '')
        .split('/')
        .filter(Boolean);
      const name = segments[segments.length - 1] || 'repository';
      const newProject = await apmeApi.createProject({
        name,
        repo_url: repoUrl,
        branch: branch || 'main',
      });
      await apmeApi.triggerScan(newProject.id);
      setExpectActiveScan(true);
      setScanning(true);
      retry();
    } catch (err) {
      setRegisterError(err as Error);
    } finally {
      setRegistering(false);
    }
  }, [apmeApi, repoUrl, retry]);

  const devSpacesBaseUrl = configApi.getOptionalString(
    'ansible.devSpaces.baseUrl',
  );
  const openDevSpaces = useCallback(() => {
    if (!devSpacesBaseUrl || !repoUrl) return;
    const url = buildDevSpacesUrlFromRepoUrl(devSpacesBaseUrl, repoUrl);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [devSpacesBaseUrl, repoUrl]);

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSuggestFixes = async () => {
    if (!project || selectedIds.size === 0) return;
    setRemediationPhase('generating');
    try {
      await apmeApi.triggerRemediate(project.id);
      setRemediationPhase('review');
    } catch (err) {
      setScanError(err as Error);
      setRemediationPhase('idle');
    }
  };

  const handleCreatePr = async () => {
    if (!project) return;
    const activity = await apmeApi.getActivity(project.id);
    const latest = activity[0];
    if (!latest?.scan_id) return;
    try {
      const result = await apmeApi.createPullRequest(
        project.id,
        latest.scan_id,
      );
      setPrUrl(result.pr_url);
      setRemediationPhase('pr');
    } catch (err) {
      setScanError(err as Error);
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error) {
    const message = (error as Error).message ?? '';
    if (isApmeConnectionError(message)) {
      return <ApmeUnavailable message={APME_GATEWAY_UNAVAILABLE_MESSAGE} />;
    }
    return <ResponseErrorPanel error={error} />;
  }

  if (!project) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          No scan results yet
        </Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Run a scan to check this repository for Ansible content quality
          issues.
        </Typography>
        {registerError && <ResponseErrorPanel error={registerError} />}
        {repoUrl && (
          <Button
            variant="contained"
            color="primary"
            onClick={handleRegister}
            disabled={registering}
            startIcon={
              registering ? <CircularProgress size={16} /> : <RefreshIcon />
            }
          >
            {registering ? 'Scanning…' : 'Scan'}
          </Button>
        )}
      </Box>
    );
  }

  const lastChecked = formatQualityLastChecked(scanning, project);

  return (
    <Box>
      <Typography variant="body1" className={classes.summary}>
        {project.total_violations} violations · {autoFixableCount} auto-fixable
        · Last checked {lastChecked}
      </Typography>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Scanning against: <strong>{scanTargetLabel}</strong>
      </Typography>

      {ruleFilter && (
        <Box className={classes.filters}>
          <Chip
            label={`Filtered by rule: ${ruleFilter}`}
            onDelete={() => setRuleFilter(null)}
            color="primary"
            variant="outlined"
          />
        </Box>
      )}

      <Box className={classes.toolbar}>
        <Button
          variant="contained"
          color="primary"
          startIcon={
            scanning ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <RefreshIcon />
            )
          }
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? 'Scanning…' : 'Scan'}
        </Button>
        {selectedIds.size > 0 && (
          <Typography variant="body2">
            {selectedIds.size} selected ·{' '}
            {
              [...selectedIds].filter(id =>
                violations.find(v => v.id === id && v.remediation_class === 1),
              ).length
            }{' '}
            auto-fix,{' '}
            {
              [...selectedIds].filter(id =>
                violations.find(v => v.id === id && v.remediation_class === 2),
              ).length
            }{' '}
            AI proposal →
          </Typography>
        )}
        {selectedIds.size > 0 && remediationPhase === 'idle' && (
          <Button
            variant="outlined"
            color="primary"
            onClick={handleSuggestFixes}
          >
            Suggest fixes for {selectedIds.size} violations
          </Button>
        )}
        {remediationPhase === 'review' && (
          <Button
            variant="contained"
            color="secondary"
            onClick={handleCreatePr}
          >
            Create pull request
          </Button>
        )}
      </Box>

      {scanning && (
        <Paper className={classes.scanPanel}>
          <LinearProgress />
          <Typography variant="body2" style={{ marginTop: 8 }}>
            Scan in progress…
            {scanProgressMessage ? ` ${scanProgressMessage}` : ''}
          </Typography>
        </Paper>
      )}

      {remediationPhase === 'generating' && (
        <Paper className={classes.scanPanel}>
          <Typography variant="body2">
            Generating fixes… processing selected violations
          </Typography>
          <LinearProgress />
        </Paper>
      )}

      {prUrl && (
        <Paper className={classes.scanPanel}>
          <Typography variant="body2">
            Pull request created:{' '}
            <a href={prUrl} target="_blank" rel="noopener noreferrer">
              {prUrl}
            </a>
          </Typography>
        </Paper>
      )}

      {scanError && <ResponseErrorPanel error={scanError} />}

      <Box className={classes.filters}>
        <FormControl
          variant="outlined"
          size="small"
          className={classes.formControl}
        >
          <InputLabel>Severity</InputLabel>
          <Select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value as string)}
            label="Severity"
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="blocker">Blocker</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="low">Low</MenuItem>
          </Select>
        </FormControl>
        <FormControl
          variant="outlined"
          size="small"
          className={classes.formControl}
        >
          <InputLabel>Fix type</InputLabel>
          <Select
            value={fixFilter}
            onChange={e => setFixFilter(e.target.value as string)}
            label="Fix type"
          >
            <MenuItem value="all">All fixable</MenuItem>
            <MenuItem value="auto">Auto-fix only</MenuItem>
            {enableAi && <MenuItem value="ai">AI-assisted only</MenuItem>}
            <MenuItem value="manual">Manual only</MenuItem>
          </Select>
        </FormControl>
        {enableAi && aiCount > 0 && (
          <Chip
            size="small"
            label={`${aiCount} AI proposals`}
            className={classes.fixAi}
          />
        )}
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>Severity</TableCell>
            <TableCell>Rule</TableCell>
            <TableCell>File</TableCell>
            <TableCell>Fix</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredViolations.map(v => (
            <Fragment key={v.id}>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.has(v.id)}
                    onChange={() => toggleSelection(v.id)}
                    disabled={v.remediation_class === 9}
                  />
                </TableCell>
                <TableCell>
                  <Chip size="small" label={v.level} />
                </TableCell>
                <TableCell>{v.rule_id}</TableCell>
                <TableCell>
                  {v.file}:{v.line}
                </TableCell>
                <TableCell>
                  <Tooltip title={fixTypeTooltip(v.remediation_class)}>
                    <Chip
                      size="small"
                      label={fixTypeLabel(v.remediation_class)}
                      className={fixTypeClass(classes, v.remediation_class)}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setExpandedId(expandedId === v.id ? null : v.id)
                    }
                  >
                    {expandedId === v.id ? (
                      <ExpandLessIcon />
                    ) : (
                      <ExpandMoreIcon />
                    )}
                  </IconButton>
                </TableCell>
              </TableRow>
              <TableRow key={`${v.id}-detail`}>
                <TableCell
                  colSpan={6}
                  style={{ paddingBottom: 0, paddingTop: 0 }}
                >
                  <Collapse in={expandedId === v.id}>
                    <Box margin={2}>
                      <Typography variant="body2" gutterBottom>
                        {v.message}
                      </Typography>
                      {v.original_yaml && (
                        <pre className={classes.codeBlock}>
                          {v.original_yaml}
                        </pre>
                      )}
                      {devSpacesBaseUrl && repoUrl && (
                        <Box marginTop={1}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<CodeIcon style={{ fontSize: 14 }} />}
                            onClick={openDevSpaces}
                          >
                            Edit in Dev Spaces
                          </Button>
                        </Box>
                      )}
                      {remediationPhase === 'review' &&
                        v.fixed_yaml &&
                        v.remediation_class === 1 && (
                          <>
                            <Chip
                              size="small"
                              label="Fixed"
                              className={classes.fixAuto}
                              style={{ marginBottom: 8 }}
                            />
                            <pre className={classes.codeBlock}>
                              {v.fixed_yaml}
                            </pre>
                          </>
                        )}
                    </Box>
                  </Collapse>
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>

      {filteredViolations.length === 0 && (
        <Typography variant="body2" color="textSecondary" align="center">
          No violations match the current filters.
        </Typography>
      )}
    </Box>
  );
};
