import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import SyncIcon from '@material-ui/icons/Sync';
import ExpandLess from '@material-ui/icons/ExpandLess';
import ExpandMore from '@material-ui/icons/ExpandMore';
import FolderIcon from '@material-ui/icons/Folder';
import LanguageIcon from '@material-ui/icons/Language';
import GitHubIcon from '@material-ui/icons/GitHub';
import CloseIcon from '@material-ui/icons/Close';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

import { SyncDialogProps, SyncFilter, SourcesTree } from './types';
import { useCollectionsStyles } from './styles';
import { GitLabIcon } from './icons';
import { useSyncNotifications } from './notifications';

export const SyncDialog = ({ open, onClose }: SyncDialogProps) => {
  const classes = useCollectionsStyles();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { showSyncStarted, showSyncCompleted, showSyncFailed } =
    useSyncNotifications();

  const [sourcesTree, setSourcesTree] = useState<SourcesTree>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set(),
  );
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;

    const fetchSources = async () => {
      setLoading(true);
      setError(null);
      try {
        const baseUrl = await discoveryApi.getBaseUrl('catalog');
        // TO-DO: Update this endpoint
        const response = await fetchApi.fetch(
          `${baseUrl}/ansible-collections/sync_status`,
        );
        if (!response.ok) {
          throw new Error('Failed to fetch sources');
        }
        const data = await response.json();
        setSourcesTree(data.sourcesTree || {});

        const providers = Object.keys(data.sourcesTree || {});
        setExpandedProviders(new Set(providers));
        const hosts = new Set<string>();
        providers.forEach(provider => {
          Object.keys(data.sourcesTree[provider] || {}).forEach(host => {
            hosts.add(`${provider}:${host}`);
          });
        });
        setExpandedHosts(hosts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sources');
      } finally {
        setLoading(false);
      }
    };

    fetchSources();
  }, [open, discoveryApi, fetchApi]);

  const toggleProvider = (provider: string) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const toggleHost = (provider: string, host: string) => {
    const key = `${provider}:${host}`;
    setExpandedHosts(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isSelected = (key: string) => selectedItems.has(key);

  const toggleSelection = (key: string, level: 'provider' | 'host' | 'org') => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      const parts = key.split(':');

      if (next.has(key)) {
        next.delete(key);
        if (level === 'provider') {
          const provider = parts[0];
          Object.keys(sourcesTree[provider] || {}).forEach(host => {
            next.delete(`${provider}:${host}`);
            (sourcesTree[provider][host] || []).forEach(org => {
              next.delete(`${provider}:${host}:${org}`);
            });
          });
        } else if (level === 'host') {
          const [provider, host] = parts;
          (sourcesTree[provider]?.[host] || []).forEach(org => {
            next.delete(`${provider}:${host}:${org}`);
          });
        }
      } else {
        next.add(key);
        if (level === 'provider') {
          const provider = parts[0];
          Object.keys(sourcesTree[provider] || {}).forEach(host => {
            next.add(`${provider}:${host}`);
            (sourcesTree[provider][host] || []).forEach(org => {
              next.add(`${provider}:${host}:${org}`);
            });
          });
        } else if (level === 'host') {
          const [provider, host] = parts;
          (sourcesTree[provider]?.[host] || []).forEach(org => {
            next.add(`${provider}:${host}:${org}`);
          });
        }
      }

      return next;
    });
  };

  const getSelectionCounts = (
    key: string,
    level: 'provider' | 'host',
  ): { childrenSelected: number; totalChildren: number } => {
    const parts = key.split(':');
    let childrenSelected = 0;
    let totalChildren = 0;

    if (level === 'provider') {
      const provider = parts[0];
      Object.keys(sourcesTree[provider] || {}).forEach(host => {
        (sourcesTree[provider][host] || []).forEach(org => {
          totalChildren++;
          if (selectedItems.has(`${provider}:${host}:${org}`)) {
            childrenSelected++;
          }
        });
      });
    } else {
      const [provider, host] = parts;
      (sourcesTree[provider]?.[host] || []).forEach(org => {
        totalChildren++;
        if (selectedItems.has(`${provider}:${host}:${org}`)) {
          childrenSelected++;
        }
      });
    }

    return { childrenSelected, totalChildren };
  };

  const getIndeterminate = (
    key: string,
    level: 'provider' | 'host',
  ): boolean => {
    const { childrenSelected, totalChildren } = getSelectionCounts(key, level);
    return childrenSelected > 0 && childrenSelected < totalChildren;
  };

  const areAllChildrenSelected = (
    key: string,
    level: 'provider' | 'host',
  ): boolean => {
    const { childrenSelected, totalChildren } = getSelectionCounts(key, level);
    return totalChildren > 0 && childrenSelected === totalChildren;
  };

  const selectAll = () => {
    const all = new Set<string>();
    Object.keys(sourcesTree).forEach(provider => {
      all.add(provider);
      Object.keys(sourcesTree[provider]).forEach(host => {
        all.add(`${provider}:${host}`);
        sourcesTree[provider][host].forEach(org => {
          all.add(`${provider}:${host}:${org}`);
        });
      });
    });
    setSelectedItems(all);
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  const buildFilters = (): SyncFilter[] => {
    const filters: SyncFilter[] = [];
    const processedProviders = new Set<string>();
    const processedHosts = new Set<string>();

    Object.keys(sourcesTree).forEach(provider => {
      if (selectedItems.has(provider)) {
        const allHostsSelected = Object.keys(sourcesTree[provider]).every(
          host => {
            return sourcesTree[provider][host].every(org =>
              selectedItems.has(`${provider}:${host}:${org}`),
            );
          },
        );
        if (allHostsSelected) {
          filters.push({ scmProvider: provider });
          processedProviders.add(provider);
        }
      }
    });

    Object.keys(sourcesTree).forEach(provider => {
      if (processedProviders.has(provider)) return;
      Object.keys(sourcesTree[provider]).forEach(host => {
        const hostKey = `${provider}:${host}`;
        if (selectedItems.has(hostKey)) {
          const allOrgsSelected = sourcesTree[provider][host].every(org =>
            selectedItems.has(`${provider}:${host}:${org}`),
          );
          if (allOrgsSelected) {
            filters.push({ scmProvider: provider, hostName: host });
            processedHosts.add(hostKey);
          }
        }
      });
    });

    Object.keys(sourcesTree).forEach(provider => {
      if (processedProviders.has(provider)) return;
      Object.keys(sourcesTree[provider]).forEach(host => {
        const hostKey = `${provider}:${host}`;
        if (processedHosts.has(hostKey)) return;
        sourcesTree[provider][host].forEach(org => {
          const orgKey = `${provider}:${host}:${org}`;
          if (selectedItems.has(orgKey)) {
            filters.push({
              scmProvider: provider,
              hostName: host,
              organization: org,
            });
          }
        });
      });
    });

    return filters;
  };

  const handleClose = () => {
    setSelectedItems(new Set());
    setError(null);
    onClose();
  };

  const getSelectedSourceNames = (): string[] => {
    const sourceNames: string[] = [];

    Object.keys(sourcesTree).forEach(provider => {
      Object.keys(sourcesTree[provider]).forEach(host => {
        sourcesTree[provider][host].forEach(org => {
          const orgKey = `${provider}:${host}:${org}`;
          if (selectedItems.has(orgKey)) {
            sourceNames.push(`${host}/${org}`);
          }
        });
      });
    });

    return sourceNames;
  };

  const syncSingleSource = async (
    baseUrl: string,
    filter: SyncFilter,
    sourceName: string,
  ): Promise<void> => {
    try {
      const response = await fetchApi.fetch(
        `${baseUrl}/collections/sync/from-scm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: [filter] }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      if (
        data.results &&
        Array.isArray(data.results) &&
        data.results.length > 0
      ) {
        const result = data.results[0];
        if (result.success) {
          showSyncCompleted(sourceName);
        } else {
          showSyncFailed(sourceName, result.error);
        }
      } else if (data.successCount > 0) {
        showSyncCompleted(sourceName);
      } else {
        showSyncFailed(sourceName, 'No results returned');
      }
    } catch (err) {
      showSyncFailed(
        sourceName,
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  };

  const getFilterDisplayName = (filter: SyncFilter): string => {
    if (filter.organization && filter.hostName) {
      return `${filter.hostName}/${filter.organization}`;
    }
    if (filter.hostName) {
      return filter.hostName;
    }
    if (filter.scmProvider) {
      return filter.scmProvider;
    }
    return 'Unknown source';
  };

  const handleSync = async () => {
    const filters = buildFilters();
    if (filters.length === 0) {
      setError('Please select at least one source to sync');
      return;
    }

    const sourceNames = getSelectedSourceNames();
    showSyncStarted(sourceNames);
    handleClose();
    const baseUrl = await discoveryApi.getBaseUrl('catalog');

    const syncPromises = filters.map(filter => {
      const displayName = getFilterDisplayName(filter);
      return syncSingleSource(baseUrl, filter, displayName);
    });

    await Promise.allSettled(syncPromises);
  };

  const hasSelections = selectedItems.size > 0;
  const allSelected =
    Object.keys(sourcesTree).length > 0 &&
    Object.keys(sourcesTree).every(provider =>
      Object.keys(sourcesTree[provider]).every(host =>
        sourcesTree[provider][host].every(org =>
          selectedItems.has(`${provider}:${host}:${org}`),
        ),
      ),
    );

  const renderOrg = (provider: string, host: string, org: string) => {
    const orgKey = `${provider}:${host}:${org}`;

    return (
      <ListItem
        key={orgKey}
        button
        className={classes.orgItem}
        onClick={() => toggleSelection(orgKey, 'org')}
      >
        <ListItemIcon className={classes.checkboxIcon}>
          <Checkbox
            edge="start"
            checked={isSelected(orgKey)}
            color="primary"
            size="small"
          />
        </ListItemIcon>
        <ListItemIcon className={classes.providerIcon}>
          <FolderIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primary={org} className={classes.treeItemText} />
      </ListItem>
    );
  };

  const renderHost = (provider: string, host: string) => {
    const hostKey = `${provider}:${host}`;
    const sortedOrgs = [...sourcesTree[provider][host]].sort((a, b) =>
      a.localeCompare(b),
    );

    return (
      <div key={hostKey}>
        <ListItem
          button
          className={classes.hostItem}
          onClick={() => toggleHost(provider, host)}
        >
          <ListItemIcon className={classes.expandIcon}>
            {expandedHosts.has(hostKey) ? <ExpandLess /> : <ExpandMore />}
          </ListItemIcon>
          <ListItemIcon className={classes.checkboxIcon}>
            <Checkbox
              edge="start"
              checked={areAllChildrenSelected(hostKey, 'host')}
              indeterminate={getIndeterminate(hostKey, 'host')}
              onClick={e => {
                e.stopPropagation();
                toggleSelection(hostKey, 'host');
              }}
              color="primary"
              size="small"
            />
          </ListItemIcon>
          <ListItemIcon className={classes.providerIcon}>
            <LanguageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={host} className={classes.treeItemText} />
        </ListItem>
        <Collapse in={expandedHosts.has(hostKey)} timeout="auto" unmountOnExit>
          <List
            component="div"
            disablePadding
            className={classes.nestedListLevel2}
          >
            {sortedOrgs.map(org => renderOrg(provider, host, org))}
          </List>
        </Collapse>
      </div>
    );
  };

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'github':
        return <GitHubIcon fontSize="small" />;
      case 'gitlab':
        return <GitLabIcon fontSize="small" style={{ color: '#FC6D26' }} />;
      default:
        return <LanguageIcon fontSize="small" />;
    }
  };

  const renderProvider = (provider: string) => {
    const sortedHosts = Object.keys(sourcesTree[provider]).sort((a, b) =>
      a.localeCompare(b),
    );

    return (
      <div key={provider}>
        <ListItem
          button
          className={classes.scmProviderItem}
          onClick={() => toggleProvider(provider)}
        >
          <ListItemIcon className={classes.expandIcon}>
            {expandedProviders.has(provider) ? <ExpandLess /> : <ExpandMore />}
          </ListItemIcon>
          <ListItemIcon className={classes.checkboxIcon}>
            <Checkbox
              edge="start"
              checked={areAllChildrenSelected(provider, 'provider')}
              indeterminate={getIndeterminate(provider, 'provider')}
              onClick={e => {
                e.stopPropagation();
                toggleSelection(provider, 'provider');
              }}
              color="primary"
              size="small"
            />
          </ListItemIcon>
          <ListItemIcon className={classes.providerIcon}>
            {getProviderIcon(provider)}
          </ListItemIcon>
          <ListItemText
            primary={provider.toUpperCase()}
            className={classes.treeItemText}
          />
        </ListItem>
        <Collapse
          in={expandedProviders.has(provider)}
          timeout="auto"
          unmountOnExit
        >
          <List
            component="div"
            disablePadding
            className={classes.nestedListLevel1}
          >
            {sortedHosts.map(host => renderHost(provider, host))}
          </List>
        </Collapse>
      </div>
    );
  };

  const renderSourcesTree = (sortedProviders: string[]) => (
    <List className={classes.treeList}>
      {sortedProviders.map(provider => renderProvider(provider))}
    </List>
  );

  const renderDialogContent = () => {
    if (loading) {
      return (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight={150}
        >
          <CircularProgress />
        </Box>
      );
    }

    if (Object.keys(sourcesTree).length === 0) {
      return (
        <Alert severity="info">
          No sources configured. Add sources in your app-config to enable sync.
        </Alert>
      );
    }

    const sortedProviders = Object.keys(sourcesTree).sort((a, b) =>
      a.localeCompare(b),
    );

    return (
      <>
        {error && (
          <Alert severity="error" style={{ marginBottom: 16 }}>
            {error}
          </Alert>
        )}
        {renderSourcesTree(sortedProviders)}
      </>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      className={classes.syncDialog}
    >
      <Box className={classes.dialogTitleContainer}>
        <Box>
          <Typography className={classes.dialogTitleText}>
            Sync sources
          </Typography>
          <Typography className={classes.dialogDescription}>
            Select the repositories or automation hubs you want to refresh.
            <br /> This will run a background task to import new content.
          </Typography>
        </Box>
        <IconButton
          aria-label="close"
          onClick={handleClose}
          className={classes.closeButton}
        >
          <CloseIcon />
        </IconButton>
      </Box>
      <DialogContent className={classes.dialogContent}>
        {renderDialogContent()}
      </DialogContent>
      <DialogActions className={classes.syncDialogActions}>
        <Button
          size="small"
          onClick={allSelected ? deselectAll : selectAll}
          className={classes.selectAllButton}
          disabled={loading || Object.keys(sourcesTree).length === 0}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </Button>
        <Button onClick={handleClose} color="default">
          Cancel
        </Button>
        <Button
          onClick={handleSync}
          color="primary"
          variant="contained"
          disabled={!hasSelections || loading}
          startIcon={<SyncIcon />}
        >
          Sync Selected
        </Button>
      </DialogActions>
    </Dialog>
  );
};
