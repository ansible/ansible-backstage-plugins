import { useEffect, useMemo, useState } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import useDebounce from 'react-use/lib/useDebounce';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useApi, useTranslationRef } from '@backstage/frontend-plugin-api';
import {
  catalogApiRef,
  useEntityRefLink,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Cell,
  CellText,
  Checkbox,
  Container,
  Flex,
  Grid,
  Link,
  SearchField,
  Select,
  Table,
  TablePagination,
  Text,
  type ColumnConfig,
  type TablePaginationProps,
} from '@backstage/ui';
import {
  EE_REPOSITORY_ANNOTATIONS,
  EE_REPOSITORY_ENTITY_REF_PATTERN,
  EE_REPOSITORY_ENTITY_TYPE,
  type EERepositoryQuery,
  type EERepositorySummary,
} from '@ansible/automation-content-common/eeRepository';
import { executionEnvironmentsViewPermission } from '@ansible/automation-content-common/permissions';
import { automationContentApiRef, ContentApiError } from '../../api';
import { eeTranslationRef } from '../../strings/en';
import { useContentPermission } from '../../useContentPermission';
import { RepositoryFavoriteButton } from './RepositoryFavoriteButton';
import { SigningEvidence } from './SigningEvidence';
import { SyncAction } from './SyncAction';

type ImageRow = EERepositorySummary & { id: string };
const pageSizes = [10, 20, 50];
const ALL_REGISTRIES = 'all';

export function EEImagesPage(): JSX.Element {
  const permission = useContentPermission(executionEnvironmentsViewPermission);
  const { t } = useTranslationRef(eeTranslationRef);
  if (permission === 'pending') {
    return (
      <Container>
        <Text role="status">{t('inventory.permissionLoading')}</Text>
      </Container>
    );
  }
  if (permission !== 'allowed') {
    return (
      <Container>
        <Alert
          status={permission === 'unavailable' ? 'danger' : 'warning'}
          title={t(
            permission === 'unavailable'
              ? 'inventory.permissionError'
              : 'inventory.denied',
          )}
        />
      </Container>
    );
  }
  return <EEInventory />;
}

