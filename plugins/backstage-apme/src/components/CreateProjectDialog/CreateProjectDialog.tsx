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

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  CircularProgress,
  makeStyles,
  Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { useApi } from '@backstage/core-plugin-api';
import { apmeApiRef } from '../../api';

const useStyles = makeStyles(theme => ({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    minWidth: 400,
  },
  actions: {
    padding: theme.spacing(2),
  },
}));

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export const CreateProjectDialog = ({
  open,
  onClose,
  onCreated,
}: CreateProjectDialogProps) => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !repoUrl.trim()) {
      setError('Name and repository URL are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apmeApi.createProject({
        name: name.trim(),
        repo_url: repoUrl.trim(),
        branch: branch.trim() || 'main',
      });
      setName('');
      setRepoUrl('');
      setBranch('main');
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setRepoUrl('');
      setBranch('main');
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Project to APME</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" paragraph>
          Register a Git repository with APME for Ansible content analysis.
        </Typography>

        {error && (
          <Alert severity="error" style={{ marginBottom: 16 }}>
            {error}
          </Alert>
        )}

        <div className={classes.form}>
          <TextField
            label="Project Name"
            value={name}
            onChange={e => setName(e.target.value)}
            variant="outlined"
            fullWidth
            required
            disabled={loading}
            placeholder="My Ansible Project"
          />
          <TextField
            label="Repository URL"
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            variant="outlined"
            fullWidth
            required
            disabled={loading}
            placeholder="https://github.com/org/repo"
            helperText="HTTPS URL to the Git repository"
          />
          <TextField
            label="Branch"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            variant="outlined"
            fullWidth
            disabled={loading}
            placeholder="main"
            helperText="Default branch to analyze"
          />
        </div>
      </DialogContent>
      <DialogActions className={classes.actions}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          color="primary"
          variant="contained"
          disabled={loading || !name.trim() || !repoUrl.trim()}
          startIcon={loading ? <CircularProgress size={20} /> : undefined}
        >
          {loading ? 'Creating...' : 'Create Project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
