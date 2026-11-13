import { useEffect, useMemo, useState } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import useDebounce from 'react-use/lib/useDebounce';
import useInterval from 'react-use/lib/useInterval';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useApi, useTranslationRef } from '@backstage/frontend-plugin-api';
import {
  catalogApiRef,
  useEntityRefLink,
} from '@backstage/plugin-catalog-react';
import {
  Alert,
  Box,
  Button,
  ButtonIcon,
  Card,
  CardBody,
  Cell,
  CellText,
  Container,
  Flex,
  Grid,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
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
  EE_REPOSITORY_ENTITY_TYPE,
  EE_REPOSITORY_SOURCE_TYPE,
  EE_REPOSITORY_STATUSES,
  eeRepositoryStatus,
  type EERepositoryStatus,
  type EERepositoryQuery,
  type EERepositorySummary,
} from '@ansible/automation-content-common/eeRepository';
import { RiGridLine, RiTableLine } from '@remixicon/react';
import {
  contentSyncPermission,
  executionEnvironmentsViewPermission,
} from '@ansible/automation-content-common/permissions';
import {
  automationContentApiRef,
  ContentApiError,
  registrySyncEvents,
} from '../../api';
import { eeTranslationRef } from '../../strings/en';
import { useContentPermission } from '../../useContentPermission';
import { EEImageRowActions } from './EEImageRowActions';
import { SigningEvidence } from './SigningEvidence';
import { timeSince } from './timeSince';

type ImageRow = EERepositorySummary & { id: string };
const pageSizes = [10, 20, 50];
const ALL = 'all';
const statusLabels = {
  available: 'inventory.available',
  stale: 'inventory.stale',
  'not-reconciled': 'inventory.notReconciled',
} as const;

function InventoryFilter<Value extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: { value: Value; label: string }[];
  value?: Value;
  onChange: (value?: Value) => void;
}): JSX.Element {
  return (
    <Select
      label={label}
      options={[
        { id: ALL, label: allLabel },
        ...options.map(option => ({
          id: `value:${option.value}`,
          label: option.label,
        })),
      ]}
      selectedKey={value === undefined ? ALL : `value:${value}`}
      onSelectionChange={key => {
        onChange(
          options.find(option => `value:${option.value}` === key)?.value,
        );
      }}
    />
  );
}

