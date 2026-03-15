import { useEffect, useState, useCallback, useRef } from 'react';
import { Progress } from '@backstage/core-components';
import {
  Box,
  Checkbox,
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

import { SyncStatusMap, EmptyState } from '../common';
import { useCollectionsStyles } from './styles';
import { PAGE_SIZE } from './constants';
import {
  sortEntities,
  filterLatestVersions,
  getUniqueFilters,
  filterCollectionsByRepository,
} from './utils';
import { CollectionCard } from './CollectionCard';

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
  const [loading, setLoading] = useState<boolean>(true);
  const [showError, setShowError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [filteredEntities, setFilteredEntities] = useState<Entity[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [tagFilter, setTagFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [allSources, setAllSources] = useState<string[]>(['All']);
  const [allTags, setAllTags] = useState<string[]>(['All']);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [syncStatusMap, setSyncStatusMap] = useState<SyncStatusMap>({});
  const [showLatestOnly, setShowLatestOnly] = useState<boolean>(true);
  const [hasConfiguredSources, setHasConfiguredSources] = useState<
    boolean | null
  >(null);
  const { filters } = useEntityList();

  const isMountedRef = useRef(true);

  const fetchCollections = useCallback(() => {
    catalogApi
      .getEntities({
        filter: [{ kind: 'Component', 'spec.type': 'ansible-collection' }],
      })
      .then(response => {
        if (!isMountedRef.current) return;

        let items = Array.isArray(response) ? response : response?.items || [];

        if (filterByRepositoryEntity) {
          items = filterCollectionsByRepository(
            items,
            filterByRepositoryEntity,
          );
        }

        setAllEntities(items);
        setFilteredEntities(items);

        if (items.length > 0) {
          const { sources, tags } = getUniqueFilters(items);
          setAllSources(['All', ...sources]);
          setAllTags(['All', ...tags]);
        }

        setLoading(false);
        setShowError(false);
      })
      .catch(error => {
        if (!isMountedRef.current) return;
        setErrorMessage(error.message);
        setShowError(true);
        setLoading(false);
      });
  }, [catalogApi, filterByRepositoryEntity]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const baseUrl = await discoveryApi.getBaseUrl('catalog');
      const response = await fetchApi.fetch(
        `${baseUrl}/ansible/sync/status?ansible_contents=true`,
      );

      if (!response.ok) {
        if (isMountedRef.current) {
          setHasConfiguredSources(false);
        }
        return;
      }

      const data = await response.json();
      const statusMap: SyncStatusMap = {};

      const providers = data.content?.providers || [];

      providers.forEach(
        (provider: {
          sourceId: string;
          lastSyncTime: string | null;
          lastFailedSyncTime: string | null;
        }) => {
          statusMap[provider.sourceId] = {
            lastSyncTime: provider.lastSyncTime,
            lastFailedSyncTime: provider.lastFailedSyncTime,
          };
        },
      );

      if (isMountedRef.current) {
        setSyncStatusMap(statusMap);
        const hasSources = providers.length > 0;
        setHasConfiguredSources(hasSources);
      }
    } catch {
      if (isMountedRef.current) {
        setHasConfiguredSources(false);
      }
    }
  }, [discoveryApi, fetchApi]);

  useEffect(() => {
    if (filterByRepositoryEntity) {
      setFilteredEntities(sortEntities(allEntities));
      return;
    }

    const searchLower = searchQuery.toLowerCase().trim();
    let filtered = allEntities.filter(entity => {
      const annotations = entity.metadata?.annotations || {};
      const collectionSource = annotations['ansible.io/collection-source'];

      const entitySource =
        collectionSource === 'pah'
          ? annotations['ansible.io/collection-source-repository'] || ''
          : annotations['ansible.io/scm-host-name'] || '';

      const matchesSource =
        sourceFilter === 'All' || entitySource === sourceFilter;
      const matchesTag =
        tagFilter === 'All' || entity.metadata?.tags?.includes(tagFilter);

      const matchesSearch =
        !searchLower ||
        entity.metadata?.name?.toLowerCase().includes(searchLower) ||
        (entity.spec?.collection_namespace as string | undefined)
          ?.toLowerCase()
          .includes(searchLower) ||
        entity.metadata?.description?.toLowerCase().includes(searchLower) ||
        entity.metadata?.tags?.some((tag: string) =>
          tag.toLowerCase().includes(searchLower),
        );

      return matchesSource && matchesTag && matchesSearch;
    });

    if (showLatestOnly) {
      filtered = filterLatestVersions(filtered);
    }

    setFilteredEntities(sortEntities(filtered));
  }, [
    filterByRepositoryEntity,
    sourceFilter,
    tagFilter,
    searchQuery,
    allEntities,
    showLatestOnly,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchCollections();
    fetchSyncStatus();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterByRepositoryEntity]);

  useEffect(() => {
    if (filterByRepositoryEntity) return;

    if (allEntities && filters.user?.value === 'starred') {
      let starred = allEntities.filter(e => isStarredEntity(e));
      if (showLatestOnly) {
        starred = filterLatestVersions(starred);
      }
      setFilteredEntities(sortEntities(starred));
    } else if (filters.user?.value === 'all') {
      let all = allEntities;
      if (showLatestOnly) {
        all = filterLatestVersions(all);
      }
      setFilteredEntities(sortEntities(all));
    }
  }, [
    filterByRepositoryEntity,
    filters.user,
    allEntities,
    isStarredEntity,
    showLatestOnly,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    sourceFilter,
    tagFilter,
    searchQuery,
    showLatestOnly,
    filterByRepositoryEntity,
  ]);

  useEffect(() => {
    if (onSourcesStatusChange) {
      onSourcesStatusChange(hasConfiguredSources);
    }
  }, [hasConfiguredSources, onSourcesStatusChange]);

  const totalPages = Math.ceil(filteredEntities.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedEntities = filteredEntities.slice(startIndex, endIndex);

  if (loading) {
    return <Progress />;
  }

  if (showError) {
    return <div>Error: {errorMessage ?? 'Unable to retrieve collections'}</div>;
  }

  return (
    <div style={{ flexDirection: 'column', width: '100%' }}>
      <CollectionsTypeFilter />
      {allEntities.length === 0 ? (
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
                    Ansible Collections ({filteredEntities.length})
                  </Typography>
                </Box>

                <Box className={classes.cardsContainer}>
                  {paginatedEntities.map(entity => (
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

                {totalPages > 1 && (
                  <Box className={classes.paginationContainer}>
                    <Typography className={classes.paginationInfo}>
                      Showing {startIndex + 1}-
                      {Math.min(endIndex, filteredEntities.length)} of{' '}
                      {filteredEntities.length} collections
                    </Typography>
                    <Box className={classes.paginationControls}>
                      <IconButton
                        size="small"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                        aria-label="Previous page"
                      >
                        <NavigateBeforeIcon />
                      </IconButton>
                      <Typography variant="body2">
                        Page {currentPage} of {totalPages}
                      </Typography>
                      <IconButton
                        size="small"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
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
