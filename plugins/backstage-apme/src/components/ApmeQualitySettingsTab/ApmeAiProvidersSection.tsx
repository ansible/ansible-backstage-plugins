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

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CardHeader from '@material-ui/core/CardHeader';
import Chip from '@material-ui/core/Chip';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Divider from '@material-ui/core/Divider';
import IconButton from '@material-ui/core/IconButton';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import { makeStyles } from '@material-ui/core/styles';
import { Progress } from '@backstage/core-components';
import type {
  ApmeAiProviderSummary,
  ApmeAiProviderConfigureRequest,
  ApmeAiStatus,
} from '@ansible/backstage-apme-common/types';
import { normalizeApmeAiProviders } from '@ansible/backstage-apme-common/types';
import { apmeApiRef } from '../../api';
import { ApmeAiProviderDialog } from './ApmeAiProviderDialog';

const useStyles = makeStyles(theme => ({
  // MUI CardHeader action defaults to alignSelf:flex-start + marginTop:-4.
  cardHeader: {
    alignItems: 'center',
    '& .MuiCardHeader-action': {
      marginTop: 0,
      marginRight: 0,
      alignSelf: 'center',
    },
  },
  headerActions: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1),
    '& > *': {
      marginTop: 0,
      marginBottom: 0,
    },
  },
  statusButton: {
    // Non-interactive status — same size="small" Button metrics as Add provider
    pointerEvents: 'none',
    cursor: 'default',
  },
  emptyText: {
    color: theme.palette.text.secondary,
    padding: theme.spacing(1, 0),
  },
  sectionHint: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
  modelsHeading: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(0.5),
  },
  modelChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(0.5),
  },
  errorText: {
    color: theme.palette.error.main,
    marginBottom: theme.spacing(1),
  },
  engineChip: {
    marginRight: theme.spacing(0.5),
  },
}));

interface AiModelRow {
  id: string;
  provider: string;
  name: string;
}

interface RemoveConfirmDialogProps {
  open: boolean;
  providerId: string;
  onCancel(): void;
  onConfirm(): void;
}

const RemoveConfirmDialog = ({
  open,
  providerId,
  onCancel,
  onConfirm,
}: RemoveConfirmDialogProps) => (
  <Dialog
    open={open}
    maxWidth="xs"
    fullWidth
    aria-labelledby="apme-remove-provider-title"
  >
    <DialogTitle id="apme-remove-provider-title">Remove provider</DialogTitle>
    <DialogContent dividers>
      <Typography>
        Remove provider <strong>{providerId}</strong>? This cannot be undone.
      </Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} color="primary">
        Cancel
      </Button>
      <Button onClick={onConfirm} color="primary" variant="contained">
        Remove
      </Button>
    </DialogActions>
  </Dialog>
);

/**
 * AI providers card rendered below the ansible-core card in Quality settings (US-016).
 */
