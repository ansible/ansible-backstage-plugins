import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  Button,
  ButtonIcon,
  Flex,
  Skeleton,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import SyncIcon from '@material-ui/icons/Sync';
import { useIsSuperuser } from '@ansible/portal-plugin-sdk';
import type { Entity } from '@backstage/catalog-model';
import { automationContentApiRef } from '../../api';
import type { Registry } from '../../api';
import { collectionsRouteRef } from '../../routes';
import { EmptyState } from '../common';
import { HelpIcon } from '../common/icons';
import { CollectionCard } from './CollectionCard';
import { CollectionsFilters } from './CollectionsFilters';
import {
  collectionHref,
  collectionIdentityFromEntity,
  collectionIdentityKey,
  collectionSourceType,
  groupCollections,
  matchesCollectionSourceFilter,
} from './collectionHelpers';
import type { CollectionSourceFilter } from './collectionHelpers';
import styles from './CollectionsCatalogPage.module.css';

const PAGE_SIZE = 12;
const MAX_COLLECTION_IDENTITIES = 500;
const MAX_MATCHING_CATALOG_ENTITIES = 1000;
const NO_CATALOG_ENTITIES: Entity[] = [];
const NO_REGISTRIES: Registry[] = [];

interface CatalogCollectionLookup {
  entities: Entity[];
  complete: boolean;
  signature: string;
}

interface CollectionCardModel {
  collection: ReturnType<typeof groupCollections>[number]['versions'][number];
}

function entityIdentity(entity: Entity): string | undefined {
  const identity = collectionIdentityFromEntity(entity);
  return identity
    ? collectionIdentityKey(identity.fqcn, identity.version)
    : undefined;
}

