import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { ContentHeader, Progress } from '@backstage/core-components';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@material-ui/core';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import { apmeApiRef } from '../api/ApmeApi';
import { AI_MODEL_STORAGE_KEY } from '../components/CheckOptionsForm';
import type { AiModelInfo, GalaxyServer } from '../types/api';

export const SettingsPage = () => {
  const api = useApi(apmeApiRef);
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(AI_MODEL_STORAGE_KEY) ?? '',
  );
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    api
      .listAiModels()
      .then(m => {
        setModels(m);
        const stored = localStorage.getItem(AI_MODEL_STORAGE_KEY);
        const ids = new Set(m.map(x => x.id));
        if (stored && ids.has(stored)) {
          setSelectedModel(stored);
        } else {
          const f = m[0]?.id ?? '';
          setSelectedModel(f);
          if (f) localStorage.setItem(AI_MODEL_STORAGE_KEY, f);
          else localStorage.removeItem(AI_MODEL_STORAGE_KEY);
        }
      })
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, [api]);

  const handleModelChange = useCallback((value: string) => {
    setSelectedModel(value);
    if (value) localStorage.setItem(AI_MODEL_STORAGE_KEY, value);
    else localStorage.removeItem(AI_MODEL_STORAGE_KEY);
  }, []);

  const current = models.find(m => m.id === selectedModel);

  return (
    <>
      <ContentHeader title="Settings" />
      <Box maxWidth={800}>
        <Card style={{ marginBottom: 24 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              AI Configuration
            </Typography>
            {modelsLoading ? (
              <Progress />
            ) : models.length === 0 ? (
              <Typography color="textSecondary">
                No models available. Ensure the Abbenay AI service is running.
              </Typography>
            ) : (
              <>
                <FormControl fullWidth margin="dense">
                  <InputLabel>Default AI model</InputLabel>
                  <Select
                    value={selectedModel}
                    onChange={e => handleModelChange(e.target.value as string)}
                  >
                    {models.map(m => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.id} ({m.provider})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {current && (
                  <Box mt={1}>
                    <Chip
                      label={current.provider}
                      color="primary"
                      size="small"
                    />{' '}
                    <Typography variant="caption" color="textSecondary">
                      {current.name}
                    </Typography>
                  </Box>
                )}
              </>
            )}
            <Typography
              variant="body2"
              color="textSecondary"
              style={{ marginTop: 16 }}
            >
              The selected model is used for AI-assisted remediation when AI is
              enabled. Stored in your browser.
            </Typography>
          </CardContent>
        </Card>

        <GalaxyServersSection />
      </Box>
    </>
  );
};

function GalaxyServersSection() {
  const api = useApi(apmeApiRef);
  const [servers, setServers] = useState<GalaxyServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GalaxyServer | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    api
      .listGalaxyServers()
      .then(setServers)
      .catch(() => setServers([]))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleEdit = (s: GalaxyServer) => {
    setEditing(s);
    setDialogOpen(true);
  };
  const handleDelete = async (s: GalaxyServer) => {
    if (!window.confirm(`Delete Galaxy server "${s.name}"?`)) return;
    try {
      await api.deleteGalaxyServer(s.id);
      refresh();
    } catch {
      /* ignore */
    }
  };

  return (
    <Card>
      <CardContent>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={2}
        >
          <Typography variant="h6">Galaxy Servers</Typography>
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAdd}
          >
            Add server
          </Button>
        </Box>
        {loading ? (
          <Progress />
        ) : servers.length === 0 ? (
          <Typography color="textSecondary">
            No Galaxy servers configured. Add one to enable authenticated
            collection downloads.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>URL</TableCell>
                <TableCell>Token</TableCell>
                <TableCell>Auth URL</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {servers.map(s => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell style={{ fontSize: 13, wordBreak: 'break-all' }}>
                    {s.url}
                  </TableCell>
                  <TableCell>
                    {s.has_token ? (
                      <Chip label="configured" color="primary" size="small" />
                    ) : (
                      <Typography color="textSecondary" variant="caption">
                        none
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell style={{ fontSize: 13, wordBreak: 'break-all' }}>
                    {s.auth_url || '—'}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleEdit(s)}
                      aria-label={`Edit ${s.name}`}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(s)}
                      aria-label={`Delete ${s.name}`}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Typography
          variant="caption"
          color="textSecondary"
          style={{ marginTop: 12, display: 'block' }}
        >
          Galaxy servers are injected into every scan and remediate operation.
          Tokens are stored in the Gateway database.
        </Typography>
      </CardContent>
      <GalaxyServerDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={refresh}
      />
    </Card>
  );
}

function GalaxyServerDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: GalaxyServer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi(apmeApiRef);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setUrl(editing.url);
        setToken('');
        setAuthUrl(editing.auth_url);
      } else {
        setName('');
        setUrl('');
        setToken('');
        setAuthUrl('');
      }
      setError('');
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) {
      setError('Name and URL are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.updateGalaxyServer(editing.id, {
          name,
          url,
          token,
          auth_url: authUrl,
        });
      } else {
        await api.createGalaxyServer({ name, url, token, auth_url: authUrl });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editing ? 'Edit Galaxy Server' : 'Add Galaxy Server'}
      </DialogTitle>
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
          placeholder="automation_hub"
        />
        <TextField
          label="URL"
          value={url}
          onChange={e => setUrl(e.target.value)}
          fullWidth
          required
          margin="dense"
          placeholder="https://console.redhat.com/api/automation-hub/"
        />
        <TextField
          label={editing ? 'Token (leave blank to keep current)' : 'Token'}
          value={token}
          onChange={e => setToken(e.target.value)}
          fullWidth
          margin="dense"
          type="password"
        />
        <TextField
          label="Auth URL (SSO endpoint)"
          value={authUrl}
          onChange={e => setAuthUrl(e.target.value)}
          fullWidth
          margin="dense"
          placeholder="https://sso.redhat.com/auth/realms/..."
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
          {saving ? 'Saving...' : editing ? 'Save' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
