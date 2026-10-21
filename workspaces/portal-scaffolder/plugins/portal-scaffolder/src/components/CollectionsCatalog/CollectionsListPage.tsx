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
import type { SyncProgressEntry, SyncStatusMap } from '../common';
import { useCollectionsStyles } from './styles';
import { PAGE_SIZE } from './constants';
import { sortEntities } from './utils';
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
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
}

const EmptyStateWrapper = ({
  filterByRepositoryEntity,
  onSyncClick,
  hasConfiguredSources,
  syncDisabled,
  syncDisabledReason,
  syncInProgress,
  syncProgress,
}: EmptyStateWrapperProps) => {
  const classes = useCollectionsStyles();
  const emptyState = (
    <EmptyState
      onSyncClick={onSyncClick}
      hasConfiguredSources={hasConfiguredSources}
      syncDisabled={syncDisabled}
      syncDisabledReason={syncDisabledReason}
      syncInProgress={syncInProgress}
      syncProgress={syncProgress}
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
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
}

interface CollectionsFiltersProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  initialLoading: boolean;
  allSources: string[];
  sourceFilter: string;
  setSourceFilter: (f: string) => void;
  allTags: string[];
  tagFilter: string;
  setTagFilter: (f: string) => void;
  showLatestOnly: boolean;
  setShowLatestOnly: (v: boolean) => void;
}

const CollectionsFilters = ({
  searchQuery,
  setSearchQuery,
  initialLoading,
  allSources,
  sourceFilter,
  setSourceFilter,
  allTags,
  tagFilter,
  setTagFilter,
  showLatestOnly,
  setShowLatestOnly,
}: CollectionsFiltersProps) => {
  const classes = useCollectionsStyles();
  return (
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
          onChange={(_event, newValue) => setSourceFilter(newValue || 'All')}
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
          onChange={(_event, newValue) => setTagFilter(newValue || 'All')}
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
  );
};

function getDisplayedEntities(
  paginatedEntities: Entity[],
  filterByRepositoryEntity: Entity | null | undefined,
  isStarredFilter: boolean,
  showLatestOnly: boolean,
  isStarredEntity: (entity: Entity) => boolean,
): Entity[] {
  if (filterByRepositoryEntity) return paginatedEntities;

  if (isStarredFilter) {
    let starred = paginatedEntities.filter(e => isStarredEntity(e));
    if (showLatestOnly) {
      starred = starred.filter(
        e =>
          e.metadata?.annotations?.['ansible.io/is-latest-version'] === 'true',
      );
    }
    return sortEntities(starred);
  }
  return paginatedEntities;
}

interface CollectionsCardsProps {
  initialLoading: boolean;
  pageLoading: boolean;
  showNoFilterMatches: boolean;
  showNoStarredOnPage: boolean;
  displayedEntities: Entity[];
  navigate: (path: string) => void;
  isStarredEntity: (entity: Entity) => boolean;
  toggleStarredEntity: (entity: Entity) => void;
  syncStatusMap: SyncStatusMap;
}

