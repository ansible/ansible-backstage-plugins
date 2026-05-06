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

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Typography,
  makeStyles,
  Box,
  LinearProgress,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import SyncIcon from '@material-ui/icons/Sync';
import { apmeApiRef } from '../../api';

const useStyles = makeStyles(theme => ({
  content: {
    minWidth: 500,
    minHeight: 200,
  },
  summary: {
    marginBottom: theme.spacing(2),
  },
  list: {
    maxHeight: 360,
    overflow: 'auto',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
  listItem: {
    paddingRight: theme.spacing(12),
  },
  progress: {
    marginTop: theme.spacing(2),
  },
  centerBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(4),
    gap: theme.spacing(2),
  },
  doneChip: {
    backgroundColor: '#4caf50',
    color: 'white',
  },
  errorChip: {
    backgroundColor: '#f44336',
    color: 'white',
  },
}));

type SyncItemStatus = 'pending' | 'importing' | 'scanning' | 'done' | 'error';

interface SyncItem {
  entity: Entity;
  repoUrl: string;
  name: string;
  branch: string;
  status: SyncItemStatus;
  error?: string;
}

interface SyncFromCatalogDialogProps {
  open: boolean;
  onClose: () => void;
  onSynced: () => void;
}

function extractRepoUrl(annotation: string | undefined): string | undefined {
  if (!annotation) return undefined;
  return annotation.startsWith('url:') ? annotation.slice(4) : annotation;
}

