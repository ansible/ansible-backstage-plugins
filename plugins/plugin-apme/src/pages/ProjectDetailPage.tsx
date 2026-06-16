import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useParams,
  useNavigate,
  Link,
  useSearchParams,
} from 'react-router-dom';
import { useAsyncRetry } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
} from '@backstage/core-components';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tab,
  Tabs,
  TextField,
  Typography,
  Paper,
} from '@material-ui/core';
import GetAppIcon from '@material-ui/icons/GetApp';
import DeleteIcon from '@material-ui/icons/Delete';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import BuildIcon from '@material-ui/icons/Build';
import { apmeApiRef } from '../api/ApmeApi';
import { useProjectOperationState } from '../hooks/useProjectOperationState';
import { GraphVisualization } from '../components/GraphVisualization';
import { TrendChart } from '../components/TrendChart';
import {
  CheckOptionsForm,
  AI_MODEL_STORAGE_KEY,
} from '../components/CheckOptionsForm';
import { DependencyHealthOutput } from '../components/DependencyHealthOutput';
import { ViolationStatusBar } from '../components/ViolationStatusBar';
import { DiffView } from '../components/DiffView';
import {
  healthColor,
  severityClass,
  severityColor,
  severityLabel,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  severityOrder,
} from '../components/severity';
import { timeAgo } from '../components/format';
import type {
  DepHealthSummary,
  GraphData,
  ProjectDependencies,
  ProjectDetail,
  ProjectOperationState,
  StartOperationOptions,
  TrendPoint,
  ViolationDetail,
} from '../types/api';

const TAB_NAMES = [
  'overview',
  'activity',
  'violations',
  'dependencies',
  'visualize',
  'settings',
] as const;
type TabName = (typeof TAB_NAMES)[number];

function tabNameToIndex(name: string | null): number {
  if (!name) return 0;
  const i = TAB_NAMES.indexOf(name as TabName);
  return i >= 0 ? i : 0;
}

type ViolationOrderBy = 'severity' | 'file' | 'rule' | 'message';
type Order = 'asc' | 'desc';

function compareViolations(
  a: ViolationDetail,
  b: ViolationDetail,
  orderBy: ViolationOrderBy,
  order: Order,
): number {
  const dir = order === 'asc' ? 1 : -1;
  let cmp = 0;
  if (orderBy === 'severity') {
    const ac = severityClass(a.level, a.rule_id);
    const bc = severityClass(b.level, b.rule_id);
    cmp = severityOrder(ac) - severityOrder(bc);
  } else if (orderBy === 'file') {
    cmp = a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0);
  } else if (orderBy === 'rule') {
    cmp = a.rule_id.localeCompare(b.rule_id);
  } else {
    cmp = a.message.localeCompare(b.message);
  }
  if (cmp !== 0) return cmp * dir;
  return a.id - b.id;
}

