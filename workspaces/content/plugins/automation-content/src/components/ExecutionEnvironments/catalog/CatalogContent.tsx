import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ANNOTATION_EDIT_URL, Entity } from '@backstage/catalog-model';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  EntityKindFilter,
  EntityListProvider,
  EntityOwnerFilter,
  EntityTagFilter,
  EntityTextFilter,
  EntityTypeFilter,
  EntityUserFilter,
  entityRouteParams,
  entityRouteRef,
  useEntityList,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  Badge,
  Button,
  Cell,
  CellText,
  Flex,
  Grid,
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
import { CreateCatalog } from './CreateCatalog';
import { EEBuildDialog } from './EEBuildDialog';
import {
  downloadEntityAsTarArchive,
  isEntityBuildable,
  toEEDefinitionUrl,
} from './helpers';
import { useEEBuildFlow } from './useEEBuildFlow';

const PAGE_SIZE = 10;

function ExecutionEnvironmentTypeFilter() {
  const { filters, updateFilters } = useEntityList();
  const { type } = filters;
  useEffect(() => {
    if (!type)
      updateFilters(prev => ({
        ...prev,
        kind: new EntityKindFilter('Component', 'Component'),
        type: new EntityTypeFilter(['execution-environment']),
      }));
  }, [type, updateFilters]);
  return null;
}

/** Port of the prototype's offset-paged catalog and row action flows. */
export function EEListPage({
  onTabSwitch,
}: {
  onTabSwitch: (index: number) => void;
}): ReactElement {
  const catalogApi = useApi(catalogApiRef);
  const entityHref = useRouteRef(entityRouteRef);
  const {
    filters,
    entities: rawEntities,
    loading: catalogLoading,
    error,
    totalItems,
    limit,
    offset,
    setLimit,
    setOffset,
    updateFilters,
  } = useEntityList();
  const entities = useMemo(() => rawEntities ?? [], [rawEntities]);
  const {
    starredEntities = new Set<string>(),
    isStarredEntity,
    toggleStarredEntity,
  } = useStarredEntities();
  const prevStarredSizeRef = useRef(starredEntities.size);
  const hasEverHadEntitiesRef = useRef(false);
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
  }, [updateFilters]);
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
      cell: entity => (
        <CellText
          title={entity.metadata.name}
          href={entityHref(entityRouteParams(entity))}
        />
      ),
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
          if (urlToOpen)
            window.open(urlToOpen, '_blank', 'noopener,noreferrer');
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
                              if (resolved)
                                downloadEntityAsTarArchive(resolved);
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
  if (catalogLoading)
    return (
      <Flex direction="column" gap="3" aria-busy="true">
        <Skeleton width="100%" height={32} />
        <Skeleton width="100%" height={160} />
      </Flex>
    );
  if (error) return <div role="alert">Error: {error.toString()}</div>;
  if (totalCount > 0 || entities.length > 0)
    hasEverHadEntitiesRef.current = true;
  const hasEntities = hasEverHadEntitiesRef.current;
  const page = offset && limit ? Math.floor(offset / limit) : 0;
  return (
    <Flex direction="column" gap="4">
      <ExecutionEnvironmentTypeFilter />
      {hasEntities ? (
        <>
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
              <Flex direction="column" gap="3">
                <Text as="h2" variant="title-medium">
                  Execution Environments definition files ({totalCount})
                </Text>
                <SearchField
                  label="Search definition files"
                  value={filters.text?.value ?? ''}
                  onChange={value =>
                    updateFilters({
                      text: value ? new EntityTextFilter(value) : undefined,
                    })
                  }
                />
                <Table
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
                    pageSizeOptions: [10, 20, 50, 100],
                    offset,
                    totalCount,
                    hasNextPage: (page + 1) * limit < totalCount,
                    hasPreviousPage: page > 0,
                    onNextPage: () => setOffset?.((page + 1) * limit),
                    onPreviousPage: () => setOffset?.((page - 1) * limit),
                    onPageSizeChange: newLimit => {
                      setOffset?.(0);
                      setLimit?.(newLimit);
                    },
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

/** Catalog filter provider retains the prototype's backend offset pagination. */
export function EntityCatalogContent({
  onTabSwitch,
}: {
  onTabSwitch: (index: number) => void;
}): ReactElement {
  return (
    <EntityListProvider pagination={{ mode: 'offset', limit: PAGE_SIZE }}>
      <EEListPage onTabSwitch={onTabSwitch} />
    </EntityListProvider>
  );
}
