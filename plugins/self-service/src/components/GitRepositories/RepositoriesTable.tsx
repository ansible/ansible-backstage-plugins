import { useEffect, useState, useMemo } from 'react';
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
import NavigateBeforeIcon from '@material-ui/icons/NavigateBefore';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';
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
  PAGE_SIZE,
} from './constants';
import { rootRouteRef } from '../../routes';
import { useLatestCIActivity } from './useLatestCIActivity';
import { usePaginatedGitRepos } from './usePaginatedGitRepos';

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

  const {
    entities: paginatedEntities,
    loadedEntityCount,
    totalCount,
    initialLoading,
    error,
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    allSources,
    sourceFilter,
    setSourceFilter,
  } = usePaginatedGitRepos({ catalogApi, onSourcesStatusChange });

  const [menuAnchor, setMenuAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  const { lastActivityMap, loading: lastActivityLoading } =
    useLatestCIActivity(paginatedEntities);

  const displayedRepos = useMemo(() => {
    if (filters.user?.value === 'starred') {
      return paginatedEntities.filter(e => isStarredEntity(e));
    }
    return paginatedEntities;
  }, [paginatedEntities, filters.user?.value, isStarredEntity]);

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

  if (initialLoading) {
    return <Progress />;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (loadedEntityCount === 0) {
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

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalCount);

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
              title={`Git Repositories (${totalCount})`}
              options={{
                search: true,
                paging: false,
                rowStyle: { cursor: 'default' },
              }}
              columns={columns}
              data={displayedRepos}
            />
            {!initialLoading && totalPages > 1 && (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                mt={3}
                py={1}
              >
                <Typography
                  variant="body2"
                  color="textSecondary"
                  style={{ fontSize: '0.875rem' }}
                >
                  Showing {startIndex + 1}-{endIndex} of {totalCount}{' '}
                  repositories
                </Typography>
                <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                  <IconButton
                    size="small"
                    disabled={!hasPrevPage}
                    onClick={prevPage}
                    aria-label="Previous page"
                  >
                    <NavigateBeforeIcon />
                  </IconButton>
                  <Typography variant="body2">
                    Page {currentPage} of {totalPages}
                  </Typography>
                  <IconButton
                    size="small"
                    disabled={!hasNextPage}
                    onClick={nextPage}
                    aria-label="Next page"
                  >
                    <NavigateNextIcon />
                  </IconButton>
                </Box>
              </Box>
            )}
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
