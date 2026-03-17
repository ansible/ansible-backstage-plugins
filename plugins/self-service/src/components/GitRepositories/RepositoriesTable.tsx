import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Box,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import Star from '@material-ui/icons/Star';
import StarBorder from '@material-ui/icons/StarBorder';
import { Entity } from '@backstage/catalog-model';
import {
  CatalogFilterLayout,
  EntityKindFilter,
  EntityListProvider,
  EntityTypeFilter,
  UserListPicker,
  catalogApiRef,
  useEntityList,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { Progress, Table, TableColumn } from '@backstage/core-components';

import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import GitHubIcon from '@material-ui/icons/GitHub';
import { getSourceUrl, formatTimeAgo } from '../CollectionsCatalog/utils';
import { EntityLinkButton, GitLabIcon, SyncStatusMap } from '../common';
import {
  useCollectionsStyles,
  useTableWrapperStyles,
} from '../CollectionsCatalog/styles';
import {
  COLUMN_SOURCE_TOOLTIP,
  COLUMN_CONTAINS_TOOLTIP,
  COLUMN_LAST_ACTIVITY_TOOLTIP,
  COLUMN_LAST_SYNC_TOOLTIP,
} from './constants';
import { rootRouteRef } from '../../routes';
import { useLatestCIActivity } from './useLatestCIActivity';

const StarredIcon = () => <Star style={{ color: '#ffb74d' }} />;

const GitRepositoriesTypeFilter = () => {
  const { filters, updateFilters } = useEntityList();
  useEffect(() => {
    if (!filters.kind || !filters.type) {
      updateFilters(prev => ({
        ...prev,
        kind: new EntityKindFilter('Component', 'Component'),
        type: new EntityTypeFilter('git-repository'),
      }));
    }
  }, [filters.kind, filters.type, updateFilters]);
  return null;
};

const ColumnHeaderWithTooltip = ({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) => (
  <Box display="inline-flex" alignItems="center" component="span">
    <span>{label}</span>
    <Tooltip title={tooltip} arrow placement="top">
      <HelpOutlineIcon
        style={{ fontSize: 14, marginLeft: 4, verticalAlign: 'middle' }}
      />
    </Tooltip>
  </Box>
);

interface RepositoriesTableProps {
  syncStatusMap: SyncStatusMap;
  onSourcesStatusChange?: (hasSources: boolean | null) => void;
}

const getRepoHost = (entity: Entity): string => {
  const annotations = entity.metadata?.annotations || {};
  let host = annotations['ansible.io/scm-host'];
  if (typeof host === 'string' && host) {
    host = host.trim();
    if (host.startsWith('http://') || host.startsWith('https://')) {
      try {
        host = new URL(host).hostname;
      } catch {
        // leave as-is if URL parse fails
      }
    }
    return host;
  }
  const provider = (annotations['ansible.io/scm-provider'] ?? '').toLowerCase();
  if (provider === 'github') return 'github.com';
  if (provider === 'gitlab') return 'gitlab.com';
  return provider || '';
};

const getRepoHostName = (entity: Entity): string => {
  const annotations = entity.metadata?.annotations || {};
  const name = annotations['ansible.io/scm-host-name'];
  if (typeof name === 'string' && name.trim()) return name.trim();
  return getRepoHost(entity);
};

const RepositoriesTableInner = ({
  syncStatusMap,
  onSourcesStatusChange,
}: RepositoriesTableProps) => {
  const classes = useCollectionsStyles();
  const tableWrapperClasses = useTableWrapperStyles();
  const catalogApi = useApi(catalogApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const { filters } = useEntityList();

  const [loading, setLoading] = useState(true);
  const [allRepos, setAllRepos] = useState<Entity[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [allSources, setAllSources] = useState<
    Array<{ value: string; label: string }>
  >([{ value: 'All', label: 'All' }]);
  const [menuAnchor, setMenuAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  const { lastActivityMap, loading: lastActivityLoading } =
    useLatestCIActivity(allRepos);

  const fetchRepos = useCallback(() => {
    setLoading(true);
    catalogApi
      .getEntities({
        filter: [{ kind: 'Component', 'spec.type': 'git-repository' }],
      })
      .then(response => {
        const items = Array.isArray(response) ? response : response.items || [];
        setAllRepos(items);
        if (items.length > 0) {
          const hostToLabel = new Map<string, string>();
          for (const entity of items) {
            const host = getRepoHost(entity);
            if (host && !hostToLabel.has(host)) {
              hostToLabel.set(host, getRepoHostName(entity));
            }
          }
          const sources = [
            { value: 'All', label: 'All' },
            ...Array.from(hostToLabel.entries())
              .sort((a, b) =>
                a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }),
              )
              .map(([value, label]) => ({ value, label })),
          ];
          setAllSources(sources);
        }
        onSourcesStatusChange?.(items.length > 0 ? true : null);
      })
      .catch(() => {
        setAllRepos([]);
        onSourcesStatusChange?.(null);
      })
      .finally(() => setLoading(false));
  }, [catalogApi, onSourcesStatusChange]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const repos = useMemo(() => {
    let list = allRepos;
    if (filters.user?.value === 'starred') {
      list = list.filter(e => isStarredEntity(e));
    }
    const sourceMatch = (e: Entity) =>
      sourceFilter === 'All' || getRepoHost(e) === sourceFilter;
    return list.filter(sourceMatch).sort((a, b) => {
      const nameA = (a.metadata?.title ?? a.metadata?.name ?? '').toLowerCase();
      const nameB = (b.metadata?.title ?? b.metadata?.name ?? '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [allRepos, filters.user?.value, isStarredEntity, sourceFilter]);

  const handleKebabOpen = (
    event: React.MouseEvent<HTMLElement>,
    entity: Entity,
  ) => {
    event.stopPropagation();
    setMenuAnchor({ left: event.clientX, top: event.clientY });
    setSelectedEntity(entity);
  };

  const handleKebabClose = () => {
    setMenuAnchor(null);
    setSelectedEntity(null);
  };

  const handleViewInSource = () => {
    if (selectedEntity) {
      const url = getSourceUrl(selectedEntity);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }
    handleKebabClose();
  };

  const getSourceProviderName = (entity: Entity): string => {
    const provider = (
      entity.metadata?.annotations?.['ansible.io/scm-provider'] ?? ''
    ).toLowerCase();
    if (provider === 'gitlab') return 'GitLab';
    if (provider === 'github') return 'GitHub';
    if (provider === 'pah') return 'Private Automation Hub';
    if (provider) return provider.charAt(0).toUpperCase() + provider.slice(1);
    return '—';
  };

  const getSourceIcon = (entity: Entity) => {
    const provider = (
      entity.metadata?.annotations?.['ansible.io/scm-provider'] ?? ''
    ).toLowerCase();
    if (provider === 'gitlab') {
      return (
        <GitLabIcon
          style={{ fontSize: 20, marginRight: 8, color: '#FC6D26' }}
        />
      );
    }
    if (provider === 'github') {
      return <GitHubIcon style={{ fontSize: 20, marginRight: 8 }} />;
    }
    return null;
  };

  const getLastSyncForEntity = (entity: Entity): string => {
    const sourceId =
      entity.metadata?.annotations?.['ansible.io/discovery-source-id'];
    if (!sourceId) return '—';
    const status = syncStatusMap[sourceId];
    if (!status?.lastSyncTime) return 'Never synced';
    return formatTimeAgo(status.lastSyncTime);
  };

  const columns: TableColumn<Entity>[] = [
    {
      title: 'Git Repository',
      id: 'name',
      field: 'metadata.name',
      highlight: true,
      width: '28%',
      render: (entity: Entity) => {
        const repoName = entity.metadata?.title ?? entity.metadata?.name ?? '—';
        const linkPath = `${rootLink()}/repositories/${entity.metadata?.name ?? ''}`;
        return (
          <EntityLinkButton linkPath={linkPath} className={classes.entityLink}>
            {repoName}
          </EntityLinkButton>
        );
      },
    },
    {
      title: (
        <ColumnHeaderWithTooltip
          label="Source"
          tooltip={COLUMN_SOURCE_TOOLTIP}
        />
      ) as unknown as string,
      id: 'source',
      render: (entity: Entity) => {
        const url = getSourceUrl(entity);
        const providerName = getSourceProviderName(entity);
        return (
          <Box display="flex" alignItems="center">
            {getSourceIcon(entity)}
            {url ? (
              <Link
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                color="primary"
                underline="hover"
                style={{ marginLeft: 8 }}
              >
                {providerName}
              </Link>
            ) : (
              <Typography
                variant="body2"
                component="span"
                style={{ marginLeft: 8 }}
              >
                {providerName}
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      title: (
        <ColumnHeaderWithTooltip
          label="Contains"
          tooltip={COLUMN_CONTAINS_TOOLTIP}
        />
      ) as unknown as string,
      id: 'contains',
      render: (entity: Entity) => {
        const spec = entity.spec as
          | {
              repository_collection_count?: number;
              repository_ee_count?: number;
            }
          | undefined;
        const collectionCount = spec?.repository_collection_count ?? 0;
        const eeCount = spec?.repository_ee_count ?? 0;
        const parts: string[] = [];
        if (collectionCount > 0)
          parts.push(
            `${collectionCount} collection${collectionCount === 1 ? '' : 's'}`,
          );
        if (eeCount > 0) parts.push(`${eeCount} EE${eeCount === 1 ? '' : 's'}`);
        return (
          <Typography variant="body2" color="textSecondary">
            {parts.length > 0 ? parts.join(', ') : '—'}
          </Typography>
        );
      },
    },
    {
      title: (
        <ColumnHeaderWithTooltip
          label="Last Activity"
          tooltip={COLUMN_LAST_ACTIVITY_TOOLTIP}
        />
      ) as unknown as string,
      id: 'lastActivity',
      render: (entity: Entity) => {
        const name = entity.metadata?.name ?? '';
        const entry = lastActivityMap[name];
        const text = lastActivityLoading ? '—' : (entry?.text ?? 'N/A');
        const url = entry?.url;
        return (
          <Typography variant="body2" color="textSecondary" component="span">
            {url ? (
              <Link
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                color="primary"
                underline="hover"
              >
                {text}
              </Link>
            ) : (
              text
            )}
          </Typography>
        );
      },
    },
    {
      title: (
        <ColumnHeaderWithTooltip
          label="Last Sync"
          tooltip={COLUMN_LAST_SYNC_TOOLTIP}
        />
      ) as unknown as string,
      id: 'lastSync',
      render: (entity: Entity) => (
        <Typography variant="body2">{getLastSyncForEntity(entity)}</Typography>
      ),
    },
    {
      title: 'Actions',
      id: 'actions',
      render: (entity: Entity) => {
        const isStarred = isStarredEntity(entity);
        const starredTitle = isStarred
          ? 'Remove from favorites'
          : 'Add to favorites';
        return (
          <div
            className={classes.flex}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <Tooltip title={starredTitle}>
              <IconButton
                size="small"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleStarredEntity(entity);
                }}
                onMouseDown={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={classes.actionButton}
                aria-label={starredTitle}
              >
                {isStarred ? <StarredIcon /> : <StarBorder />}
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              onClick={(e: React.MouseEvent<HTMLElement>) =>
                handleKebabOpen(e, entity)
              }
              className={classes.actionButton}
              aria-label="Actions"
            >
              <MoreVertIcon />
            </IconButton>
          </div>
        );
      },
    },
  ];

  if (loading) {
    return <Progress />;
  }

  if (allRepos.length === 0) {
    return (
      <Box className={classes.emptyState}>
        <Typography className={classes.emptyStateTitle}>
          No Git repositories found
        </Typography>
        <Typography className={classes.emptyStateDescription}>
          Sync your Ansible content sources to discover repositories that
          contain collections.
        </Typography>
      </Box>
    );
  }

  return (
    <div style={{ flexDirection: 'column', width: '100%' }}>
      <GitRepositoriesTypeFilter />
      <CatalogFilterLayout>
        <CatalogFilterLayout.Filters>
          <UserListPicker availableFilters={['starred', 'all']} />
          <Box className={tableWrapperClasses.filterGroup}>
            <Typography
              style={{ marginBottom: 8, fontWeight: 600, fontSize: '0.875rem' }}
            >
              Source
            </Typography>
            <Paper className={tableWrapperClasses.paper}>
              <Autocomplete<{ value: string; label: string }>
                options={allSources}
                getOptionLabel={(opt: { value: string; label: string }) =>
                  opt.label
                }
                getOptionSelected={(
                  opt: { value: string; label: string },
                  val: { value: string; label: string },
                ) => opt.value === val?.value}
                value={allSources.find(o => o.value === sourceFilter) ?? null}
                onChange={(_event, newValue) =>
                  setSourceFilter(newValue?.value ?? 'All')
                }
                openOnFocus
                renderInput={params => (
                  <TextField
                    {...params}
                    placeholder="Search sources..."
                    variant="standard"
                    size="small"
                    InputProps={{
                      ...params.InputProps,
                      disableUnderline: true,
                      style: { fontSize: '0.875rem' },
                    }}
                  />
                )}
                size="small"
                fullWidth
              />
            </Paper>
          </Box>
        </CatalogFilterLayout.Filters>
        <CatalogFilterLayout.Content>
          <Box className={tableWrapperClasses.tableWrapper}>
            <Table
              title={`Git Repositories (${repos.length})`}
              options={{
                search: true,
                rowStyle: { cursor: 'default' },
                pageSize: 10,
                pageSizeOptions: [10, 20, 50],
              }}
              columns={columns}
              data={repos}
            />
          </Box>
        </CatalogFilterLayout.Content>
      </CatalogFilterLayout>
      <Menu
        anchorReference="anchorPosition"
        anchorPosition={
          menuAnchor
            ? { top: menuAnchor.top, left: menuAnchor.left }
            : undefined
        }
        open={Boolean(menuAnchor)}
        onClose={handleKebabClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={handleViewInSource}
          disabled={!selectedEntity || !getSourceUrl(selectedEntity)}
        >
          <OpenInNewIcon fontSize="small" style={{ marginRight: 8 }} />
          View in source
        </MenuItem>
      </Menu>
    </div>
  );
};

export const RepositoriesTable = (props: RepositoriesTableProps) => (
  <EntityListProvider>
    <RepositoriesTableInner {...props} />
  </EntityListProvider>
);
