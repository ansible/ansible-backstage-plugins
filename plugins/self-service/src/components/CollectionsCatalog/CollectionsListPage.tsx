import { useEffect } from 'react';
import { Progress } from '@backstage/core-components';
import {
  Box,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import SearchIcon from '@material-ui/icons/Search';
import ClearIcon from '@material-ui/icons/Clear';
import NavigateBeforeIcon from '@material-ui/icons/NavigateBefore';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';
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
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '../common';
import { useCollectionsStyles } from './styles';
import { PAGE_SIZE } from './constants';
import { filterLatestVersions, sortEntities } from './utils';
import { CollectionCard } from './CollectionCard';
import { usePaginatedCollections } from './usePaginatedCollections';

export const CollectionsTypeFilter = () => {
  const { filters, updateFilters } = useEntityList();
  useEffect(() => {
    if (!filters.kind || !filters.type) {
      updateFilters(prev => ({
        ...prev,
        kind: new EntityKindFilter('Component', 'Component'),
        type: new EntityTypeFilter('ansible-collection'),
      }));
    }
  }, [filters.kind, filters.type, updateFilters]);
  return null;
};

interface EmptyStateWrapperProps {
  filterByRepositoryEntity: boolean;
  onSyncClick?: () => void;
  hasConfiguredSources?: boolean | null;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
}

const EmptyStateWrapper = ({
  filterByRepositoryEntity,
  onSyncClick,
  hasConfiguredSources,
  syncDisabled,
  syncDisabledReason,
}: EmptyStateWrapperProps) => {
  const classes = useCollectionsStyles();
  const emptyState = (
    <EmptyState
      onSyncClick={onSyncClick}
      hasConfiguredSources={hasConfiguredSources}
      syncDisabled={syncDisabled}
      syncDisabledReason={syncDisabledReason}
      {...(filterByRepositoryEntity && { repositoryFilter: true })}
    />
  );
  if (filterByRepositoryEntity) {
    return <Box className={classes.emptyStateContainer}>{emptyState}</Box>;
  }
  return emptyState;
};

interface CollectionsListPageProps {
  onSyncClick?: () => void;
  onSourcesStatusChange?: (hasConfiguredSources: boolean | null) => void;
  filterByRepositoryEntity?: Entity | null;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
}

export const CollectionsListPage = ({
  onSyncClick,
  onSourcesStatusChange,
  filterByRepositoryEntity,
  syncDisabled,
  syncDisabledReason,
}: CollectionsListPageProps) => {
  const classes = useCollectionsStyles();
  const catalogApi = useApi(catalogApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const navigate = useNavigate();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const { filters } = useEntityList();

  const {
    entities: paginatedEntities,
    totalCount,
    initialLoading,
    loadingMore,
    error,
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    syncStatusMap,
    hasConfiguredSources,
    allSources,
    allTags,
    sourceFilter,
    setSourceFilter,
    tagFilter,
    setTagFilter,
    searchQuery,
    setSearchQuery,
    showLatestOnly,
    setShowLatestOnly,
  } = usePaginatedCollections({
    catalogApi,
    discoveryApi,
    fetchApi,
    filterByRepositoryEntity,
  });

  useEffect(() => {
    if (onSourcesStatusChange) {
      onSourcesStatusChange(hasConfiguredSources);
    }
  }, [hasConfiguredSources, onSourcesStatusChange]);

  const displayedEntities = (() => {
    if (filterByRepositoryEntity) return paginatedEntities;

    if (filters.user?.value === 'starred') {
      let starred = paginatedEntities.filter(e => isStarredEntity(e));
      if (showLatestOnly) {
        starred = filterLatestVersions(starred);
      }
      return sortEntities(starred);
    }
    return paginatedEntities;
  })();

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalCount);

  if (error !== null) {
    return <div>Error: {error}</div>;
  }

  const showEmptyState = !initialLoading && totalCount === 0 && !loadingMore;

  return (
    <div style={{ flexDirection: 'column', width: '100%' }}>
      <CollectionsTypeFilter />
      {showEmptyState ? (
        <EmptyStateWrapper
          filterByRepositoryEntity={!!filterByRepositoryEntity}
          onSyncClick={onSyncClick}
          hasConfiguredSources={hasConfiguredSources}
          syncDisabled={syncDisabled}
          syncDisabledReason={syncDisabledReason}
        />
      ) : (
        <Box
          className={
            filterByRepositoryEntity
              ? `${classes.catalogLayout} ${classes.catalogLayoutStretch}`
              : classes.catalogLayout
          }
        >
          <CatalogFilterLayout>
            {!filterByRepositoryEntity && (
              <CatalogFilterLayout.Filters>
                <TextField
                  className={classes.searchInput}
                  placeholder="Search"
                  variant="standard"
                  fullWidth
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  disabled={initialLoading}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon color="disabled" />
                      </InputAdornment>
                    ),
                    endAdornment: searchQuery ? (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                        >
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  }}
                />
                <UserListPicker availableFilters={['starred', 'all']} />

                <Typography
                  style={{
                    marginTop: 16,
                    fontWeight: 600,
                    fontSize: '0.875rem',
                  }}
                >
                  Source Type
                </Typography>
                <Paper className={classes.paper}>
                  <Autocomplete
                    options={allSources}
                    value={sourceFilter}
                    onChange={(_event, newValue) =>
                      setSourceFilter(newValue || 'All')
                    }
                    openOnFocus
                    disabled={initialLoading}
                    renderInput={params => (
                      <TextField
                        {...params}
                        placeholder="Search sources..."
                        variant="standard"
                        InputProps={{
                          ...params.InputProps,
                          disableUnderline: true,
                          style: { fontSize: '0.875rem' },
                        }}
                      />
                    )}
                    disableClearable={sourceFilter === 'All'}
                    size="small"
                    fullWidth
                  />
                </Paper>

                <Typography
                  style={{
                    marginTop: 16,
                    fontWeight: 600,
                    fontSize: '0.875rem',
                  }}
                >
                  Tags
                </Typography>
                <Paper className={classes.paper}>
                  <Autocomplete
                    options={allTags}
                    value={tagFilter}
                    onChange={(_event, newValue) =>
                      setTagFilter(newValue || 'All')
                    }
                    openOnFocus
                    disabled={initialLoading}
                    renderInput={params => (
                      <TextField
                        {...params}
                        placeholder="Search tags..."
                        variant="standard"
                        InputProps={{
                          ...params.InputProps,
                          disableUnderline: true,
                          style: { fontSize: '0.875rem' },
                        }}
                      />
                    )}
                    disableClearable={tagFilter === 'All'}
                    size="small"
                    fullWidth
                  />
                </Paper>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showLatestOnly}
                      onChange={e => setShowLatestOnly(e.target.checked)}
                      color="primary"
                      size="small"
                      disabled={initialLoading}
                    />
                  }
                  label="Show latest version only"
                  style={{ marginTop: 16 }}
                />
              </CatalogFilterLayout.Filters>
            )}

            <CatalogFilterLayout.Content>
              <Box>
                <Box className={classes.contentHeader}>
                  <Typography variant="h6" className={classes.contentTitle}>
                    Ansible Collections{' '}
                    {initialLoading ? '' : `(${totalCount})`}
                    {(initialLoading || loadingMore) && (
                      <CircularProgress
                        size={16}
                        style={{ marginLeft: 8, verticalAlign: 'middle' }}
                      />
                    )}
                  </Typography>
                </Box>

                {initialLoading ? (
                  <Box className={classes.cardsContainer}>
                    <Progress />
                  </Box>
                ) : (
                  <Box className={classes.cardsContainer}>
                    {displayedEntities.map(entity => (
                      <CollectionCard
                        key={entity.metadata.uid || entity.metadata.name}
                        entity={entity}
                        onClick={navigate}
                        isStarred={isStarredEntity(entity)}
                        onToggleStar={toggleStarredEntity}
                        syncStatusMap={syncStatusMap}
                      />
                    ))}
                  </Box>
                )}

                {!initialLoading && totalPages > 1 && (
                  <Box className={classes.paginationContainer}>
                    <Typography className={classes.paginationInfo}>
                      Showing {startIndex + 1}-{endIndex} of {totalCount}{' '}
                      collections
                    </Typography>
                    <Box className={classes.paginationControls}>
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
        </Box>
      )}
    </div>
  );
};

interface CollectionsContentProps {
  onSyncClick?: () => void;
  onSourcesStatusChange?: (hasConfiguredSources: boolean | null) => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
}

export const CollectionsContent = ({
  onSyncClick,
  onSourcesStatusChange,
  syncDisabled,
  syncDisabledReason,
}: CollectionsContentProps) => {
  const classes = useCollectionsStyles();

  return (
    <Box display="flex" justifyContent="space-between" width="100%">
      <Box className={classes.flex} width="100%">
        <EntityListProvider>
          <CollectionsListPage
            onSyncClick={onSyncClick}
            onSourcesStatusChange={onSourcesStatusChange}
            syncDisabled={syncDisabled}
            syncDisabledReason={syncDisabledReason}
          />
        </EntityListProvider>
      </Box>
    </Box>
  );
};