function EEInventory(): JSX.Element {
  const api = useApi(automationContentApiRef);
  const catalogApi = useApi(catalogApiRef);
  const entityLink = useEntityRefLink();
  const { starredEntities } = useStarredEntities();
  const { t } = useTranslationRef(eeTranslationRef);
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [registry, setRegistry] = useState<string>();
  const [sort, setSort] =
    useState<NonNullable<EERepositoryQuery['sort']>>('repository');
  const [order, setOrder] =
    useState<NonNullable<EERepositoryQuery['order']>>('asc');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [pageSize, setPageSize] =
    useState<NonNullable<EERepositoryQuery['pageSize']>>(10);
  const [page, setPage] = useState(1);
  useDebounce(
    () => {
      const normalized = search.trim();
      if (normalized !== query) {
        setQuery(normalized);
        setPage(1);
      }
    },
    250,
    [search],
  );

  const favoriteEntityRefs = useMemo(
    () =>
      favoriteOnly
        ? Array.from(starredEntities).filter(ref =>
            EE_REPOSITORY_ENTITY_REF_PATTERN.test(ref),
          )
        : undefined,
    [favoriteOnly, starredEntities],
  );
  const tooManyFavorites = (favoriteEntityRefs?.length ?? 0) > 1000;
  const registries = useAsyncRetry(() => api.getRegistryStatus(), [api]);
  const result = useAsyncRetry(
    async () =>
      tooManyFavorites
        ? undefined
        : api.queryEERepositories({
            page,
            pageSize,
            query: query || undefined,
            registry,
            sort,
            order,
            favoriteEntityRefs,
          }),
    [
      api,
      favoriteEntityRefs,
      order,
      page,
      pageSize,
      query,
      registry,
      sort,
      tooManyFavorites,
    ],
  );

  const total = result.value?.totalItems ?? 0;
  useEffect(() => {
    if (!result.value || result.loading) return;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [page, pageSize, result.loading, result.value, total]);

  const rows: ImageRow[] | undefined = result.value?.items.map(item => ({
    ...item,
    id: item.entityRef,
  }));
  const refs = useMemo(
    () => (result.value?.items ?? []).map(item => item.entityRef),
    [result.value],
  );
  const catalog = useAsyncRetry(async () => {
    if (refs.length === 0) return new Set<string>();
    const response = await catalogApi.getEntitiesByRefs({ entityRefs: refs });
    return new Set(
      response.items
        .filter(
          entity =>
            entity?.spec?.type === EE_REPOSITORY_ENTITY_TYPE &&
            entity.metadata.annotations?.[EE_REPOSITORY_ANNOTATIONS.marker] ===
              'true',
        )
        .flatMap(entity => (entity ? [stringifyEntityRef(entity)] : [])),
    );
  }, [catalogApi, refs]);
  const canOpen = (row: ImageRow) =>
    !catalog.error && catalog.value?.has(row.entityRef) === true;
  const catalogStatus = catalog.loading
    ? t('inventory.catalogPending')
    : t('inventory.catalogMissing');
  const titleFor = (row: ImageRow) =>
    canOpen(row) ? (
      <Link href={entityLink(row.entityRef)}>{row.repository}</Link>
    ) : (
      <Text>{row.repository}</Text>
    );
  const favoriteFor = (row: ImageRow) =>
    canOpen(row) ? (
      <RepositoryFavoriteButton
        entityRef={row.entityRef}
        repository={row.repository}
      />
    ) : (
      <Text>{catalogStatus}</Text>
    );

  const columns: ColumnConfig<ImageRow>[] = [
    {
      id: 'repository',
      label: t('inventory.repository'),
      isRowHeader: true,
      cell: row => <Cell>{titleFor(row)}</Cell>,
    },
    {
      id: 'registry',
      label: t('inventory.registry'),
      cell: row => <CellText title={row.registry} />,
    },
    {
      id: 'tag',
      label: t('inventory.tag'),
      cell: row => (
        <CellText title={row.representativeTag ?? t('inventory.untagged')} />
      ),
    },
    {
      id: 'tagCount',
      label: t('inventory.tagCount'),
      cell: row => <CellText title={String(row.tagCount)} />,
    },
    {
      id: 'signing',
      label: t('inventory.signing'),
      cell: row => (
        <Cell>
          <SigningEvidence compact state={row.signingState} />
        </Cell>
      ),
    },
    {
      id: 'synchronized',
      label: t('inventory.reconcile'),
      cell: row => (
        <CellText
          title={
            row.lastSuccessfulReconcileAt
              ? new Date(row.lastSuccessfulReconcileAt).toLocaleString()
              : t('inventory.never')
          }
        />
      ),
    },
    {
      id: 'favorite',
      label: t('inventory.favorite'),
      cell: row => <Cell>{favoriteFor(row)}</Cell>,
    },
  ];

  const pagination: TablePaginationProps = {
    pageSize,
    pageSizeOptions: pageSizes,
    offset: (page - 1) * pageSize,
    totalCount: total,
    hasNextPage: page * pageSize < total,
    hasPreviousPage: page > 1,
    onNextPage: () => setPage(current => current + 1),
    onPreviousPage: () => setPage(current => Math.max(1, current - 1)),
    onPageSizeChange: size => {
      if (size === 10 || size === 20 || size === 50) {
        setPageSize(size);
        setPage(1);
      }
    },
  };
  const noRegistries = registries.value?.items.length === 0;
  const empty = (
    <Text role="status">
      {t(noRegistries ? 'inventory.noRegistries' : 'inventory.empty')}
    </Text>
  );
  function reload(): void {
    result.retry();
    catalog.retry();
    registries.retry();
  }

  let results: JSX.Element;
  if (tooManyFavorites) {
    results = (
      <Alert status="warning" title={t('inventory.tooManyFavorites')} />
    );
  } else if (result.error) {
    const denied =
      result.error instanceof ContentApiError && result.error.status === 403;
    results = (
      <Alert
        status="danger"
        title={t(denied ? 'inventory.denied' : 'inventory.failed')}
        customActions={
          <Button variant="tertiary" onPress={reload}>
            {t('retry')}
          </Button>
        }
      />
    );
  } else if (view === 'table') {
    results = (
      <Table
        columnConfig={columns}
        rowConfig={{
          getHref: row =>
            canOpen(row) ? entityLink(row.entityRef) : undefined,
        }}
        data={result.loading ? undefined : rows}
        isPending={result.loading}
        pagination={{ type: 'page', ...pagination }}
        emptyState={empty}
      />
    );
  } else if (result.loading) {
    results = <Text role="status">{t('inventory.loading')}</Text>;
  } else {
    results = (
      <>
        {!rows?.length ? (
          empty
        ) : (
          <Grid.Root columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
            {rows.map(row => (
              <Grid.Item key={row.id}>
                <Card>
                  <CardBody>
                    <Flex direction="column" gap="2">
                      {titleFor(row)}
                      <Text>{row.registry}</Text>
                      <Text>
                        {row.representativeTag ?? t('inventory.untagged')}
                      </Text>
                      <SigningEvidence compact state={row.signingState} />
                      {favoriteFor(row)}
                    </Flex>
                  </CardBody>
                </Card>
              </Grid.Item>
            ))}
          </Grid.Root>
        )}
        <TablePagination {...pagination} />
      </>
    );
  }

  return (
    <Container role="region" aria-label={t('pageTitle')}>
      <Flex direction="column" gap="4">
        <Grid.Root columns={{ initial: '1', sm: '2', lg: '4' }} gap="3">
          <SearchField
            label={t('inventory.search')}
            value={search}
            maxLength={256}
            onChange={setSearch}
          />
          <Select
            label={t('inventory.registry')}
            options={[
              { id: ALL_REGISTRIES, label: t('inventory.allRegistries') },
              ...(registries.value?.items ?? []).map(item => ({
                id: `registry:${item.name}`,
                label: item.name,
              })),
            ]}
            selectedKey={registry ? `registry:${registry}` : ALL_REGISTRIES}
            onSelectionChange={key => {
              setRegistry(
                typeof key === 'string' && key.startsWith('registry:')
                  ? key.slice(9)
                  : undefined,
              );
              setPage(1);
            }}
          />
          <Select
            label={t('inventory.sort')}
            options={[
              { id: 'repository', label: t('inventory.repository') },
              { id: 'registry', label: t('inventory.registry') },
              {
                id: 'lastSuccessfulReconcileAt',
                label: t('inventory.reconcile'),
              },
            ]}
            selectedKey={sort}
            onSelectionChange={key => {
              if (
                key === 'repository' ||
                key === 'registry' ||
                key === 'lastSuccessfulReconcileAt'
              )
                setSort(key);
              setPage(1);
            }}
          />
          <Select
            label={t('inventory.order')}
            options={[
              { id: 'asc', label: t('inventory.ascending') },
              { id: 'desc', label: t('inventory.descending') },
            ]}
            selectedKey={order}
            onSelectionChange={key => {
              if (key === 'asc' || key === 'desc') setOrder(key);
              setPage(1);
            }}
          />
        </Grid.Root>
        <Checkbox
          isSelected={favoriteOnly}
          onChange={next => {
            setFavoriteOnly(next);
            setPage(1);
          }}
        >
          {t('inventory.favoritesOnly')}
        </Checkbox>
        <Flex gap="2">
          <Button
            variant="secondary"
            aria-pressed={view === 'table'}
            onPress={() => setView('table')}
          >
            {t('inventory.table')}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={view === 'grid'}
            onPress={() => setView('grid')}
          >
            {t('inventory.grid')}
          </Button>
        </Flex>
        <SyncAction
          manualSyncEnabled={registries.value?.manualSyncEnabled === true}
          onReload={reload}
        />
        {catalog.error && (
          <Alert
            status="warning"
            title={t('inventory.catalogFailed')}
            customActions={
              <Button variant="tertiary" onPress={catalog.retry}>
                {t('retry')}
              </Button>
            }
          />
        )}
        {!catalog.error &&
          !catalog.loading &&
          rows?.some(row => !canOpen(row)) && (
            <Button variant="tertiary" onPress={catalog.retry}>
              {t('retry')}
            </Button>
          )}
        {results}
      </Flex>
    </Container>
  );
}
