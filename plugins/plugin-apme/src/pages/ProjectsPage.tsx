import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
} from '@backstage/core-components';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHead,
  TableSortLabel,
  TextField,
  Typography,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { apmeApiRef } from '../api/ApmeApi';
import { healthColor } from '../components/severity';
import { timeAgo } from '../components/format';
import type { ProjectSummary } from '../types/api';

type SortKey =
  | 'name'
  | 'health_score'
  | 'total_violations'
  | 'scan_count'
  | 'last_scanned_at';
type Order = 'asc' | 'desc';

function ProjectStatus({ row }: { row: ProjectSummary }) {
  if (row.active_operation) {
    if (row.active_operation.status === 'awaiting_approval') {
      return (
        <Chip
          size="small"
          label="Action Required"
          style={{ backgroundColor: '#f0ab00' }}
        />
      );
    }
    return (
      <Chip
        size="small"
        color="primary"
        label={
          row.active_operation.scan_type === 'remediate'
            ? 'Remediating'
            : 'Checking'
        }
      />
    );
  }
  if (!row.last_scanned_at) {
    return (
      <Chip
        size="small"
        label="Never checked"
        variant="outlined"
        style={{ borderColor: '#c9190b', color: '#c9190b' }}
      />
    );
  }
  const days = Math.floor(
    (Date.now() - new Date(row.last_scanned_at).getTime()) / 86_400_000,
  );
  if (days > 30)
    return (
      <Chip size="small" label="Stale" style={{ backgroundColor: '#f0ab00' }} />
    );
  return (
    <Chip
      size="small"
      label="Idle"
      style={{ backgroundColor: '#3e8635', color: '#fff' }}
    />
  );
}

function TrendCell({ trend }: { trend: string }) {
  if (trend === 'improving') {
    return (
      <Chip
        size="small"
        label="▲ Improving"
        style={{ backgroundColor: '#3e8635', color: '#fff' }}
      />
    );
  }
  if (trend === 'declining') {
    return (
      <Chip
        size="small"
        label="▼ Declining"
        style={{ color: '#fff', backgroundColor: '#c9190b' }}
      />
    );
  }
  return <Chip size="small" label="— Stable" variant="outlined" />;
}

function compareProjects(
  a: ProjectSummary,
  b: ProjectSummary,
  orderBy: SortKey,
  order: Order,
): number {
  const dir = order === 'asc' ? 1 : -1;
  let cmp = 0;
  if (orderBy === 'name') {
    cmp = a.name.localeCompare(b.name);
  } else if (orderBy === 'health_score') {
    cmp = a.health_score - b.health_score;
  } else if (orderBy === 'total_violations') {
    cmp = a.total_violations - b.total_violations;
  } else if (orderBy === 'scan_count') {
    cmp = a.scan_count - b.scan_count;
  } else {
    const as = a.last_scanned_at ?? '';
    const bs = b.last_scanned_at ?? '';
    if (!a.last_scanned_at && !b.last_scanned_at) cmp = 0;
    else if (!a.last_scanned_at) cmp = 1;
    else if (!b.last_scanned_at) cmp = -1;
    else cmp = as.localeCompare(bs);
  }
  if (cmp !== 0) return cmp * dir;
  return a.name.localeCompare(b.name);
}