export const SyncFromCatalogDialog = ({
  open,
  onClose,
  onSynced,
}: SyncFromCatalogDialogProps) => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const catalogApi = useApi(catalogApiRef);

  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncItems, setSyncItems] = useState<SyncItem[]>([]);
  const [alreadyTrackedCount, setAlreadyTrackedCount] = useState(0);
  const [totalCatalogCount, setTotalCatalogCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    setLoadError(null);
    setSyncItems([]);
    setSyncDone(false);

    try {
      const [catalogResponse, apmeProjects] = await Promise.all([
        catalogApi.getEntities({
          filter: [{ kind: 'Component', 'spec.type': 'git-repository' }],
        }),
        apmeApi.getProjects(),
      ]);

      const entities = Array.isArray(catalogResponse)
        ? catalogResponse
        : catalogResponse.items || [];

      setTotalCatalogCount(entities.length);

      const trackedUrls = new Set(
        apmeProjects.map(p => p.repo_url.toLowerCase()),
      );

      const untracked: SyncItem[] = [];
      let tracked = 0;

      for (const entity of entities) {
        const rawAnnotation =
          entity.metadata.annotations?.['backstage.io/source-location'];
        const repoUrl = extractRepoUrl(rawAnnotation);
        if (!repoUrl) continue;

        if (trackedUrls.has(repoUrl.toLowerCase())) {
          tracked++;
          continue;
        }

        const specAny = entity.spec as Record<string, unknown> | undefined;
        const branch =
          (specAny?.repository_default_branch as string | undefined) || 'main';

        untracked.push({
          entity,
          repoUrl,
          name: entity.metadata.title || entity.metadata.name,
          branch,
          status: 'pending',
        });
      }

      setAlreadyTrackedCount(tracked);
      setSyncItems(untracked);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoadingData(false);
    }
  }, [apmeApi, catalogApi]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  const handleSync = useCallback(async () => {
    setSyncing(true);

    for (let i = 0; i < syncItems.length; i++) {
      const item = syncItems[i];

      setSyncItems(prev =>
        prev.map((it, idx) =>
          idx === i ? { ...it, status: 'importing' } : it,
        ),
      );

      try {
        const project = await apmeApi.createProject({
          name: item.name,
          repo_url: item.repoUrl,
          branch: item.branch,
        });

        setSyncItems(prev =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: 'scanning' } : it,
          ),
        );

        await apmeApi.triggerScan(project.id);

        setSyncItems(prev =>
          prev.map((it, idx) => (idx === i ? { ...it, status: 'done' } : it)),
        );
      } catch (err) {
        setSyncItems(prev =>
          prev.map((it, idx) =>
            idx === i
              ? { ...it, status: 'error', error: (err as Error).message }
              : it,
          ),
        );
      }
    }

    setSyncing(false);
    setSyncDone(true);
  }, [apmeApi, syncItems]);

  const completedCount = syncItems.filter(it => it.status === 'done').length;
  const errorCount = syncItems.filter(it => it.status === 'error').length;

  const handleClose = () => {
    if (!syncing) {
      if (syncDone) {
        onSynced();
      } else {
        onClose();
      }
    }
  };

  const renderItemStatus = (item: SyncItem) => {
    switch (item.status) {
      case 'importing':
        return (
          <Chip
            size="small"
            label="Importing..."
            icon={<CircularProgress size={12} />}
          />
        );
      case 'scanning':
        return (
          <Chip
            size="small"
            label="Scanning..."
            icon={<CircularProgress size={12} />}
          />
        );
      case 'done':
        return (
          <Chip
            size="small"
            className={classes.doneChip}
            label="Done"
            icon={<CheckCircleIcon style={{ color: 'white', fontSize: 14 }} />}
          />
        );
      case 'error':
        return (
          <Chip
            size="small"
            className={classes.errorChip}
            label="Error"
            icon={<ErrorIcon style={{ color: 'white', fontSize: 14 }} />}
          />
        );
      default:
        return <Chip size="small" label="Pending" />;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Sync Git Repositories from Catalog</DialogTitle>
      <DialogContent className={classes.content}>
        {loadingData && (
          <Box className={classes.centerBox}>
            <CircularProgress />
            <Typography variant="body2" color="textSecondary">
              Loading catalog repositories...
            </Typography>
          </Box>
        )}

        {loadError && (
          <Alert severity="error" style={{ marginTop: 8 }}>
            {loadError}
          </Alert>
        )}

        {!loadingData && !loadError && (
          <>
            <Typography
              variant="body2"
              color="textSecondary"
              className={classes.summary}
            >
              Found <strong>{totalCatalogCount}</strong> git repositories in the
              catalog.{' '}
              <strong>{alreadyTrackedCount}</strong> already tracked in APME.{' '}
              <strong>{syncItems.length}</strong> will be imported.
            </Typography>

            {syncItems.length === 0 && (
              <Alert severity="success">
                All catalog git repositories are already tracked in APME.
              </Alert>
            )}

            {syncItems.length > 0 && (
              <>
                {syncing && (
                  <Box className={classes.progress}>
                    <LinearProgress
                      variant="determinate"
                      value={
                        ((completedCount + errorCount) / syncItems.length) * 100
                      }
                    />
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      style={{ marginTop: 4, display: 'block' }}
                    >
                      {completedCount + errorCount} / {syncItems.length}{' '}
                      processed
                    </Typography>
                  </Box>
                )}

                {syncDone && (
                  <Alert
                    severity={errorCount > 0 ? 'warning' : 'success'}
                    style={{ marginBottom: 8 }}
                  >
                    Import complete: {completedCount} succeeded
                    {errorCount > 0 && `, ${errorCount} failed`}.
                  </Alert>
                )}

                <List dense className={classes.list}>
                  {syncItems.map((item, idx) => (
                    <ListItem
                      key={`${item.repoUrl}-${idx}`}
                      className={classes.listItem}
                      divider={idx < syncItems.length - 1}
                    >
                      <ListItemText
                        primary={item.name}
                        secondary={
                          <>
                            {item.repoUrl}
                            {item.error && (
                              <Typography
                                component="span"
                                variant="caption"
                                color="error"
                                display="block"
                              >
                                {item.error}
                              </Typography>
                            )}
                          </>
                        }
                      />
                      <ListItemSecondaryAction>
                        {renderItemStatus(item)}
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={syncing}>
          {syncDone ? 'Close' : 'Cancel'}
        </Button>
        {!syncDone && syncItems.length > 0 && (
          <Button
            variant="contained"
            color="primary"
            onClick={handleSync}
            disabled={syncing || loadingData}
            startIcon={
              syncing ? <CircularProgress size={20} /> : <SyncIcon />
            }
          >
            {syncing
              ? `Importing ${completedCount + errorCount}/${syncItems.length}...`
              : `Import & Analyze All (${syncItems.length})`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