export const ProjectDetailPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabIdx = tabNameToIndex(searchParams.get('tab'));

  const setTabIdx = useCallback(
    (idx: number) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', TAB_NAMES[idx] ?? 'overview');
        return next;
      });
    },
    [setSearchParams],
  );

  const api = useApi(apmeApiRef);
  const {
    value: project,
    loading,
    error,
    retry,
  } = useAsyncRetry(() => api.getProject(projectId!), [projectId, api]);
  const { value: activity, retry: retryActivity } = useAsyncRetry(
    () => api.getProjectActivity(projectId!),
    [projectId, api],
  );
  const { value: violations, retry: retryViolations } = useAsyncRetry(
    () => api.getProjectViolations(projectId!),
    [projectId, api],
  );
  const { value: trend, retry: retryTrend } = useAsyncRetry(
    () => api.getProjectTrend(projectId!),
    [projectId, api],
  );
  const shouldLoadDeps = tabIdx === 3;
  const {
    value: projectDeps,
    loading: depsLoading,
    error: depsError,
    retry: retryDeps,
  } = useAsyncRetry(async () => {
    if (!shouldLoadDeps || !projectId) return undefined;
    return api.getProjectDependencies(projectId);
  }, [shouldLoadDeps, projectId, api]);
  const {
    value: depHealth,
    loading: depHealthLoading,
    retry: retryDepHealth,
  } = useAsyncRetry(async () => {
    if (!shouldLoadDeps || !projectId) return undefined;
    return api.getProjectDepHealth(projectId);
  }, [shouldLoadDeps, projectId, api]);

  const {
    state: opState,
    refresh: refreshOp,
    clear: clearOp,
  } = useProjectOperationState(projectId || '');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [sbomDownloading, setSbomDownloading] = useState(false);

  const [ansibleVersion, setAnsibleVersion] = useState('');
  const [collections, setCollections] = useState('');
  const [enableAi, setEnableAi] = useState(false);

  const [violationFilter, setViolationFilter] = useState('');
  const [orderBy, setOrderBy] = useState<ViolationOrderBy>('severity');
  const [order, setOrder] = useState<Order>('asc');

  const lastRefreshedOpStatus = useRef<string | null>(null);
  useEffect(() => {
    const status = opState?.status;
    if (
      (status === 'completed' || status === 'pr_submitted') &&
      lastRefreshedOpStatus.current !== status
    ) {
      lastRefreshedOpStatus.current = status;
      const timer = setTimeout(() => {
        retry();
        retryActivity();
        retryViolations();
        retryTrend();
        if (shouldLoadDeps) {
          retryDeps();
          retryDepHealth();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
    if (status && status !== 'completed' && status !== 'pr_submitted') {
      lastRefreshedOpStatus.current = null;
    }
    return undefined;
  }, [
    opState?.status,
    retry,
    retryActivity,
    retryViolations,
    retryTrend,
    shouldLoadDeps,
    retryDeps,
    retryDepHealth,
  ]);

  useEffect(() => {
    if (tabIdx === 4 && projectId && !graphData && !graphLoading) {
      setGraphLoading(true);
      api
        .getProjectGraph(projectId)
        .then(setGraphData)
        .catch(() => setGraphData(null))
        .finally(() => setGraphLoading(false));
    }
  }, [tabIdx, projectId, graphData, graphLoading, api]);

  const buildStartOptions = useCallback((): Record<string, unknown> => {
    const opts: Record<string, unknown> = {};
    if (ansibleVersion) opts.ansible_version = ansibleVersion;
    if (collections) {
      opts.collection_specs = collections
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }
    if (enableAi) {
      opts.enable_ai = true;
      const model = localStorage.getItem(AI_MODEL_STORAGE_KEY);
      if (model) opts.ai_model = model;
    }
    return opts;
  }, [ansibleVersion, collections, enableAi]);

  const handleSbomDownload = useCallback(async () => {
    if (!projectId) return;
    setSbomDownloading(true);
    try {
      const blob = await api.getProjectSbom(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sbom-${projectId.replace(/[^a-zA-Z0-9_-]/g, '_')}.cdx.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      // eslint-disable-next-line no-alert
      alert('Failed to download SBOM. Make sure a scan has been run.');
    } finally {
      setSbomDownloading(false);
    }
  }, [projectId, api]);

  const startWithAction = useCallback(
    async (action: 'check' | 'remediate') => {
      if (!projectId) return;
      const options = buildStartOptions();
      await api.startOperation(projectId, {
        action,
        options: Object.keys(options).length
          ? (options as StartOperationOptions)
          : undefined,
      });
      refreshOp();
    },
    [api, projectId, buildStartOptions, refreshOp],
  );

  const handleCheck = useCallback(() => {
    startWithAction('check').catch(e => {
      // eslint-disable-next-line no-console
      console.error(e);
    });
  }, [startWithAction]);

  const handleRemediate = useCallback(() => {
    startWithAction('remediate').catch(e => {
      // eslint-disable-next-line no-console
      console.error(e);
    });
  }, [startWithAction]);

  const handleCancel = useCallback(async () => {
    try {
      await api.cancelOperation(projectId!);
      refreshOp();
    } catch {
      /* ignore */
    }
  }, [api, projectId, refreshOp]);

  const handleApprove = useCallback(
    async (approvedIds: string[]) => {
      try {
        await api.approveOperation(projectId!, approvedIds);
        refreshOp();
      } catch {
        /* ignore */
      }
    },
    [api, projectId, refreshOp],
  );

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this project and all its activity history?'))
      return;
    await api.deleteProject(projectId!);
    navigate('../projects');
  }, [api, projectId, navigate]);

  const handleViolationSort = useCallback(
    (property: ViolationOrderBy) => {
      if (orderBy === property) {
        setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
      } else {
        setOrderBy(property);
        setOrder('asc');
      }
    },
    [orderBy],
  );

  const filteredSortedViolations = useMemo(() => {
    if (!violations) return [];
    const q = violationFilter.trim().toLowerCase();
    const base = !q
      ? violations
      : violations.filter(
          v =>
            v.message.toLowerCase().includes(q) ||
            v.file.toLowerCase().includes(q) ||
            v.rule_id.toLowerCase().includes(q) ||
            v.level.toLowerCase().includes(q),
        );
    return [...base].sort((a, b) => compareViolations(a, b, orderBy, order));
  }, [violations, violationFilter, orderBy, order]);

  if (loading) return <Progress />;
  if (error)
    return (
      <WarningPanel title="Failed to load project">
        {error.message}
      </WarningPanel>
    );
  if (!project) return <WarningPanel title="Project not found" />;

  const isRunning =
    opState != null &&
    ['queued', 'cloning', 'scanning', 'applying'].includes(opState.status);
  const hasOperation = opState != null && opState.status !== 'cancelled';
  const trendData: TrendPoint[] = trend ?? [];
  const breakdown = project.severity_breakdown || {};

  return (
    <>
      <ContentHeader title={project.name} />
      <Box mb={2}>
        <Typography variant="subtitle1" color="textSecondary">
          {project.repo_url} ({project.branch})
        </Typography>
      </Box>

      {hasOperation && (
        <OperationBanner
          state={opState!}
          onCancel={handleCancel}
          onApprove={handleApprove}
          onDismiss={clearOp}
        />
      )}

      <Tabs
        value={tabIdx}
        onChange={(_, v) => setTabIdx(v as number)}
        indicatorColor="primary"
        style={{ marginBottom: 16 }}
      >
        <Tab label="Overview" />
        <Tab label="Activity" />
        <Tab label="Violations" />
        <Tab label="Dependencies" />
        <Tab label="Visualize" />
        <Tab label="Settings" />
      </Tabs>

      {tabIdx === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent style={{ textAlign: 'center' }}>
                <Typography
                  variant="h3"
                  style={{ color: healthColor(project.health_score) }}
                >
                  {project.health_score}
                </Typography>
                <Typography color="textSecondary">Health</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent style={{ textAlign: 'center' }}>
                <Typography variant="h3">{project.total_violations}</Typography>
                <Typography color="textSecondary">Violations</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent style={{ textAlign: 'center' }}>
                <Typography variant="h3">{project.scan_count}</Typography>
                <Typography color="textSecondary">Scans</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card>
              <CardContent style={{ textAlign: 'center' }}>
                <Typography variant="h3" style={{ fontSize: 22 }}>
                  {project.last_scanned_at
                    ? timeAgo(project.last_scanned_at)
                    : 'Never'}
                </Typography>
                <Typography color="textSecondary">Last check</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Severity breakdown
                </Typography>
                <Box display="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {SEVERITY_ORDER.map(sev => {
                    const n = breakdown[sev] ?? 0;
                    if (n === 0) return null;
                    return (
                      <Chip
                        key={sev}
                        size="small"
                        label={`${SEVERITY_LABELS[sev] ?? sev}: ${n}`}
                        style={{
                          backgroundColor: SEVERITY_COLORS[sev],
                          color: '#fff',
                        }}
                      />
                    );
                  })}
                  {Object.entries(breakdown).map(([k, n]) => {
                    if (
                      (SEVERITY_ORDER as readonly string[]).includes(k) ||
                      n === 0
                    )
                      return null;
                    return (
                      <Chip
                        key={k}
                        size="small"
                        label={`${k}: ${n}`}
                        variant="outlined"
                      />
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            {trendData.length >= 2 ? (
              <TrendChart data={trendData} title="Violation trend" />
            ) : (
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Violation trend
                  </Typography>
                  <Typography color="textSecondary">
                    At least two scans are required to show a trend chart.
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Grid>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  SBOM
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<GetAppIcon />}
                  onClick={handleSbomDownload}
                  disabled={sbomDownloading}
                >
                  {sbomDownloading
                    ? 'Downloading...'
                    : 'Download SBOM (CycloneDX)'}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tabIdx === 1 && (
        <Box>
          <Box mb={2} display="flex" flexDirection="column" style={{ gap: 12 }}>
            <CheckOptionsForm
              ansibleVersion={ansibleVersion}
              onAnsibleVersionChange={setAnsibleVersion}
              collections={collections}
              onCollectionsChange={setCollections}
              enableAi={enableAi}
              onEnableAiChange={setEnableAi}
            />
            <Box display="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<PlayArrowIcon />}
                disabled={isRunning}
                onClick={handleCheck}
              >
                Check
              </Button>
              <Button
                variant="outlined"
                startIcon={<BuildIcon />}
                disabled={isRunning}
                onClick={handleRemediate}
              >
                Remediate
              </Button>
              {isRunning && <Button onClick={handleCancel}>Cancel</Button>}
            </Box>
          </Box>
          {activity && activity.length > 0 ? (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  History
                </Typography>
                <List dense>
                  {activity.map(s => (
                    <ListItem
                      key={s.scan_id}
                      button
                      component={Link}
                      to={`../../activity/${s.scan_id}`}
                    >
                      <ListItemText
                        primary={
                          <>
                            <Chip
                              label={s.scan_type}
                              size="small"
                              style={{ marginRight: 8 }}
                            />
                            {s.total_violations} violations
                          </>
                        }
                        secondary={s.created_at}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          ) : (
            <Typography color="textSecondary">
              No activity recorded yet.
            </Typography>
          )}
        </Box>
      )}

      {tabIdx === 2 && (
        <Box>
          {violations && violations.length > 0 ? (
            <Box>
              <Box mb={2}>
                <Typography
                  variant="subtitle2"
                  color="textSecondary"
                  gutterBottom
                >
                  Distribution
                </Typography>
                <ViolationStatusBar violations={violations} />
              </Box>
              <TextField
                size="small"
                fullWidth
                margin="normal"
                label="Filter violations"
                value={violationFilter}
                onChange={e => setViolationFilter(e.target.value)}
                style={{ maxWidth: 400 }}
                placeholder="Message, file, rule, or severity"
              />
              <TableContainer component={Paper} style={{ marginTop: 16 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sortDirection={orderBy === 'severity' ? order : false}
                      >
                        <TableSortLabel
                          active={orderBy === 'severity'}
                          direction={orderBy === 'severity' ? order : 'asc'}
                          onClick={() => handleViolationSort('severity')}
                        >
                          Severity
                        </TableSortLabel>
                      </TableCell>
                      <TableCell
                        sortDirection={orderBy === 'rule' ? order : false}
                      >
                        <TableSortLabel
                          active={orderBy === 'rule'}
                          direction={orderBy === 'rule' ? order : 'asc'}
                          onClick={() => handleViolationSort('rule')}
                        >
                          Rule
                        </TableSortLabel>
                      </TableCell>
                      <TableCell
                        sortDirection={orderBy === 'file' ? order : false}
                      >
                        <TableSortLabel
                          active={orderBy === 'file'}
                          direction={orderBy === 'file' ? order : 'asc'}
                          onClick={() => handleViolationSort('file')}
                        >
                          File
                        </TableSortLabel>
                      </TableCell>
                      <TableCell
                        sortDirection={orderBy === 'message' ? order : false}
                      >
                        <TableSortLabel
                          active={orderBy === 'message'}
                          direction={orderBy === 'message' ? order : 'asc'}
                          onClick={() => handleViolationSort('message')}
                        >
                          Message
                        </TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSortedViolations.map(v => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <Chip
                            size="small"
                            label={severityLabel(v.level, v.rule_id)}
                            style={{
                              backgroundColor: severityColor(
                                v.level,
                                v.rule_id,
                              ),
                              color: '#fff',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={v.rule_id}
                            style={{ maxWidth: 200 }}
                          />
                        </TableCell>
                        <TableCell>
                          {v.file}
                          {v.line != null ? `:${v.line}` : ''}
                        </TableCell>
                        <TableCell>{v.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography
                variant="caption"
                color="textSecondary"
                style={{ display: 'block', marginTop: 8 }}
              >
                Showing {filteredSortedViolations.length} of {violations.length}{' '}
                violations
              </Typography>
            </Box>
          ) : (
            <Typography color="textSecondary">
              No violations in the latest check.
            </Typography>
          )}
        </Box>
      )}

      {tabIdx === 3 && (
        <Box>
          {depsLoading && <Progress />}
          {depsError && (
            <WarningPanel title="Failed to load dependencies">
              {depsError.message}
            </WarningPanel>
          )}
          {!depsLoading && !depsError && projectDeps && (
            <DependenciesContent
              projectDeps={projectDeps}
              depHealth={depHealth}
              depHealthLoading={depHealthLoading}
              onSbom={handleSbomDownload}
              sbomDownloading={sbomDownloading}
            />
          )}
          {!depsLoading && !depsError && !projectDeps && (
            <Typography color="textSecondary">
              No dependency data available yet. Run a check first.
            </Typography>
          )}
        </Box>
      )}

      {tabIdx === 4 && (
        <Box>
          {graphLoading ? (
            <LinearProgress />
          ) : graphData ? (
            <GraphVisualization data={graphData} />
          ) : (
            <Typography
              color="textSecondary"
              style={{ textAlign: 'center', padding: 48 }}
            >
              No graph data available. Run a check to generate the content
              graph.
            </Typography>
          )}
        </Box>
      )}

      {tabIdx === 5 && (
        <ProjectSettings
          projectId={projectId!}
          project={project}
          onSaved={retry}
          onDelete={handleDelete}
        />
      )}
    </>
  );
};

function DependenciesContent({
  projectDeps,
  depHealth,
  depHealthLoading,
  onSbom,
  sbomDownloading,
}: {
  projectDeps: ProjectDependencies;
  depHealth: DepHealthSummary | null | undefined;
  depHealthLoading: boolean;
  onSbom: () => void;
  sbomDownloading: boolean;
}) {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Ansible
            </Typography>
            <Typography variant="body1">
              <strong>ansible-core:</strong>{' '}
              {projectDeps.ansible_core_version || '—'}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Collections
            </Typography>
            {projectDeps.collections.length === 0 ? (
              <Typography color="textSecondary">
                No collections reported.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>FQCN</TableCell>
                      <TableCell>Version</TableCell>
                      <TableCell>Source</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projectDeps.collections.map(c => (
                      <TableRow key={`${c.fqcn}@${c.version}`}>
                        <TableCell>{c.fqcn}</TableCell>
                        <TableCell>{c.version}</TableCell>
                        <TableCell>{c.source}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Python packages
            </Typography>
            {projectDeps.python_packages.length === 0 ? (
              <Typography color="textSecondary">
                No Python packages reported.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Version</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projectDeps.python_packages.map(p => (
                      <TableRow key={p.name}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.version}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Requirements files
            </Typography>
            {projectDeps.requirements_files.length === 0 ? (
              <Typography color="textSecondary">None listed.</Typography>
            ) : (
              <List dense>
                {projectDeps.requirements_files.map((f, i) => (
                  <ListItem key={i}>
                    <ListItemText primary={f} />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>
      {projectDeps.dependency_tree ? (
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Dependency tree
              </Typography>
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  overflow: 'auto',
                  maxHeight: 240,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {projectDeps.dependency_tree}
              </pre>
            </CardContent>
          </Card>
        </Grid>
      ) : null}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Dependency health
            </Typography>
            {depHealthLoading ? (
              <Progress />
            ) : depHealth ? (
              <DependencyHealthOutput depHealth={depHealth} />
            ) : null}
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              SBOM
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<GetAppIcon />}
              onClick={onSbom}
              disabled={sbomDownloading}
            >
              {sbomDownloading ? 'Downloading...' : 'Download SBOM (CycloneDX)'}
            </Button>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

function OperationBanner({
  state,
  onCancel,
  onApprove,
  onDismiss,
}: {
  state: ProjectOperationState;
  onCancel: () => void;
  onApprove: (approvedProposalIds: string[]) => void;
  onDismiss: () => void;
}) {
  const isRunning = ['queued', 'cloning', 'scanning', 'applying'].includes(
    state.status,
  );
  const isDone = [
    'completed',
    'pr_submitted',
    'failed',
    'expired',
    'cancelled',
  ].includes(state.status);
  const awaiting = state.status === 'awaiting_approval';
  const proposals = state.proposals ?? [];
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (proposals.length) {
      setSelected(prev => {
        const n = { ...prev };
        const ids = new Set(proposals.map(p => p.id));
        for (const k of Object.keys(n)) {
          if (!ids.has(k)) delete n[k];
        }
        for (const p of proposals) {
          if (n[p.id] === undefined) n[p.id] = true;
        }
        return n;
      });
    }
  }, [proposals]);

  const toggleProposal = (id: string) => {
    setSelected(s => ({ ...s, [id]: !s[id] }));
  };

  const selectedIds = proposals.filter(p => selected[p.id]).map(p => p.id);
  const canApproveSelected = awaiting && selectedIds.length > 0;

  return (
    <Box mb={2}>
      <Card
        style={{
          borderLeft: `4px solid ${
            state.status === 'failed'
              ? '#f44336'
              : isDone
              ? '#4caf50'
              : '#1976d2'
          }`,
        }}
      >
        <CardContent>
          <Box
            display="flex"
            alignItems="center"
            flexWrap="wrap"
            style={{ gap: 8 }}
          >
            <Typography variant="subtitle1" style={{ flex: 1, minWidth: 200 }}>
              Operation: {state.scan_type} —{' '}
              <Chip label={state.status} size="small" />
            </Typography>
            {isRunning && (
              <Button size="small" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {awaiting && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  onClick={() => onApprove(selectedIds)}
                  disabled={!canApproveSelected}
                >
                  Approve selected
                </Button>
                <Button
                  size="small"
                  onClick={() => onApprove(proposals.map(p => p.id))}
                  disabled={proposals.length === 0}
                >
                  Approve all
                </Button>
              </>
            )}
            {isDone && (
              <Button size="small" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
          </Box>
          {awaiting && proposals.length > 0 && (
            <Box style={{ marginTop: 12 }}>
              <Typography variant="subtitle2" gutterBottom>
                Proposals
              </Typography>
              <List dense>
                {proposals.map(p => (
                  <ListItem
                    key={p.id}
                    alignItems="flex-start"
                    style={{ flexDirection: 'column', alignItems: 'stretch' }}
                  >
                    <Box
                      display="flex"
                      alignItems="center"
                      style={{ width: '100%' }}
                    >
                      <Checkbox
                        checked={!!selected[p.id]}
                        onChange={() => toggleProposal(p.id)}
                        color="primary"
                        style={{ padding: 4 }}
                      />
                      <Box flex={1} ml={1}>
                        <Typography variant="body2">
                          <Chip
                            size="small"
                            label={p.rule_id}
                            style={{ marginRight: 8 }}
                          />
                          {p.file}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          Confidence: {p.confidence}
                          {p.explanation ? ` — ${p.explanation}` : ''}
                        </Typography>
                      </Box>
                    </Box>
                    {p.diff_hunk && (
                      <Box
                        style={{
                          marginTop: 8,
                          marginLeft: 36,
                          maxHeight: 200,
                          border: '1px solid #e0e0e0',
                          borderRadius: 4,
                          padding: 8,
                        }}
                      >
                        <DiffView diff={p.diff_hunk} />
                      </Box>
                    )}
                    {p.suggestion && !p.diff_hunk && (
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        style={{
                          marginLeft: 36,
                          marginTop: 4,
                          display: 'block',
                        }}
                      >
                        {p.suggestion}
                      </Typography>
                    )}
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
          {isRunning && <LinearProgress style={{ marginTop: 8 }} />}
          {state.error && (
            <Typography color="error" style={{ marginTop: 8 }}>
              {state.error}
            </Typography>
          )}
          {state.pr_url && (
            <Typography style={{ marginTop: 8 }}>
              PR:{' '}
              <a href={state.pr_url} target="_blank" rel="noopener noreferrer">
                {state.pr_url}
              </a>
            </Typography>
          )}
          {state.result && (
            <Typography
              variant="body2"
              color="textSecondary"
              style={{ marginTop: 4 }}
            >
              {state.result.remediated_count} remediated ·{' '}
              {state.result.total_violations} violations ·
              {state.result.manual_review} manual review
            </Typography>
          )}
          {state.progress.length > 0 && (
            <List
              dense
              style={{ maxHeight: 150, overflow: 'auto', marginTop: 8 }}
            >
              {state.progress.slice(-10).map((p, i) => (
                <ListItem key={i}>
                  <ListItemText primary={p.message} secondary={p.phase} />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function ProjectSettings({
  projectId,
  project,
  onSaved,
  onDelete,
}: {
  projectId: string;
  project: ProjectDetail;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const api = useApi(apmeApiRef);
  const [name, setName] = useState(project.name);
  const [repoUrl, setRepoUrl] = useState(project.repo_url);
  const [branch, setBranch] = useState(project.branch);
  const [scmToken, setScmToken] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(project.name);
    setRepoUrl(project.repo_url);
    setBranch(project.branch);
    setScmToken('');
  }, [project]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (name !== project.name) updates.name = name;
      if (repoUrl !== project.repo_url) updates.repo_url = repoUrl;
      if (branch !== project.branch) updates.branch = branch;
      if (scmToken.trim()) updates.scm_token = scmToken.trim();
      if (Object.keys(updates).length > 0) {
        await api.updateProject(projectId, updates);
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }, [api, projectId, project, name, repoUrl, branch, scmToken, onSaved]);

  return (
    <Box maxWidth={600}>
      <Card>
        <CardContent>
          <TextField
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            margin="dense"
          />
          <TextField
            label="Repository URL"
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            fullWidth
            margin="dense"
          />
          <TextField
            label="Branch"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            fullWidth
            margin="dense"
          />
          <TextField
            label="SCM Token"
            value={scmToken}
            onChange={e => setScmToken(e.target.value)}
            fullWidth
            margin="dense"
            type="password"
            placeholder={
              project.has_scm_token ? '••••••••' : 'GitHub PAT or App token'
            }
            helperText="Used for creating pull requests. Leave blank to keep current value."
          />
          <Box mt={2} display="flex" style={{ gap: 8 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<DeleteIcon />}
              onClick={onDelete}
            >
              Delete Project
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