export function EEImagesPage(): JSX.Element {
  const permission = useContentPermission(executionEnvironmentsViewPermission);
  const { t } = useTranslationRef(eeTranslationRef);
  if (permission === 'pending') {
    return (
      <Container role="main" aria-label={t('pageTitle')}>
        <Text role="status">{t('inventory.permissionLoading')}</Text>
      </Container>
    );
  }
  if (permission !== 'allowed') {
    return (
      <Container role="main" aria-label={t('pageTitle')}>
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
  const [now, setNow] = useState(Date.now);
  useInterval(() => setNow(Date.now()), 15_000);
  const api = useApi(automationContentApiRef);
  const catalogApi = useApi(catalogApiRef);
  const entityLink = useEntityRefLink();
  const syncPermission = useContentPermission(contentSyncPermission);
  const { t } = useTranslationRef(eeTranslationRef);
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [registry, setRegistry] = useState<string>();
  const [sourceType, setSourceType] =
    useState<EERepositoryQuery['sourceType']>();
  const [status, setStatus] = useState<EERepositoryStatus>();
  const [sort, setSort] =
    useState<NonNullable<EERepositoryQuery['sort']>>('repository');
  const [order, setOrder] =
    useState<NonNullable<EERepositoryQuery['order']>>('asc');
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

  const registries = useAsyncRetry(() => api.getRegistryStatus(), [api]);
  const result = useAsyncRetry(
    () =>
      api.queryEERepositories({
        page,
        pageSize,
        query: query || undefined,
        registry,
        sourceType,
        status,
        sort,
        order,
      }),
    [api, order, page, pageSize, query, registry, sort, sourceType, status],
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
      <Link
        href={entityLink(row.entityRef)}
        style={{ textDecorationLine: 'underline' }}
      >
        {row.repository}
      </Link>
    ) : (
      <Text>{row.repository}</Text>
    );
  const actionsFor = (row: ImageRow) => (
    <>
      <EEImageRowActions
        image={row}
        detailHref={canOpen(row) ? entityLink(row.entityRef) : undefined}
        canSync={
          syncPermission === 'allowed' &&
          registries.value?.manualSyncEnabled === true
        }
        onReload={reload}
      />
      {!canOpen(row) && <Text>{catalogStatus}</Text>}
    </>
  );
  const registryByName = new Map(
    registries.value?.items.map(item => [item.name, item]),
  );
  function contentsLabel(count?: number): string {
    if (count === undefined) return t('inventory.contentsUnknown');
    if (count === 1) return t('inventory.oneCollection');
    return t('inventory.collectionCount', { quantity: String(count) });
  }

  function statusLabel(row: ImageRow): string {
    return t(
      statusLabels[
        row.status ??
          eeRepositoryStatus(
            row.lastSuccessfulReconcileAt,
            registryByName.get(row.registry)?.lastReconcileOk,
          )
      ],
    );
  }

  const columns: ColumnConfig<ImageRow>[] = [
    {
      id: 'repository',
      label: t('inventory.image'),
      isRowHeader: true,
      isSortable: true,
      defaultWidth: '2fr',
      cell: row => <Cell>{titleFor(row)}</Cell>,
    },
    {
      id: 'registry',
      label: t('inventory.source'),
      isSortable: true,
      cell: row => <CellText title={row.registry} />,
    },
    {
      id: 'sourceType',
      label: t('inventory.sourceType'),
      defaultWidth: '1.25fr',
      cell: () => <CellText title={t('inventory.externalRegistry')} />,
    },
    {
      id: 'contents',
      label: t('inventory.contents'),
      defaultWidth: '1.25fr',
      cell: row => <CellText title={contentsLabel(row.collectionCount)} />,
    },
    {
      id: 'status',
      label: t('inventory.status'),
      cell: row => <CellText title={statusLabel(row)} />,
    },
    {
      id: 'lastSuccessfulReconcileAt',
      label: t('inventory.lastSynced'),
      isSortable: true,
      cell: row => {
        const timestamp = row.lastSuccessfulReconcileAt;
        if (!timestamp || !Number.isFinite(Date.parse(timestamp))) {
          return <CellText title={t('inventory.notReconciled')} />;
        }
        return (
          <Cell>
            <Text as="span">
              <time
                dateTime={timestamp}
                title={new Date(timestamp).toLocaleString()}
              >
                {timeSince(timestamp, now, t('inventory.justNow'))}
              </time>
            </Text>
          </Cell>
        );
      },
    },
    {
      id: 'actions',
      label: t('inventory.actions'),
      minWidth: 100,
      cell: row => <Cell>{actionsFor(row)}</Cell>,
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

  const retryInventory = result.retry;
  const retryRegistries = registries.retry;
  useEffect(() => {
    const update = () => {
      retryInventory();
      retryRegistries();
    };
    registrySyncEvents.addEventListener('settled', update);
    return () => registrySyncEvents.removeEventListener('settled', update);
  }, [retryInventory, retryRegistries]);

  let results: JSX.Element;
  if (result.error) {
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
      <Card>
        <Table
          columnConfig={columns}
          sort={{
            descriptor: {
              column: sort,
              direction: order === 'asc' ? 'ascending' : 'descending',
            },
            onSortChange: ({ column, direction }) => {
              if (
                column === 'repository' ||
                column === 'registry' ||
                column === 'lastSuccessfulReconcileAt'
              ) {
                setSort(column);
                setOrder(direction === 'ascending' ? 'asc' : 'desc');
                setPage(1);
              }
            },
          }}
          rowConfig={{
            getHref: row =>
              canOpen(row) ? entityLink(row.entityRef) : undefined,
          }}
          data={result.loading ? undefined : rows}
          isPending={result.loading}
          pagination={{ type: 'page', ...pagination }}
          emptyState={empty}
        />
      </Card>
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
                      {actionsFor(row)}
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

  const facets = result.value?.facets;
  return (
    <Box role="main" aria-label={t('pageTitle')} px="4" py="6">
      <Flex direction="column" gap="5">
        <Flex direction="column" gap="2">
          <Text as="h2" variant="title-medium" weight="bold">
            {t('inventory.title')}
          </Text>
          <Text color="secondary">{t('inventory.description')}</Text>
        </Flex>
        <Grid.Root columns={{ initial: '1', md: '5' }} gap="4">
          <Grid.Item colSpan="1">
            <Flex direction="column" gap="4">
              <InventoryFilter
                label={t('inventory.source')}
                allLabel={t('inventory.allSources')}
                value={registry}
                options={(registries.value?.items ?? []).map(item => ({
                  value: item.name,
                  label: item.name,
                }))}
                onChange={value => {
                  setRegistry(value);
                  setPage(1);
                }}
              />
              <InventoryFilter
                label={t('inventory.sourceType')}
                allLabel={t('inventory.allSourceTypes')}
                value={sourceType}
                options={[
                  {
                    value: EE_REPOSITORY_SOURCE_TYPE,
                    label: t('inventory.externalRegistry'),
                  },
                ]}
                onChange={value => {
                  setSourceType(value);
                  setPage(1);
                }}
              />
              <InventoryFilter
                label={t('inventory.status')}
                allLabel={t('inventory.allStatuses')}
                value={status}
                options={EE_REPOSITORY_STATUSES.map(value => ({
                  value,
                  label: t(statusLabels[value]),
                }))}
                onChange={value => {
                  setStatus(value);
                  setPage(1);
                }}
              />
            </Flex>
          </Grid.Item>
          <Grid.Item colSpan={{ initial: '1', md: '4' }}>
            <Flex direction="column" gap="4">
              <Flex align="center" justify="between" gap="2">
                <Text color="secondary">
                  {result.value &&
                    t('inventory.count', {
                      shown: String(total),
                      total: String(facets?.totalImages ?? total),
                    })}
                </Text>
                <MenuTrigger>
                  <ButtonIcon
                    aria-label={t('inventory.changeView')}
                    variant="tertiary"
                    icon={view === 'table' ? <RiTableLine /> : <RiGridLine />}
                  />
                  <Menu placement="bottom end">
                    <MenuItem onAction={() => setView('table')}>
                      {t('inventory.table')}
                    </MenuItem>
                    <MenuItem onAction={() => setView('grid')}>
                      {t('inventory.grid')}
                    </MenuItem>
                  </Menu>
                </MenuTrigger>
              </Flex>
              <SearchField
                aria-label={t('inventory.search')}
                placeholder={t('inventory.searchPlaceholder')}
                value={search}
                maxLength={256}
                onChange={setSearch}
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
          </Grid.Item>
        </Grid.Root>
      </Flex>
    </Box>
  );
}
