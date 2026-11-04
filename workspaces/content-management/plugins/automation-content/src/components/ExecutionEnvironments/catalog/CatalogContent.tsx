import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import useDebounce from 'react-use/lib/useDebounce';
import {
  ANNOTATION_EDIT_URL,
  parseEntityRef,
  type Entity,
} from '@backstage/catalog-model';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  EntityKindFilter,
  EntityOwnerFilter,
  EntityTagFilter,
  EntityTextFilter,
  EntityTypeFilter,
  EntityUserFilter,
  entityRouteParams,
  entityRouteRef,
  useStarredEntities,
  type DefaultEntityFilters,
} from '@backstage/plugin-catalog-react';
import {
  Badge,
  Button,
  Cell,
  CellText,
  Flex,
  Grid,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
  SearchField,
  Select,
  Skeleton,
  Table,
  Text,
  type ColumnConfig,
} from '@backstage/ui';
import { UnregisterEntityDialog } from '../../UnregisterEntityDialog';
import { StarIcon } from '../../common';
import { useNotifications } from '../../notifications';
import { CreateCatalog } from './CreateCatalog';
import styles from '../details.module.css';
import { EEBuildDialog } from './EEBuildDialog';
import {
  cleanHttpUrl,
  downloadEntityAsTarArchive,
  isEntityBuildable,
  toEEDefinitionUrl,
} from './helpers';
import { useEEBuildFlow } from './useEEBuildFlow';

const PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const DEFINITION_FILE_QUERY = {
  $not: {
    'metadata.annotations.ansible.com/digest': { $exists: true },
  },
} as const;

type CatalogFilterValues = Record<
  string,
  string | symbol | (string | symbol)[]
>;

type EntityPredicate = {
  kind: string;
  'metadata.namespace': string;
  'metadata.name': string;
};

function isDefinitionFileEntity(entity: Entity): boolean {
  return entity.metadata.annotations?.['ansible.com/digest'] === undefined;
}

function catalogFilterFromEntityFilters(
  filters: DefaultEntityFilters,
): CatalogFilterValues {
  return Object.values(filters).reduce<CatalogFilterValues>(
    (combined, filter) => {
      if (
        !filter ||
        (filter instanceof EntityUserFilter && filter.value === 'starred')
      ) {
        return combined;
      }
      if (
        typeof filter === 'object' &&
        'getCatalogFilters' in filter &&
        typeof filter.getCatalogFilters === 'function'
      ) {
        return Object.assign(combined, filter.getCatalogFilters());
      }
      return combined;
    },
    {},
  );
}

function starredEntityPredicates(refs: string[]): EntityPredicate[] {
  return refs.flatMap(ref => {
    try {
      const parsed = parseEntityRef(ref);
      return [
        {
          kind: parsed.kind,
          'metadata.namespace': parsed.namespace,
          'metadata.name': parsed.name,
        },
      ];
    } catch {
      return [];
    }
  });
}

