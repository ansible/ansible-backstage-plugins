import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel } from '@backstage/core-components';
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, LinearProgress, List, ListItem,
  ListItemText, Tab, Tabs, TextField, Typography,
} from '@material-ui/core';
import GetAppIcon from '@material-ui/icons/GetApp';
import DeleteIcon from '@material-ui/icons/Delete';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import BuildIcon from '@material-ui/icons/Build';
import { apmeApiRef } from '../api/ApmeApi';
import { useProjectOperationState } from '../hooks/useProjectOperationState';
import { GraphVisualization } from '../components/GraphVisualization';
import type { GraphData, ProjectOperationState } from '../types/api';

export const ProjectDetailPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const api = useApi(apmeApiRef);
  const { value: project, loading, error, retry } = useAsync(() => api.getProject(projectId!), [projectId]);
  const { value: activity } = useAsync(() => api.getProjectActivity(projectId!), [projectId]);
  const { value: violations } = useAsync(() => api.getProjectViolations(projectId!), [projectId]);
  const { state: opState, refresh: refreshOp, clear: clearOp } = useProjectOperationState(projectId || '');
  const [tabIdx, setTabIdx] = useState(0);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [sbomDownloading, setSbomDownloading] = useState(false);

  useEffect(() => {
    if (opState?.status === 'completed' || opState?.status === 'pr_submitted') retry();
  }, [opState?.status, retry]);

  useEffect(() => {
    if (tabIdx === 3 && projectId && !graphData && !graphLoading) {
      setGraphLoading(true);
      api.getProjectGraph(projectId).then(setGraphData).catch(() => setGraphData(null)).finally(() => setGraphLoading(false));
    }
  }, [tabIdx, projectId, graphData, graphLoading, api]);

  const handleSbomDownload = useCallback(async () => {
    if (!projectId) return;
    setSbomDownloading(true);
    try {
      const blob = await api.getProjectSbom(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `sbom-${projectId.replace(/[^a-zA-Z0-9_-]/g, '_')}.cdx.json`;
      a.style.display = 'none'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch { alert('Failed to download SBOM. Make sure a scan has been run.'); }
    finally { setSbomDownloading(false); }
  }, [projectId, api]);

  const handleCheck = useCallback(async () => {
    try { await api.startOperation(projectId!, { scan_type: 'check' }); refreshOp(); } catch (e) { console.error(e); }
  }, [api, projectId, refreshOp]);

  const handleRemediate = useCallback(async () => {
    try { await api.startOperation(projectId!, { scan_type: 'remediate' }); refreshOp(); } catch (e) { console.error(e); }
  }, [api, projectId, refreshOp]);

  const handleCancel = useCallback(async () => {
    try { await api.cancelOperation(projectId!); refreshOp(); } catch { /* ignore */ }
  }, [api, projectId, refreshOp]);

  const handleApprove = useCallback(async () => {
    try { await api.approveOperation(projectId!); refreshOp(); } catch { /* ignore */ }
  }, [api, projectId, refreshOp]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this project and all its activity history?')) return;
    await api.deleteProject(projectId!);
    navigate('../projects');
  }, [api, projectId, navigate]);

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load project">{error.message}</WarningPanel>;
  if (!project) return <WarningPanel title="Project not found" />;

  const isRunning = opState != null && ['queued', 'cloning', 'scanning', 'applying'].includes(opState.status);
  const hasOperation = opState != null && opState.status !== 'cancelled';

  return (
    <Content>
      <ContentHeader title={project.name} />
      <Box mb={2}>
        <Typography variant="subtitle1" color="textSecondary">{project.repo_url} ({project.branch})</Typography>
      </Box>

      {hasOperation && <OperationBanner state={opState!} onCancel={handleCancel} onApprove={handleApprove} onDismiss={clearOp} />}

      <Tabs value={tabIdx} onChange={(_, v) => setTabIdx(v)} indicatorColor="primary" style={{ marginBottom: 16 }}>
        <Tab label="Overview" />
        <Tab label="Activity" />
        <Tab label="Violations" />
        <Tab label="Visualize" />
        <Tab label="Settings" />
      </Tabs>

      {tabIdx === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={3}>
            <Card><CardContent style={{ textAlign: 'center' }}>
              <Typography variant="h3">{project.health_score}</Typography>
              <Typography color="textSecondary">Health Score</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={3}>
            <Card><CardContent style={{ textAlign: 'center' }}>
              <Typography variant="h3">{project.total_violations}</Typography>
              <Typography color="textSecondary">Violations</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={3}>
            <Card><CardContent style={{ textAlign: 'center' }}>
              <Typography variant="h3">{project.scan_count}</Typography>
              <Typography color="textSecondary">Scans</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={3}>
            <Card><CardContent style={{ textAlign: 'center' }}>
              <Typography variant="h3" style={{ fontSize: 24 }}>{project.last_scanned_at ?? 'Never'}</Typography>
              <Typography color="textSecondary">Last Scanned</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={12}>
            <Card><CardContent>
              <Typography variant="h6" gutterBottom>Dependencies</Typography>
              <Box display="flex" style={{ gap: 8 }}>
                <Button variant="outlined" size="small" startIcon={<GetAppIcon />} onClick={handleSbomDownload} disabled={sbomDownloading}>
                  {sbomDownloading ? 'Downloading...' : 'Download SBOM (CycloneDX)'}
                </Button>
              </Box>
            </CardContent></Card>
          </Grid>
        </Grid>
      )}

      {tabIdx === 1 && (
        <Box>
          <Box mb={2} display="flex" style={{ gap: 8 }}>
            <Button variant="contained" color="primary" startIcon={<PlayArrowIcon />} disabled={isRunning} onClick={handleCheck}>Check</Button>
            <Button variant="outlined" startIcon={<BuildIcon />} disabled={isRunning} onClick={handleRemediate}>Remediate</Button>
            {isRunning && <Button onClick={handleCancel}>Cancel</Button>}
          </Box>
          {activity && activity.length > 0 ? (
            <Card><CardContent>
              <Typography variant="h6" gutterBottom>History</Typography>
              <List dense>
                {activity.map(s => (
                  <ListItem key={s.scan_id} button component={Link} to={`../../activity/${s.scan_id}`}>
                    <ListItemText
                      primary={<><Chip label={s.scan_type} size="small" style={{ marginRight: 8 }} />{s.total_violations} violations</>}
                      secondary={s.created_at}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent></Card>
          ) : <Typography color="textSecondary">No activity recorded yet.</Typography>}
        </Box>
      )}

      {tabIdx === 2 && (
        <Box>
          {violations && violations.length > 0 ? (
            <Card><CardContent>
              <Typography variant="h6" gutterBottom>Violations ({violations.length})</Typography>
              <List dense>
                {violations.map(v => (
                  <ListItem key={v.id}>
                    <ListItemText
                      primary={<><Chip label={v.rule_id} size="small" style={{ marginRight: 8 }} /><Chip label={v.level} size="small" variant="outlined" style={{ marginRight: 8 }} />{v.message}</>}
                      secondary={`${v.file}${v.line ? `:${v.line}` : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent></Card>
          ) : <Typography color="textSecondary">No violations in the latest check.</Typography>}
        </Box>
      )}

      {tabIdx === 3 && (
        <Box>
          {graphLoading ? <LinearProgress /> : graphData ? (
            <GraphVisualization data={graphData} />
          ) : (
            <Typography color="textSecondary" style={{ textAlign: 'center', padding: 48 }}>
              No graph data available. Run a check to generate the content graph.
            </Typography>
          )}
        </Box>
      )}

      {tabIdx === 4 && (
        <ProjectSettings projectId={projectId!} project={project} onSaved={retry} onDelete={handleDelete} />
      )}
    </Content>
  );
};

function OperationBanner({ state, onCancel, onApprove, onDismiss }: { state: ProjectOperationState; onCancel: () => void; onApprove: () => void; onDismiss: () => void }) {
  const isRunning = ['queued', 'cloning', 'scanning', 'applying'].includes(state.status);
  const isDone = ['completed', 'pr_submitted', 'failed', 'expired', 'cancelled'].includes(state.status);

  return (
    <Box mb={2}>
      <Card style={{ borderLeft: `4px solid ${state.status === 'failed' ? '#f44336' : isDone ? '#4caf50' : '#1976d2'}` }}>
        <CardContent>
          <Box display="flex" alignItems="center">
            <Typography variant="subtitle1" style={{ flex: 1 }}>
              Operation: {state.scan_type} — <Chip label={state.status} size="small" />
            </Typography>
            {isRunning && <Button size="small" onClick={onCancel}>Cancel</Button>}
            {state.status === 'awaiting_approval' && <Button size="small" variant="contained" color="primary" onClick={onApprove}>Approve All</Button>}
            {isDone && <Button size="small" onClick={onDismiss}>Dismiss</Button>}
          </Box>
          {isRunning && <LinearProgress style={{ marginTop: 8 }} />}
          {state.error && <Typography color="error" style={{ marginTop: 8 }}>{state.error}</Typography>}
          {state.pr_url && <Typography style={{ marginTop: 8 }}>PR: <a href={state.pr_url} target="_blank" rel="noopener noreferrer">{state.pr_url}</a></Typography>}
          {state.result && (
            <Typography variant="body2" color="textSecondary" style={{ marginTop: 4 }}>
              {state.result.remediated_count} remediated · {state.result.total_violations} violations · {state.result.manual_review} manual review
            </Typography>
          )}
          {state.progress.length > 0 && (
            <List dense style={{ maxHeight: 150, overflow: 'auto', marginTop: 8 }}>
              {state.progress.slice(-10).map((p, i) => (
                <ListItem key={i}><ListItemText primary={p.message} secondary={p.phase} /></ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function ProjectSettings({ projectId, project, onSaved, onDelete }: { projectId: string; project: any; onSaved: () => void; onDelete: () => void }) {
  const api = useApi(apmeApiRef);
  const [name, setName] = useState(project.name);
  const [repoUrl, setRepoUrl] = useState(project.repo_url);
  const [branch, setBranch] = useState(project.branch);
  const [scmToken, setScmToken] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(project.name); setRepoUrl(project.repo_url); setBranch(project.branch); setScmToken(''); }, [project]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (name !== project.name) updates.name = name;
      if (repoUrl !== project.repo_url) updates.repo_url = repoUrl;
      if (branch !== project.branch) updates.branch = branch;
      if (scmToken.trim()) updates.scm_token = scmToken.trim();
      if (Object.keys(updates).length > 0) { await api.updateProject(projectId, updates); onSaved(); }
    } finally { setSaving(false); }
  }, [api, projectId, project, name, repoUrl, branch, scmToken, onSaved]);

  return (
    <Box maxWidth={600}>
      <Card><CardContent>
        <TextField label="Name" value={name} onChange={e => setName(e.target.value)} fullWidth margin="dense" />
        <TextField label="Repository URL" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} fullWidth margin="dense" />
        <TextField label="Branch" value={branch} onChange={e => setBranch(e.target.value)} fullWidth margin="dense" />
        <TextField
          label="SCM Token"
          value={scmToken} onChange={e => setScmToken(e.target.value)}
          fullWidth margin="dense" type="password"
          placeholder={project.has_scm_token ? '••••••••' : 'GitHub PAT or App token'}
          helperText="Used for creating pull requests. Leave blank to keep current value."
        />
        <Box mt={2} display="flex" style={{ gap: 8 }}>
          <Button variant="contained" color="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          <Button variant="outlined" color="secondary" startIcon={<DeleteIcon />} onClick={onDelete}>Delete Project</Button>
        </Box>
      </CardContent></Card>
    </Box>
  );
}
