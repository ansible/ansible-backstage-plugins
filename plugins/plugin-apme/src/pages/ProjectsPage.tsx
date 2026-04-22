import React, { useCallback, useState } from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { Link } from 'react-router-dom';
import {
  Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, TextField,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { apmeApiRef } from '../api/ApmeApi';

export const ProjectsPage = () => {
  const api = useApi(apmeApiRef);
  const { value: projects, loading, error, retry } = useAsync(() => api.listProjects());
  const [dialogOpen, setDialogOpen] = useState(false);

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load projects">{error.message}</WarningPanel>;

  const columns: TableColumn[] = [
    { title: 'Name', field: 'name', render: (row: any) => <Link to={`projects/${row.id}`}>{row.name}</Link> },
    { title: 'Branch', field: 'branch' },
    { title: 'Health', field: 'health_score', type: 'numeric' },
    { title: 'Violations', field: 'total_violations', type: 'numeric' },
    { title: 'Trend', field: 'violation_trend' },
    { title: 'Scans', field: 'scan_count', type: 'numeric' },
    { title: 'Last Scanned', field: 'last_scanned_at' },
  ];

  return (
    <Content>
      <ContentHeader title="Projects">
        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Add Project
        </Button>
      </ContentHeader>
      <Table title="All Projects" columns={columns} data={projects ?? []} />
      <CreateProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={retry} />
    </Content>
  );
};

function CreateProjectDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const api = useApi(apmeApiRef);
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [scmToken, setScmToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = useCallback(async () => {
    if (!name.trim() || !repoUrl.trim()) { setError('Name and Repository URL are required.'); return; }
    setSaving(true); setError('');
    try {
      await api.createProject({ name, repo_url: repoUrl, branch, scm_token: scmToken || undefined });
      onCreated(); onClose();
      setName(''); setRepoUrl(''); setBranch('main'); setScmToken('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create project'); }
    finally { setSaving(false); }
  }, [api, name, repoUrl, branch, scmToken, onCreated, onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Project</DialogTitle>
      <DialogContent>
        {error && <Box mb={2} style={{ color: '#f44336' }}>{error}</Box>}
        <TextField label="Name" value={name} onChange={e => setName(e.target.value)} fullWidth required margin="dense" />
        <TextField label="Repository URL" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} fullWidth required margin="dense" placeholder="https://github.com/org/repo" />
        <TextField label="Branch" value={branch} onChange={e => setBranch(e.target.value)} fullWidth margin="dense" />
        <TextField label="SCM Token (optional)" value={scmToken} onChange={e => setScmToken(e.target.value)} fullWidth margin="dense" type="password" helperText="GitHub PAT or App token for PR creation" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="primary" onClick={handleSave} disabled={saving}>{saving ? 'Creating...' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}