/** Registry-backed collections with Tina's compact catalog controls and cards. */
export function CollectionsCatalogPage(): ReactElement {
  const api = useApi(automationContentApiRef);
  const catalogApi = useApi(catalogApiRef);
  const base = useRouteRef(collectionsRouteRef)();
  const { isSuperuser } = useIsSuperuser();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [latestOnly, setLatestOnly] = useState(true);
  const [scope, setScope] = useState<'all' | 'starred'>('all');
  const [sourceTypeFilter, setSourceTypeFilter] =
    useState<CollectionSourceFilter>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    kind: 'success' | 'partial' | 'error';
    message: string;
  }>();
  const syncInFlight = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const collectionResult = useAsyncRetry(
    () => api.listCollections(search || undefined),
    [api, search],
  );
  const registriesResult = useAsyncRetry(() => api.listRegistries(), [api]);
  const groups = useMemo(
    () => groupCollections(collectionResult.value ?? []),
    [collectionResult.value],
  );
  const allCardModels = useMemo<CollectionCardModel[]>(
    () =>
      groups.flatMap(group =>
        latestOnly
          ? [{ collection: group.versions[0] }]
          : group.versions.map(collection => ({ collection })),
      ),
    [groups, latestOnly],
  );
  const identities = useMemo(
    () =>
      groups.flatMap(group =>
        (latestOnly ? group.versions.slice(0, 1) : group.versions).map(
          collection => ({
            fqcn: collection.fqcn,
            version: collection.version,
          }),
        ),
      ),
    [groups, latestOnly],
  );
  const identitySignature = useMemo(
    () =>
      identities
        .map(identity => collectionIdentityKey(identity.fqcn, identity.version))
        .sort()
        .join('\n'),
    [identities],
  );

  const catalogCollections =
    useAsyncRetry(async (): Promise<CatalogCollectionLookup> => {
      if (!identities.length) {
        return { entities: [], complete: true, signature: identitySignature };
      }
      if (identities.length > MAX_COLLECTION_IDENTITIES) {
        return { entities: [], complete: false, signature: identitySignature };
      }

      const fqcnValues = Array.from(new Set(identities.map(item => item.fqcn)));
      const versionValues = Array.from(
        new Set(identities.map(item => item.version)),
      );
      const response = await catalogApi.queryEntities({
        query: {
          $all: [
            { kind: 'Component' },
            {
              'metadata.annotations.ansible.com/collection': {
                $in: fqcnValues,
              },
            },
            {
              'metadata.annotations.ansible.com/version': {
                $in: versionValues,
              },
            },
          ],
        },
        fields: [
          'kind',
          'metadata.name',
          'metadata.namespace',
          'metadata.annotations',
          'metadata.tags',
        ],
        limit: MAX_MATCHING_CATALOG_ENTITIES,
      });
      const expected = new Set(
        identities.map(item => collectionIdentityKey(item.fqcn, item.version)),
      );
      const entities = response.items.filter(entity => {
        const key = entityIdentity(entity);
        return key !== undefined && expected.has(key);
      });
      return {
        entities,
        signature: identitySignature,
        complete:
          !response.pageInfo.nextCursor &&
          response.totalItems <= response.items.length,
      };
    }, [catalogApi, identitySignature]);

  const catalogEntities =
    catalogCollections.value?.entities ?? NO_CATALOG_ENTITIES;
  const catalogMetadataComplete =
    !catalogCollections.loading &&
    !catalogCollections.error &&
    catalogCollections.value?.complete === true &&
    catalogCollections.value.signature === identitySignature;
  const entitiesByIdentity = useMemo(() => {
    const result = new Map<string, Entity[]>();
    for (const entity of catalogEntities) {
      const key = entityIdentity(entity);
      if (key) result.set(key, [...(result.get(key) ?? []), entity]);
    }
    return result;
  }, [catalogEntities]);
  const starredIdentityKeys = useMemo(() => {
    const result = new Set<string>();
    for (const entity of catalogEntities) {
      if (!isStarredEntity(entity)) continue;
      const key = entityIdentity(entity);
      if (key) result.add(key);
    }
    return result;
  }, [catalogEntities, isStarredEntity]);
  const catalogTags = useMemo(
    () =>
      Array.from(
        new Set(
          catalogEntities
            .flatMap(entity => entity.metadata.tags ?? [])
            .filter(tag => tag !== 'ansible-collection'),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [catalogEntities],
  );
  const registries = registriesResult.value ?? NO_REGISTRIES;
  const availableSourceTypes = useMemo(
    () =>
      new Set(
        allCardModels.map(({ collection }) =>
          collectionSourceType(collection.providedBy, registries),
        ),
      ),
    [allCardModels, registries],
  );
  const sourceTypeOptions = useMemo<
    Array<{ id: CollectionSourceFilter; label: string }>
  >(
    () => [
      { id: 'all', label: 'All sources' },
      ...(availableSourceTypes.has('external-registry')
        ? [{ id: 'external-registry' as const, label: 'External registry' }]
        : []),
      ...(availableSourceTypes.has('unknown')
        ? [{ id: 'unknown' as const, label: 'Unknown' }]
        : []),
    ],
    [availableSourceTypes],
  );
  const sourceTypeFilterAvailable =
    !registriesResult.loading &&
    !registriesResult.error &&
    sourceTypeOptions.length > 1;
  const starredAvailable =
    catalogMetadataComplete && catalogEntities.length > 0;
  const tagsAvailable = catalogMetadataComplete && catalogTags.length > 0;

  const metadataRequired = scope === 'starred' || tagFilter !== 'all';
  const metadataPending =
    metadataRequired &&
    !catalogCollections.error &&
    (catalogCollections.loading ||
      catalogCollections.value?.signature !== identitySignature);
  const resultsLoading = collectionResult.loading || metadataPending;
  const resultsReady =
    !resultsLoading &&
    !collectionResult.error &&
    (!metadataRequired || catalogMetadataComplete);
  useEffect(() => {
    if (
      !sourceTypeOptions.some(option => option.id === sourceTypeFilter) &&
      sourceTypeFilter !== 'all'
    ) {
      setSourceTypeFilter('all');
    }
  }, [sourceTypeFilter, sourceTypeOptions]);
  useEffect(() => {
    if (
      catalogMetadataComplete &&
      tagFilter !== 'all' &&
      !catalogTags.includes(tagFilter)
    ) {
      setTagFilter('all');
    }
  }, [catalogMetadataComplete, catalogTags, tagFilter]);

  const beforeStarredFilter = allCardModels.filter(({ collection }) => {
    if (
      !matchesCollectionSourceFilter(
        collection.providedBy,
        registries,
        sourceTypeFilter,
      )
    ) {
      return false;
    }
    if (tagFilter !== 'all') {
      const key = collectionIdentityKey(collection.fqcn, collection.version);
      if (
        !entitiesByIdentity
          .get(key)
          ?.some(entity => entity.metadata.tags?.includes(tagFilter))
      ) {
        return false;
      }
    }
    return true;
  });
  const starredCount = beforeStarredFilter.filter(({ collection }) =>
    starredIdentityKeys.has(
      collectionIdentityKey(collection.fqcn, collection.version),
    ),
  ).length;
  const filteredCards =
    scope === 'starred'
      ? beforeStarredFilter.filter(({ collection }) =>
          starredIdentityKeys.has(
            collectionIdentityKey(collection.fqcn, collection.version),
          ),
        )
      : beforeStarredFilter;
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleCards = filteredCards.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );
  let emptyTitle = 'No collections found';
  let emptyDescription =
    'Adjust your search or filters, or check back after registries are reconciled.';
  const resultsCount = resultsReady ? ` (${filteredCards.length})` : '';
  if (scope === 'starred') {
    emptyTitle = 'No starred collections';
    emptyDescription =
      'Star a collection with a matching catalog entry to find it here.';
  } else if (search || sourceTypeFilter !== 'all' || tagFilter !== 'all') {
    emptyTitle = 'No collections match your search or filters';
  }

  const sync = async (): Promise<void> => {
    if (!isSuperuser || syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    setSyncStatus(undefined);
    try {
      const result = await api.syncAll();
      const failures = result.registries.filter(registry => !registry.ok);
      if (result.status === 'partial' || failures.length > 0) {
        const failureSummary = failures.length
          ? ` Failed: ${failures
              .map(registry => registry.registry)
              .join(', ')}.`
          : '';
        setSyncStatus({
          kind: 'partial',
          message: `Sync partially completed: ${
            result.registries.length - failures.length
          } of ${
            result.registries.length
          } registries succeeded.${failureSummary}`,
        });
      } else {
        setSyncStatus({
          kind: 'success',
          message: `Sync completed: ${result.registries.length} registries checked.`,
        });
      }
      collectionResult.retry();
      registriesResult.retry();
      catalogCollections.retry();
    } catch (error) {
      setSyncStatus({
        kind: 'error',
        message:
          error instanceof Error
            ? `Sync failed: ${error.message}`
            : 'Sync failed: the content service could not complete the request.',
      });
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  };

  return (
    <div className={styles.pageFrame}>
      <section className={styles.pageSurface} aria-label="Collections catalog">
        <Flex direction="column" gap="3">
          <div className={styles.pageHeader}>
            <div className={styles.pageTitleGroup}>
              <Text
                as="h1"
                variant="title-small"
                weight="bold"
                className={styles.pageTitle}
              >
                Collections
              </Text>
              <TooltipTrigger>
                <ButtonIcon
                  variant="tertiary"
                  icon={<HelpIcon />}
                  aria-label="About collections"
                />
                <Tooltip>
                  An Ansible Collection is a package of reusable automation
                  content, including modules, roles, plugins and playbooks.
                </Tooltip>
              </TooltipTrigger>
            </div>
            {isSuperuser && (
              <Button
                variant="secondary"
                size="small"
                iconStart={<SyncIcon />}
                isPending={syncing}
                isDisabled={syncing}
                onPress={() => void sync()}
              >
                Sync Now
              </Button>
            )}
          </div>
          <Text as="p" variant="body-small" color="secondary">
            Browse Ansible collections and the execution environments that
            provide them.
          </Text>
          {syncStatus && (
            <Text
              role={syncStatus.kind === 'error' ? 'alert' : 'status'}
              color={syncStatus.kind === 'error' ? 'danger' : 'secondary'}
            >
              {syncStatus.message}
            </Text>
          )}
          {registriesResult.error && (
            <div className={styles.serviceError} role="alert">
              Unable to load source registry details.{' '}
              <Button size="small" onPress={registriesResult.retry}>
                Retry
              </Button>
            </div>
          )}
          {(catalogCollections.error ||
            (metadataRequired &&
              !resultsLoading &&
              !catalogMetadataComplete)) && (
            <div className={styles.serviceError} role="alert">
              Unable to load matching collection catalog details.{' '}
              <Button size="small" onPress={catalogCollections.retry}>
                Retry
              </Button>
            </div>
          )}
          <div className={styles.catalogLayout}>
            <CollectionsFilters
              search={query}
              onSearchChange={value => {
                setQuery(value);
                setPage(0);
              }}
              scope={scope}
              onScopeChange={value => {
                setScope(value);
                setPage(0);
              }}
              allCount={
                collectionResult.loading || collectionResult.error
                  ? '—'
                  : beforeStarredFilter.length
              }
              starredCount={starredCount}
              starredAvailable={starredAvailable}
              sourceTypeOptions={sourceTypeOptions}
              sourceTypeFilter={sourceTypeFilter}
              sourceTypeFilterAvailable={sourceTypeFilterAvailable}
              onSourceTypeFilterChange={value => {
                setSourceTypeFilter(value);
                setPage(0);
              }}
              tags={catalogTags}
              tagFilter={tagFilter}
              onTagFilterChange={value => {
                setTagFilter(value);
                setPage(0);
              }}
              tagsAvailable={tagsAvailable}
              latestOnly={latestOnly}
              onLatestOnlyChange={value => {
                setLatestOnly(value);
                setPage(0);
              }}
            />
            <section aria-label="Ansible collections">
              <div className={styles.resultsHeader}>
                <Text
                  as="h2"
                  variant="title-small"
                  weight="bold"
                  className={styles.resultsTitle}
                  aria-live="polite"
                >
                  Ansible collections{resultsCount}
                </Text>
              </div>
              {collectionResult.error && (
                <div role="alert">
                  Unable to load collections.{' '}
                  <Button onPress={collectionResult.retry}>Retry</Button>
                </div>
              )}
              {resultsLoading && (
                <div
                  className={styles.cardGrid}
                  aria-label="Loading collections"
                >
                  {[0, 1, 2].map(index => (
                    <Skeleton key={index} width="100%" height="9rem" />
                  ))}
                </div>
              )}
              {resultsReady && filteredCards.length === 0 && (
                <EmptyState title={emptyTitle} description={emptyDescription} />
              )}
              {resultsReady && (
                <>
                  <div className={styles.cardGrid}>
                    {visibleCards.map(({ collection }) => {
                      const key = collectionIdentityKey(
                        collection.fqcn,
                        collection.version,
                      );
                      const matchingEntities =
                        entitiesByIdentity.get(key) ?? [];
                      return (
                        <CollectionCard
                          key={key}
                          collection={collection}
                          href={`${collectionHref(
                            base,
                            collection.namespace,
                            collection.name,
                          )}?version=${encodeURIComponent(collection.version)}`}
                          registries={registries}
                          catalogEntities={matchingEntities}
                          catalogMetadataAvailable={catalogMetadataComplete}
                          isStarredEntity={isStarredEntity}
                          toggleStarredEntity={toggleStarredEntity}
                        />
                      );
                    })}
                  </div>
                  {filteredCards.length > 0 && (
                    <div className={styles.pagination}>
                      <Button
                        size="small"
                        variant="secondary"
                        isDisabled={currentPage === 0}
                        onPress={() => setPage(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      <Text color="secondary">
                        Showing {currentPage * PAGE_SIZE + 1}–
                        {Math.min(
                          (currentPage + 1) * PAGE_SIZE,
                          filteredCards.length,
                        )}{' '}
                        of {filteredCards.length}
                      </Text>
                      <Text color="secondary">
                        Page {currentPage + 1} of {totalPages}
                      </Text>
                      <Button
                        size="small"
                        variant="secondary"
                        isDisabled={currentPage + 1 >= totalPages}
                        onPress={() => setPage(currentPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </Flex>
      </section>
    </div>
  );
}