export const ProjectsPage = () => {
  const api = useApi(apmeApiRef);
  const navigate = useNavigate();
  const [rawItems, setRawItems] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState<SortKey>('name');
  const [menuAnchor, setMenuAnchor] = useState<null | {
    el: HTMLElement;
    id: string;
  }>(null);

  const load = useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const res = await api.listProjects();
        setRawItems(res?.items ?? []);
      } catch (e) {
        if (!silent) {
          setLoadError(
            e instanceof Error ? e : new Error('Failed to load projects'),
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      load(true);
    }, 15000);
    return () => clearInterval(t);
  }, [load]);

  const onSort = useCallback(
    (property: SortKey) => {
      if (orderBy === property) {
        setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
      } else {
        setOrderBy(property);
        setOrder('asc');
      }
    },
    [orderBy],
  );

  const filtered = useMemo(() => {
    let list = rawItems;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.repo_url.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => compareProjects(a, b, orderBy, order));
  }, [rawItems, searchText, orderBy, order]);

  const handleRowNavigate = (id: string) => {
    navigate(`./${id}`);
  };

  const handleEdit = (id: string) => {
    setMenuAnchor(null);
    navigate(`./${id}?tab=settings`);
  };

  const handleDelete = async (row: ProjectSummary) => {
    setMenuAnchor(null);
    if (!window.confirm(`Delete project "${row.name}"? This cannot be undone.`))
      return;
    try {
      await api.deleteProject(row.id);
      await load(true);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : 'Failed to delete project.',
      );
    }
  };

  if (loading) return <Progress />;
  if (loadError) {
    return (
      <WarningPanel title="Failed to load projects">
        {loadError.message}
        <Box mt={1}>
          <Button color="primary" onClick={() => load(false)}>
            Retry
          </Button>
        </Box>
      </WarningPanel>
    );
  }

  return (
    <>
      <ContentHeader title="Projects">
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
        >
          Add Project
        </Button>
      </ContentHeader>

      <Box
        display="flex"
        flexWrap="wrap"
        alignItems="center"
        style={{ gap: 16, marginBottom: 16 }}
      >
        <TextField
          label="Filter by name or URL"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          variant="outlined"
          size="small"
          style={{ minWidth: 280 }}
        />
        <Typography variant="body2" color="textSecondary" component="span">
          {filtered.length} project{filtered.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {rawItems.length === 0 ? (
        <Box p={2} color="textSecondary">
          No projects defined yet. Create one to get started.
        </Box>
      ) : filtered.length === 0 ? (
        <Box p={2} color="textSecondary">
          No projects match the current filter.
        </Box>
      ) : (
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sortDirection={orderBy === 'name' ? order : false}>
                <TableSortLabel
                  active={orderBy === 'name'}
                  direction={orderBy === 'name' ? order : 'asc'}
                  onClick={() => onSort('name')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell>Status</TableCell>
              <TableCell
                align="right"
                sortDirection={orderBy === 'health_score' ? order : false}
              >
                <TableSortLabel
                  active={orderBy === 'health_score'}
                  direction={orderBy === 'health_score' ? order : 'asc'}
                  onClick={() => onSort('health_score')}
                >
                  Health
                </TableSortLabel>
              </TableCell>
              <TableCell
                align="right"
                sortDirection={orderBy === 'total_violations' ? order : false}
              >
                <TableSortLabel
                  active={orderBy === 'total_violations'}
                  direction={orderBy === 'total_violations' ? order : 'asc'}
                  onClick={() => onSort('total_violations')}
                >
                  Violations
                </TableSortLabel>
              </TableCell>
              <TableCell>Trend</TableCell>
              <TableCell
                align="right"
                sortDirection={orderBy === 'scan_count' ? order : false}
              >
                <TableSortLabel
                  active={orderBy === 'scan_count'}
                  direction={orderBy === 'scan_count' ? order : 'asc'}
                  onClick={() => onSort('scan_count')}
                >
                  Scans
                </TableSortLabel>
              </TableCell>
              <TableCell
                sortDirection={orderBy === 'last_scanned_at' ? order : false}
              >
                <TableSortLabel
                  active={orderBy === 'last_scanned_at'}
                  direction={orderBy === 'last_scanned_at' ? order : 'asc'}
                  onClick={() => onSort('last_scanned_at')}
                >
                  Last scanned
                </TableSortLabel>
              </TableCell>
              <TableCell padding="none" style={{ width: 48 }} align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(row => (
              <TableRow
                key={row.id}
                hover
                style={{ cursor: 'pointer' }}
                onClick={() => handleRowNavigate(row.id)}
              >
                <TableCell>
                  <Typography variant="body2" style={{ fontWeight: 600 }}>
                    <Link to={`./${row.id}`} onClick={e => e.stopPropagation()}>
                      {row.name}
                    </Link>
                  </Typography>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    display="block"
                    style={{ fontFamily: 'monospace' }}
                  >
                    {row.repo_url} ({row.branch})
                  </Typography>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <ProjectStatus row={row} />
                </TableCell>
                <TableCell align="right" onClick={e => e.stopPropagation()}>
                  <span
                    style={{
                      color: healthColor(row.health_score),
                      fontWeight: 600,
                    }}
                  >
                    {row.health_score}
                  </span>
                </TableCell>
                <TableCell align="right" onClick={e => e.stopPropagation()}>
                  {row.total_violations}
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <TrendCell trend={row.violation_trend} />
                </TableCell>
                <TableCell align="right" onClick={e => e.stopPropagation()}>
                  {row.scan_count}
                </TableCell>
                <TableCell
                  onClick={e => e.stopPropagation()}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {row.last_scanned_at ? timeAgo(row.last_scanned_at) : 'Never'}
                </TableCell>
                <TableCell
                  padding="none"
                  align="right"
                  onClick={e => e.stopPropagation()}
                >
                  <IconButton
                    aria-label="actions"
                    size="small"
                    onClick={e => {
                      e.stopPropagation();
                      setMenuAnchor({ el: e.currentTarget, id: row.id });
                    }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Menu
        anchorEl={menuAnchor?.el}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        keepMounted
      >
        {menuAnchor ? (
          <>
            <MenuItem
              onClick={() => {
                const id = menuAnchor.id;
                handleEdit(id);
              }}
            >
              Edit
            </MenuItem>
            <MenuItem
              onClick={() => {
                const row = rawItems.find(p => p.id === menuAnchor.id);
                if (row) void handleDelete(row);
              }}
            >
              Delete
            </MenuItem>
          </>
        ) : null}
      </Menu>

      <CreateProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          void load(true);
        }}
      />
    </>
  );
};

function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const api = useApi(apmeApiRef);
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [scmToken, setScmToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = useCallback(async () => {
    if (!name.trim() || !repoUrl.trim()) {
      setError('Name and Repository URL are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.createProject({
        name,
        repo_url: repoUrl,
        branch,
        scm_token: scmToken || undefined,
      });
      onCreated();
      onClose();
      setName('');
      setRepoUrl('');
      setBranch('main');
      setScmToken('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setSaving(false);
    }
  }, [api, name, repoUrl, branch, scmToken, onCreated, onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Project</DialogTitle>
      <DialogContent>
        {error && (
          <Box mb={2} style={{ color: '#f44336' }}>
            {error}
          </Box>
        )}
        <TextField
          label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          fullWidth
          required
          margin="dense"
        />
        <TextField
          label="Repository URL"
          value={repoUrl}
          onChange={e => setRepoUrl(e.target.value)}
          fullWidth
          required
          margin="dense"
          placeholder="https://github.com/org/repo"
        />
        <TextField
          label="Branch"
          value={branch}
          onChange={e => setBranch(e.target.value)}
          fullWidth
          margin="dense"
        />
        <TextField
          label="SCM Token (optional)"
          value={scmToken}
          onChange={e => setScmToken(e.target.value)}
          fullWidth
          margin="dense"
          type="password"
          helperText="GitHub PAT or App token for PR creation"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