export const ApmeAiProvidersSection = () => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);

  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ApmeAiProviderSummary[]>([]);
  const [models, setModels] = useState<AiModelRow[]>([]);
  const [aiStatus, setAiStatus] = useState<ApmeAiStatus | undefined>();
  const [error, setError] = useState<string | undefined>();

  const [addOpen, setAddOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<
    ApmeAiProviderSummary | undefined
  >();
  const [removeProvider, setRemoveProvider] = useState<
    ApmeAiProviderSummary | undefined
  >();
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [prov, status, modelList, config] = await Promise.all([
        apmeApi.getAiProviders().catch(() => [] as ApmeAiProviderSummary[]),
        apmeApi.getAiStatus().catch(() => undefined),
        apmeApi.getAiModels().catch(() => [] as AiModelRow[]),
        apmeApi.getAiConfig().catch(() => undefined),
      ]);
      let nextProviders = prov;
      // Deploy-time ConfigMap providers often show up via /config while
      // /providers is empty — fall back so the list is not blank.
      if (nextProviders.length === 0 && config !== undefined) {
        nextProviders = normalizeApmeAiProviders(config);
      }
      nextProviders = [...nextProviders].sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { sensitivity: 'base' }),
      );
      setProviders(nextProviders);
      setAiStatus(status);
      setModels(modelList);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [apmeApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (id: string, body: ApmeAiProviderConfigureRequest) => {
    await apmeApi.configureAiProvider(id, body);
    await load();
  };

  const handleRemoveConfirm = async () => {
    if (!removeProvider) return;
    setRemoving(true);
    setRemoveError(undefined);
    try {
      await apmeApi.deleteAiProvider(removeProvider.id);
      setRemoveProvider(undefined);
      await load();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  };

  const statusLabel = aiStatus
    ? aiStatus.connected
      ? `Connected · ${aiStatus.modelCount} model${aiStatus.modelCount === 1 ? '' : 's'}`
      : 'Disconnected'
    : undefined;

  return (
    <>
      <Card>
        <CardHeader
          className={classes.cardHeader}
          title="AI providers"
          subheader="Provider accounts used for AI-assisted remediation"
          action={
            <Box className={classes.headerActions}>
              {statusLabel && (
                <Button
                  color={aiStatus?.connected ? 'primary' : 'default'}
                  variant="contained"
                  size="small"
                  disableElevation
                  disableRipple
                  tabIndex={-1}
                  aria-disabled="true"
                  className={classes.statusButton}
                >
                  {statusLabel}
                </Button>
              )}
              <Button
                color="primary"
                variant="outlined"
                size="small"
                onClick={() => setAddOpen(true)}
              >
                Add provider
              </Button>
            </Box>
          }
        />
        <CardContent>
          {error && (
            <Typography
              variant="body2"
              className={classes.errorText}
              role="alert"
            >
              {error}
            </Typography>
          )}
          {removeError && (
            <Typography
              variant="body2"
              className={classes.errorText}
              role="alert"
            >
              {removeError}
            </Typography>
          )}

          {loading && <Progress />}

          {!loading && providers.length === 0 && (
            <Typography variant="body2" className={classes.emptyText}>
              {models.length > 0
                ? 'No editable providers listed. Models below are available for scans (read-only from Primary). Use Add provider to create a Portal-managed account, or check deploy-time config.'
                : 'No providers configured. Add a provider to enable AI-assisted remediation.'}
            </Typography>
          )}

          {!loading && providers.length > 0 && (
            <List disablePadding>
              {providers.map((p, idx) => (
                <div key={p.id}>
                  {idx > 0 && <Divider component="li" />}
                  <ListItem disableGutters>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center">
                          <Typography variant="body1" component="span">
                            {p.id}
                          </Typography>
                          <Chip
                            label={p.engine}
                            size="small"
                            className={classes.engineChip}
                            style={{ marginLeft: 8 }}
                          />
                        </Box>
                      }
                      secondary={
                        p.models.length > 0
                          ? `${p.models.length} model${p.models.length === 1 ? '' : 's'}: ${p.models.join(', ')}`
                          : 'No models configured'
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        aria-label={`Edit provider ${p.id}`}
                        size="small"
                        onClick={() => setEditProvider(p)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label={`Remove provider ${p.id}`}
                        size="small"
                        onClick={() => {
                          setRemoveError(undefined);
                          setRemoveProvider(p);
                        }}
                        disabled={removing}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </div>
              ))}
            </List>
          )}

          {!loading && models.length > 0 && (
            <Box>
              <Typography
                variant="subtitle2"
                className={classes.modelsHeading}
              >
                Available models
              </Typography>
              <Typography variant="body2" className={classes.sectionHint}>
                Read-only list from Primary (same source as the Quality tab AI
                toggle). Edit providers above to change available models.
              </Typography>
              <Box className={classes.modelChips}>
                {models.map(m => (
                  <Chip
                    key={m.id}
                    size="small"
                    label={m.name || m.id}
                    title={
                      m.provider
                        ? `${m.id} (${m.provider})`
                        : m.id
                    }
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      <ApmeAiProviderDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleSave}
      />

      {editProvider && (
        <ApmeAiProviderDialog
          open
          provider={editProvider}
          onClose={() => setEditProvider(undefined)}
          onSave={handleSave}
        />
      )}

      {removeProvider && (
        <RemoveConfirmDialog
          open
          providerId={removeProvider.id}
          onCancel={() => setRemoveProvider(undefined)}
          onConfirm={() => void handleRemoveConfirm()}
        />
      )}
    </>
  );
};