/** Port of the prototype's offset-paged catalog and row action flows. */
export function EEListPage({
  onTabSwitch,
  getDefinitionFileHref,
}: {
  onTabSwitch: (index: number) => void;
  getDefinitionFileHref?: (entity: Entity) => string | undefined;
}): ReactElement {
  const catalogApi = useApi(catalogApiRef);
  const { showNotification } = useNotifications();
  const entityHref = useRouteRef(entityRouteRef);
  const [filters, setFilters] = useState<DefaultEntityFilters>(() => ({
    kind: new EntityKindFilter('Component', 'Component'),
    type: new EntityTypeFilter(['execution-environment']),
    user: EntityUserFilter.all(),
  }));
  const [entities, setEntities] = useState<Entity[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [hasCompletedLoad, setHasCompletedLoad] = useState(false);
  const [error, setError] = useState<Error>();
  const [hasCatalogFailure, setHasCatalogFailure] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [limit, setLimit] = useState(() => {
    const parsed = Number(searchParams.get('limit'));
    return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : PAGE_SIZE;
  });
  const [offset, setOffset] = useState(() => {
    const parsed = Number.parseInt(searchParams.get('offset') ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestVersionRef = useRef(0);
  const updateFilters = useCallback(
    (
      updates:
        | Partial<DefaultEntityFilters>
        | ((previous: DefaultEntityFilters) => Partial<DefaultEntityFilters>),
    ) => {
      setFilters(previous => ({
        ...previous,
        ...(typeof updates === 'function' ? updates(previous) : updates),
      }));
      setOffset(0);
    },
    [],
  );
  const handlePageSizeChange = useCallback((newLimit: number) => {
    setOffset(0);
    setLimit(newLimit);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  useDebounce(
    () => {
      if (searchQuery !== (filters.text?.value ?? '')) {
        updateFilters({
          text: searchQuery ? new EntityTextFilter(searchQuery) : undefined,
        });
      }
    },
    300,
    [searchQuery],
  );
  const {
    starredEntities = new Set<string>(),
    isStarredEntity,
    toggleStarredEntity,
  } = useStarredEntities();
  const prevStarredSizeRef = useRef(starredEntities.size);
  const hasEverHadEntitiesRef = useRef(false);
  useEffect(() => {
    if (totalItems > 0 || entities.length > 0) {
      hasEverHadEntitiesRef.current = true;
    }
  }, [totalItems, entities]);
  const updateRefreshVersion = useCallback(
    () => setRefreshVersion(version => version + 1),
    [],
  );
  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('limit', String(limit));
    if (offset > 0) nextParams.set('offset', String(offset));
    else nextParams.delete('offset');
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [limit, offset, searchParams, setSearchParams]);
  useEffect(() => {
    let cancelled = false;
    const requestVersion = ++requestVersionRef.current;
    const starredEntityFilter =
      filters.user instanceof EntityUserFilter &&
      filters.user.value === 'starred'
        ? filters.user
        : undefined;
    const starredPredicates = starredEntityFilter
      ? starredEntityPredicates(starredEntityFilter.refs ?? [])
      : undefined;
    const query = starredPredicates
      ? {
          $all: [DEFINITION_FILE_QUERY, { $any: starredPredicates }],
        }
      : DEFINITION_FILE_QUERY;

    if (starredPredicates && starredPredicates.length === 0) {
      setEntities([]);
      setTotalItems(0);
      setError(undefined);
      setHasCatalogFailure(false);
      setCatalogLoading(false);
      setHasCompletedLoad(true);
      return () => {
        cancelled = true;
      };
    }

    setCatalogLoading(true);
    setError(undefined);
    void catalogApi
      .queryEntities({
        filter: catalogFilterFromEntityFilters(filters),
        query,
        fullTextFilter: filters.text?.getFullTextFilters(),
        orderFields: [{ field: 'metadata.name', order: 'asc' }],
        limit,
        offset,
      })
      .then(response => {
        if (cancelled || requestVersion !== requestVersionRef.current) return;
        setHasCatalogFailure(false);
        setEntities(
          response.items.filter(isDefinitionFileEntity).filter(entity =>
            Object.values(filters).every(filter => {
              if (
                typeof filter !== 'object' ||
                filter === null ||
                !('filterEntity' in filter) ||
                typeof filter.filterEntity !== 'function'
              ) {
                return true;
              }
              return filter.filterEntity(entity);
            }),
          ),
        );
        setTotalItems(response.totalItems);
      })
      .catch(fetchError => {
        if (cancelled || requestVersion !== requestVersionRef.current) return;
        setEntities([]);
        setTotalItems(0);
        setHasCatalogFailure(true);
        setError(
          fetchError instanceof Error
            ? fetchError
            : new Error(String(fetchError)),
        );
      })
      .finally(() => {
        if (!cancelled && requestVersion === requestVersionRef.current) {
          setCatalogLoading(false);
          setHasCompletedLoad(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [catalogApi, filters, limit, offset, refreshVersion]);
  useEffect(() => {
    if (filters.user?.value === 'starred') {
      if (starredEntities.size > 0)
        updateFilters({
          user: EntityUserFilter.starred(Array.from(starredEntities)),
        });
      else if (prevStarredSizeRef.current > 0)
        updateFilters({ user: EntityUserFilter.all() });
    }
    prevStarredSizeRef.current = starredEntities.size;
  }, [starredEntities, filters.user?.value, updateFilters]);
  const [ownerFilter, setOwnerFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [allOwners, setAllOwners] = useState<string[]>(['All']);
  const [allTags, setAllTags] = useState<string[]>(['All']);
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());
  const ownerNamesRef = useRef(ownerNames);
  ownerNamesRef.current = ownerNames;
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    catalogApi
      .getEntityFacets({
        filter: { kind: 'Component', 'spec.type': 'execution-environment' },
        query: DEFINITION_FILE_QUERY,
        facets: ['spec.owner', 'metadata.tags'],
      })
      .then(response => {
        const owners = (response.facets['spec.owner'] ?? []).map(f => f.value);
        const tags = (response.facets['metadata.tags'] ?? []).map(f => f.value);
        owners.sort((a, b) => a.localeCompare(b));
        tags.sort((a, b) => a.localeCompare(b));
        setAllOwners(['All', ...owners]);
        setAllTags(['All', ...tags]);
      })
      .catch(() => {
        setAllOwners(['All']);
        setAllTags(['All']);
      });
  }, [catalogApi]);
  const handleOwnerFilterChange = useCallback(
    (value: string) => {
      setOwnerFilter(value);
      updateFilters({
        owners: value === 'All' ? undefined : new EntityOwnerFilter([value]),
      });
    },
    [updateFilters],
  );
  const handleTagFilterChange = useCallback(
    (value: string) => {
      setTagFilter(value);
      updateFilters({
        tags: value === 'All' ? undefined : new EntityTagFilter([value]),
      });
    },
    [updateFilters],
  );
  useEffect(() => {
    if (!entities.length) return;
    const allOwnerRefs = Array.from(
      new Set(
        entities
          .map(e => e.spec?.owner)
          .filter((owner): owner is string => Boolean(owner)),
      ),
    );
    const unresolvedRefs = allOwnerRefs.filter(
      ref => !ownerNamesRef.current.has(ref),
    );
    if (!unresolvedRefs.length) return;
    const resolveOwners = async () => {
      try {
        const response = await catalogApi.getEntitiesByRefs({
          entityRefs: unresolvedRefs,
        });
        if (!isMountedRef.current) return;
        const nameMap = new Map<string, string>();
        for (const [index, ref] of unresolvedRefs.entries()) {
          const entity = response.items[index];
          nameMap.set(
            ref,
            entity?.metadata?.title ?? entity?.metadata?.name ?? ref,
          );
        }
        setOwnerNames(prev => new Map([...prev, ...nameMap]));
      } catch {
        if (!isMountedRef.current) return;
        const fallback = new Map(
          unresolvedRefs.map(ref => [ref, ref] as const),
        );
        setOwnerNames(prev => new Map([...prev, ...fallback]));
      }
    };
    resolveOwners();
  }, [entities, catalogApi]);
  const totalCount = totalItems ?? 0;
  const refresh = useCallback(() => {
    setOwnerFilter('All');
    setTagFilter('All');
    setOwnerNames(new Map());
    updateFilters({ owners: undefined, tags: undefined });
    updateRefreshVersion();
  }, [updateFilters, updateRefreshVersion]);
  const [entityToUnregister, setEntityToUnregister] = useState<Entity | null>(
    null,
  );
  const {
    startBuildFlow,
    authBusy,
    dialogOpen,
    buildEntity,
    scmToken,
    scmProvider,
    closeDialog,
  } = useEEBuildFlow();
  const handleUnregisterConfirm = useCallback(() => {
    setEntityToUnregister(null);
    refresh();
  }, [refresh]);
  const columns: ColumnConfig<Entity & { id: string }>[] = [
    {
      id: 'name',
      label: 'Name',
      isRowHeader: true,
      cell: entity => {
        const href = getDefinitionFileHref
          ? getDefinitionFileHref(entity)
          : entityHref(entityRouteParams(entity));
        return (
          <Cell>
            {href ? (
              <Link
                href={href}
                color="info"
                className={styles.infoLink}
                title={entity.metadata.name}
              >
                {entity.metadata.name}
              </Link>
            ) : (
              <CellText title={entity.metadata.name} />
            )}
          </Cell>
        );
      },
    },
    {
      id: 'owner',
      label: 'Owner',
      cell: entity => {
        const ref = entity.spec?.owner as string | undefined;
        return (
          <CellText title={ref ? ownerNames.get(ref) || ref : 'Unknown'} />
        );
      },
    },
    {
      id: 'description',
      label: 'Description',
      cell: entity => <CellText title={entity.metadata.description || '—'} />,
    },
    {
      id: 'tags',
      label: 'Tags',
      cell: entity => (
        <Cell>
          <Flex gap="1">
            {(entity.metadata.tags ?? []).slice(0, 3).map(t => (
              <Badge key={t}>{t}</Badge>
            ))}
            {(entity.metadata.tags?.length ?? 0) > 3 && (
              <Badge>+{entity.metadata.tags!.length - 3}</Badge>
            )}
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      cell: entity => {
        const starred = isStarredEntity(entity);
        const downloadExperience =
          entity.metadata.annotations?.['ansible.io/download-experience']
            ?.toString()
            .toLowerCase()
            .trim() === 'true';
        const openSource = (view: boolean) => {
          const annotations = entity.metadata.annotations ?? {};
          const editUrl = annotations[ANNOTATION_EDIT_URL];
          const sourceLocation = annotations['backstage.io/source-location'];
          const sourceUrl =
            typeof sourceLocation === 'string'
              ? sourceLocation.replace(/^url:/i, '').trim()
              : undefined;
          const rawUrl = view
            ? annotations['backstage.io/view-url'] || sourceUrl || editUrl
            : editUrl || sourceUrl;
          const urlToOpen = toEEDefinitionUrl(
            rawUrl ?? '',
            entity.metadata.name ?? '',
          );
          const safeUrl = cleanHttpUrl(urlToOpen);
          if (safeUrl) window.open(safeUrl, '_blank', 'noopener,noreferrer');
        };
        return (
          <Cell>
            <Flex gap="2">
              <Button
                variant="tertiary"
                aria-label={`${starred ? 'Remove' : 'Add'} ${
                  entity.metadata.name
                } ${starred ? 'from' : 'to'} favorites`}
                aria-pressed={starred}
                onPress={() => toggleStarredEntity(entity)}
              >
                <StarIcon selected={starred} />
              </Button>
              <MenuTrigger>
                <Button
                  variant="tertiary"
                  aria-label={`Actions for ${entity.metadata.name}`}
                >
                  Actions
                </Button>
                <Menu>
                  {downloadExperience ? (
                    <>
                      <MenuItem
                        onAction={() => {
                          catalogApi
                            .getEntityByRef(
                              `${entity.kind}:${
                                entity.metadata.namespace || 'default'
                              }/${entity.metadata.name}`,
                            )
                            .then(resolved => {
                              if (!resolved) {
                                showNotification({
                                  title: 'Download',
                                  description:
                                    'This execution environment is no longer available. Refresh the catalog and try again.',
                                  severity: 'error',
                                });
                                return;
                              }
                              if (!downloadEntityAsTarArchive(resolved)) {
                                showNotification({
                                  title: 'Download',
                                  description:
                                    'Could not download the execution environment. Please try again.',
                                  severity: 'error',
                                });
                              }
                            })
                            .catch(() => {
                              showNotification({
                                title: 'Download',
                                description:
                                  'Could not download the execution environment. Please try again.',
                                severity: 'error',
                              });
                            });
                        }}
                      >
                        Download
                      </MenuItem>
                      <MenuItem
                        color="danger"
                        onAction={() => setEntityToUnregister(entity)}
                      >
                        Delete
                      </MenuItem>
                    </>
                  ) : (
                    <>
                      {isEntityBuildable(entity) && (
                        <MenuItem
                          onAction={() => {
                            startBuildFlow(entity).catch(() => undefined);
                          }}
                        >
                          Build
                        </MenuItem>
                      )}
                      <MenuItem onAction={() => openSource(false)}>
                        Edit definition
                      </MenuItem>
                      <MenuItem onAction={() => openSource(true)}>
                        View in source
                      </MenuItem>
                      <MenuItem
                        color="danger"
                        onAction={() => setEntityToUnregister(entity)}
                      >
                        Delete
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </MenuTrigger>
            </Flex>
          </Cell>
        );
      },
    },
  ];
  if (catalogLoading && !hasCompletedLoad)
    return (
      <Flex direction="column" gap="3" aria-busy="true">
        <Skeleton width="100%" height={32} />
        <Skeleton width="100%" height={160} />
      </Flex>
    );
  const hasEntities =
    hasEverHadEntitiesRef.current || totalCount > 0 || entities.length > 0;
  const showCatalogContent = hasEntities || hasCatalogFailure;
  const page = offset && limit ? Math.floor(offset / limit) : 0;
  return (
    <Flex direction="column" gap="4">
      {showCatalogContent ? (
        <>
          {error && (
            <div role="alert">
              Unable to load definition files. Try again.{' '}
              <Button size="small" onPress={updateRefreshVersion}>
                Retry
              </Button>
            </div>
          )}
          <Text variant="body-large" as="p" color="secondary">
            Create an Execution Environment (EE) definition to ensure your
            playbooks run the same way, every time. Choose a recommended preset
            or start from scratch for full control. After saving your
            definition, follow our guide to create your EE image.
          </Text>
          <Grid.Root columns={{ initial: '1', lg: '12' }} gap="4">
            <Grid.Item colSpan={{ initial: '1', lg: '3' }}>
              <Flex direction="column" gap="3">
                <Select
                  label="Favorites"
                  value={filters.user?.value ?? 'all'}
                  options={[
                    { id: 'starred', label: 'Starred' },
                    { id: 'all', label: 'All' },
                  ]}
                  onChange={value =>
                    updateFilters({
                      user:
                        value === 'starred'
                          ? EntityUserFilter.starred(
                              Array.from(starredEntities),
                            )
                          : EntityUserFilter.all(),
                    })
                  }
                />
                <Select
                  label="Owner"
                  value={ownerFilter}
                  options={allOwners.map(id => ({ id, label: id }))}
                  onChange={value => handleOwnerFilterChange(String(value))}
                />
                <Select
                  label="Tags"
                  value={tagFilter}
                  options={allTags.map(id => ({ id, label: id }))}
                  onChange={value => handleTagFilterChange(String(value))}
                />
              </Flex>
            </Grid.Item>
            <Grid.Item colSpan={{ initial: '1', lg: '9' }}>
              <Flex direction="column" gap="3" aria-busy={catalogLoading}>
                <Text as="h2" variant="title-medium">
                  Execution Environments definition files ({totalCount})
                </Text>
                <SearchField
                  label="Search definition files"
                  value={searchQuery}
                  onChange={setSearchQuery}
                />
                <Table
                  isPending={catalogLoading}
                  data={entities.map(entity => ({
                    ...entity,
                    id:
                      entity.metadata.uid ??
                      `${entity.kind}:${entity.metadata.namespace}/${entity.metadata.name}`,
                  }))}
                  columnConfig={columns}
                  pagination={{
                    type: 'page',
                    pageSize: limit,
                    pageSizeOptions: PAGE_SIZE_OPTIONS,
                    offset,
                    totalCount,
                    hasNextPage: (page + 1) * limit < totalCount,
                    hasPreviousPage: page > 0,
                    onNextPage: () => setOffset((page + 1) * limit),
                    onPreviousPage: () => setOffset((page - 1) * limit),
                    onPageSizeChange: handlePageSizeChange,
                  }}
                />
              </Flex>
            </Grid.Item>
          </Grid.Root>
          {entityToUnregister && (
            <UnregisterEntityDialog
              open
              entity={entityToUnregister}
              onConfirm={handleUnregisterConfirm}
              onClose={() => setEntityToUnregister(null)}
            />
          )}
          {authBusy && <Text role="status">Signing in to your Git host…</Text>}
          <EEBuildDialog
            open={dialogOpen}
            entity={buildEntity}
            scmToken={scmToken}
            scmProvider={scmProvider}
            onClose={closeDialog}
          />
        </>
      ) : (
        <CreateCatalog onTabSwitch={onTabSwitch} />
      )}
    </Flex>
  );
}

/** Catalog listing with backend-paginated exclusion of registry-backed images. */
export function EntityCatalogContent({
  onTabSwitch,
  getDefinitionFileHref,
}: {
  onTabSwitch: (index: number) => void;
  getDefinitionFileHref?: (entity: Entity) => string | undefined;
}): ReactElement {
  return (
    <EEListPage
      onTabSwitch={onTabSwitch}
      getDefinitionFileHref={getDefinitionFileHref}
    />
  );
}
