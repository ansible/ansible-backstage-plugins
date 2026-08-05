/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CardHeader from '@material-ui/core/CardHeader';
import Chip from '@material-ui/core/Chip';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import IconButton from '@material-ui/core/IconButton';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Typography from '@material-ui/core/Typography';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import { makeStyles } from '@material-ui/core/styles';
import { Progress } from '@backstage/core-components';
import type {
  GalaxyServer,
  CreateGalaxyServerRequest,
  UpdateGalaxyServerRequest,
} from '@ansible/backstage-apme-common/types';
import { apmeApiRef } from '../../api';
import { ApmeGalaxyServerDialog } from './ApmeGalaxyServerDialog';

const useStyles = makeStyles(theme => ({
  cardHeader: {
    alignItems: 'center',
    '& .MuiCardHeader-action': {
      marginTop: 0,
      marginRight: 0,
      alignSelf: 'center',
    },
  },
  hint: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
  },
  emptyText: {
    color: theme.palette.text.secondary,
    padding: theme.spacing(1, 0),
  },
  errorText: {
    color: theme.palette.error.main,
    marginBottom: theme.spacing(1),
  },
  urlCell: {
    fontSize: 13,
    wordBreak: 'break-all',
  },
  footerHint: {
    marginTop: theme.spacing(2),
    color: theme.palette.text.secondary,
    fontSize: 13,
  },
}));

/**
 * Galaxy / Automation Hub servers for dependency resolution (ADR-045).
 */
export const ApmeGalaxyServersSection = () => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);

  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState<GalaxyServer[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GalaxyServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GalaxyServer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const list = await apmeApi.listGalaxyServers();
      setServers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [apmeApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (server: GalaxyServer) => {
    setEditing(server);
    setDialogOpen(true);
  };

  const handleSave = async (
    body: CreateGalaxyServerRequest | UpdateGalaxyServerRequest,
  ) => {
    if (editing) {
      await apmeApi.updateGalaxyServer(editing.id, body);
    } else {
      await apmeApi.createGalaxyServer(body as CreateGalaxyServerRequest);
    }
    await load();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await apmeApi.deleteGalaxyServer(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <Progress />;
  }

  return (
    <>
      <Card>
        <CardHeader
          className={classes.cardHeader}
          title="Galaxy servers"
          subheader="Automation Hub and Galaxy endpoints for collection downloads"
          action={
            <Button color="primary" size="small" onClick={handleAdd}>
              Add server
            </Button>
          }
        />
        <CardContent>
          <Typography variant="body2" className={classes.hint}>
            Galaxy servers are injected into every scan and remediate operation
            so dependency health checks can reach private Automation Hub and
            authenticated Galaxy instances.
          </Typography>

          {error && (
            <Typography variant="body2" className={classes.errorText}>
              {error}
            </Typography>
          )}

          {servers.length === 0 ? (
            <Typography variant="body2" className={classes.emptyText}>
              No Galaxy servers configured. Add one to enable authenticated
              collection downloads from Automation Hub or private Galaxy
              instances.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>URL</TableCell>
                  <TableCell>Token</TableCell>
                  <TableCell>Auth URL</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {servers.map(server => (
                  <TableRow key={server.id}>
                    <TableCell>{server.name}</TableCell>
                    <TableCell className={classes.urlCell}>
                      {server.url}
                    </TableCell>
                    <TableCell>
                      {server.has_token ? (
                        <Chip
                          size="small"
                          label="configured"
                          color="primary"
                          variant="outlined"
                        />
                      ) : (
                        <Typography
                          variant="body2"
                          style={{ opacity: 0.5 }}
                        >
                          none
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell className={classes.urlCell}>
                      {server.auth_url || (
                        <Typography variant="body2" style={{ opacity: 0.5 }}>
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        aria-label={`Edit ${server.name}`}
                        onClick={() => handleEdit(server)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`Delete ${server.name}`}
                        onClick={() => setDeleteTarget(server)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Typography variant="body2" className={classes.footerHint}>
            Public Galaxy requires no token. For Red Hat Automation Hub, use the
            API URL and an offline token; set Auth URL when SSO token exchange
            is required.
          </Typography>
        </CardContent>
      </Card>

      <ApmeGalaxyServerDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Galaxy server</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Typography variant="body2" className={classes.errorText}>
              {deleteError}
            </Typography>
          )}
          <Typography>
            Delete Galaxy server <strong>{deleteTarget?.name}</strong>? This
            cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleDeleteConfirm()}
            color="primary"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