const CollectionsCards = ({
  initialLoading,
  pageLoading,
  showNoFilterMatches,
  showNoStarredOnPage,
  displayedEntities,
  navigate,
  isStarredEntity,
  toggleStarredEntity,
  syncStatusMap,
}: CollectionsCardsProps) => {
  const classes = useCollectionsStyles();

  if (initialLoading) {
    return (
      <Box className={classes.cardsContainer}>
        <Progress />
      </Box>
    );
  }

  if ((showNoFilterMatches || showNoStarredOnPage) && !pageLoading) {
    return (
      <Box className={classes.cardsContainer}>
        <Typography variant="body1" color="textSecondary" component="p">
          {showNoStarredOnPage
            ? 'No starred collections on this page. Browse other pages to find your starred collections.'
            : 'No collections match your search or filters.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      className={classes.cardsContainer}
      style={pageLoading ? { opacity: 0.5, pointerEvents: 'none' } : {}}
      aria-busy={pageLoading}
      {...(pageLoading ? { inert: '' } : {})}
    >
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
  );
};

interface CollectionsPaginationProps {
  isStarredFilter: boolean;
  displayedCount: number;
  startIndex: number;
  endIndex: number;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: () => void;
  nextPage: () => void;
}

const CollectionsPagination = ({
  isStarredFilter,
  displayedCount,
  startIndex,
  endIndex,
  totalCount,
  currentPage,
  totalPages,
  hasPrevPage,
  hasNextPage,
  prevPage,
  nextPage,
}: CollectionsPaginationProps) => {
  const classes = useCollectionsStyles();
  return (
    <Box className={classes.paginationContainer}>
      <Typography className={classes.paginationInfo}>
        {isStarredFilter
          ? `Showing ${displayedCount} starred on this page`
          : `Showing ${
              startIndex + 1
            }-${endIndex} of ${totalCount} collections`}
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
          {isStarredFilter
            ? `Page ${currentPage}`
            : `Page ${currentPage} of ${totalPages}`}
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
  );
};

function collectionsTitleCountSuffix(
  initialLoading: boolean,
  filterByRepositoryEntity: Entity | null | undefined,
  showNoFilterMatches: boolean,
  loadedEntityCount: number | null,
  totalCount: number,
): string {
  if (initialLoading || loadedEntityCount === null) {
    return '';
  }
  if (!filterByRepositoryEntity && showNoFilterMatches) {
    return ` (0 of ${loadedEntityCount})`;
  }
  if (
    !filterByRepositoryEntity &&
    loadedEntityCount > 0 &&
    totalCount !== loadedEntityCount
  ) {
    return ` (${totalCount} of ${loadedEntityCount})`;
  }
  return ` (${totalCount})`;
}

export const CollectionsListPage = ({
  onSyncClick,
  onSourcesStatusChange,
  filterByRepositoryEntity,
  syncDisabled,
  syncDisabledReason,
  syncInProgress,
  syncProgress,
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
    loadedEntityCount,
    totalCount,
    initialLoading,
    pageLoading,
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

  const isStarredFilter =
    !filterByRepositoryEntity && filters.user?.value === 'starred';

  const displayedEntities = getDisplayedEntities(
    paginatedEntities,
    filterByRepositoryEntity,
    isStarredFilter,
    showLatestOnly,
    isStarredEntity,
  );

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalCount);

  if (error !== null) {
    return <div>Error: {error}</div>;
  }

  const showCatalogEmptyState =
    !initialLoading &&
    loadedEntityCount !== null &&
    (filterByRepositoryEntity ? totalCount === 0 : loadedEntityCount === 0);

  const showNoFilterMatches =
    !initialLoading &&
    !filterByRepositoryEntity &&
    !isStarredFilter &&
    loadedEntityCount !== null &&
    loadedEntityCount > 0 &&
    totalCount === 0;

  const showNoStarredOnPage =
    !initialLoading &&
    !pageLoading &&
    isStarredFilter &&
    totalCount > 0 &&
    displayedEntities.length === 0;

  const collectionsTitleCount = isStarredFilter
    ? ` (${displayedEntities.length} starred)`
    : collectionsTitleCountSuffix(
        initialLoading,
        filterByRepositoryEntity,
        showNoFilterMatches,
        loadedEntityCount,
        totalCount,
      );

  return (
    <div style={{ flexDirection: 'column', width: '100%' }}>
      <CollectionsTypeFilter />
      {showCatalogEmptyState ? (
        <EmptyStateWrapper
          filterByRepositoryEntity={!!filterByRepositoryEntity}
          onSyncClick={onSyncClick}
          hasConfiguredSources={hasConfiguredSources}
          syncDisabled={syncDisabled}
          syncDisabledReason={syncDisabledReason}
          syncInProgress={syncInProgress}
          syncProgress={syncProgress}
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
              <CollectionsFilters
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                initialLoading={initialLoading}
                allSources={allSources}
                sourceFilter={sourceFilter}
                setSourceFilter={setSourceFilter}
                allTags={allTags}
                tagFilter={tagFilter}
                setTagFilter={setTagFilter}
                showLatestOnly={showLatestOnly}
                setShowLatestOnly={setShowLatestOnly}
              />
            )}

            <CatalogFilterLayout.Content>
              <Box>
                <Box className={classes.contentHeader}>
                  <Typography variant="h6" className={classes.contentTitle}>
                    Ansible Collections
                    {collectionsTitleCount}
                    {(initialLoading || pageLoading) && (
                      <CircularProgress
                        size={16}
                        style={{ marginLeft: 8, verticalAlign: 'middle' }}
                      />
                    )}
                  </Typography>
                </Box>

                <CollectionsCards
                  initialLoading={initialLoading}
                  pageLoading={pageLoading}
                  showNoFilterMatches={showNoFilterMatches}
                  showNoStarredOnPage={showNoStarredOnPage}
                  displayedEntities={displayedEntities}
                  navigate={navigate}
                  isStarredEntity={isStarredEntity}
                  toggleStarredEntity={toggleStarredEntity}
                  syncStatusMap={syncStatusMap}
                />

                {!initialLoading && totalPages > 1 && (
                  <CollectionsPagination
                    isStarredFilter={isStarredFilter}
                    displayedCount={displayedEntities.length}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    totalCount={totalCount}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    hasPrevPage={hasPrevPage}
                    hasNextPage={hasNextPage}
                    prevPage={prevPage}
                    nextPage={nextPage}
                  />
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
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
}

export const CollectionsContent = ({
  onSyncClick,
  onSourcesStatusChange,
  syncDisabled,
  syncDisabledReason,
  syncInProgress,
  syncProgress,
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
            syncInProgress={syncInProgress}
            syncProgress={syncProgress}
          />
        </EntityListProvider>
      </Box>
    </Box>
  );
};
