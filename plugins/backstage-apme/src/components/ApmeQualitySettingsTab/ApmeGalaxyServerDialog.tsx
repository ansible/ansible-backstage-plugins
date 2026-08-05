/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useEffect, useState } from 'react';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import type {
  GalaxyServer,
  CreateGalaxyServerRequest,
  UpdateGalaxyServerRequest,
} from '@ansible/backstage-apme-common/types';

const useStyles = makeStyles(theme => ({
  field: {
    marginTop: theme.spacing(2),
    width: '100%',
  },
  errorText: {
    color: theme.palette.error.main,
    marginBottom: theme.spacing(1),
  },
}));

export interface ApmeGalaxyServerDialogProps {
  open: boolean;
  editing: GalaxyServer | null;
  onClose(): void;
  onSave(
    body: CreateGalaxyServerRequest | UpdateGalaxyServerRequest,
  ): Promise<void>;
}

const EMPTY_FORM = {
  name: '',
  url: '',
  token: '',
  auth_url: '',
};

/** Galaxy proxy / ansible.cfg server id — letters, digits, underscore, hyphen only. */
const GALAXY_SERVER_NAME_RE = /^[A-Za-z0-9_-]+$/;

export const ApmeGalaxyServerDialog = ({
  open,
  editing,
  onClose,
  onSave,
}: ApmeGalaxyServerDialogProps) => {
  const classes = useStyles();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              name: editing.name,
              url: editing.url,
              token: '',
              auth_url: editing.auth_url,
            }
          : EMPTY_FORM,
      );
      setError(undefined);
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setError('Name and URL are required.');
      return;
    }
    const name = form.name.trim();
    if (!GALAXY_SERVER_NAME_RE.test(name)) {
      setError(
        'Name must use only letters, numbers, underscores, and hyphens (e.g. rhah_published). Do not paste the hub URL into Name.',
      );
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      if (editing) {
        await onSave({
          name,
          url: form.url.trim(),
          auth_url: form.auth_url,
          token: form.token,
        });
      } else {
        await onSave({
          name,
          url: form.url.trim(),
          auth_url: form.auth_url,
          token: form.token,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = (() => {
    if (saving) {
      return 'Saving…';
    }
    return editing ? 'Save' : 'Add';
  })();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editing ? 'Edit Galaxy server' : 'Add Galaxy server'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Typography variant="body2" className={classes.errorText}>
            {error}
          </Typography>
        )}
        <TextField
          className={classes.field}
          label="Name"
          required
          fullWidth
          size="small"
          variant="outlined"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="rhah_published"
          helperText="Short id for ansible.cfg (not the hub URL). Example: galaxy, rhah_published, rhah_validated."
          disabled={saving}
        />
        <TextField
          className={classes.field}
          label="URL"
          required
          fullWidth
          size="small"
          variant="outlined"
          value={form.url}
          onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
          placeholder="https://console.redhat.com/api/automation-hub/"
          disabled={saving}
        />
        <TextField
          className={classes.field}
          label={
            editing ? 'Token (leave blank to keep current)' : 'Token'
          }
          fullWidth
          size="small"
          variant="outlined"
          type="password"
          value={form.token}
          onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
          disabled={saving}
        />
        <TextField
          className={classes.field}
          label="Auth URL (SSO endpoint)"
          fullWidth
          size="small"
          variant="outlined"
          value={form.auth_url}
          onChange={e => setForm(f => ({ ...f, auth_url: e.target.value }))}
          placeholder="https://sso.redhat.com/auth/realms/..."
          disabled={saving}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleSave()}
          color="primary"
          variant="contained"
          disabled={saving}
        >
          {saveLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
