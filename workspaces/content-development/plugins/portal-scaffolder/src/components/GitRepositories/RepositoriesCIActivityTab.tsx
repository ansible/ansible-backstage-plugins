import { useEffect, useMemo, useState } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Flex,
  SearchField,
  Select,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import { CIActivityRow, STATUS_LABELS } from './ciActivityUtils';
import { ciActivityCache, CIActivityCacheState } from './ciActivityCache';
import { buildCIActivityColumnConfig } from './ciActivityPresentation';

export type { CIActivityRow };

export interface RepositoriesCIActivityTabProps {
  filterByEntity?: Entity | null;
  cachedEntities?: Entity[];
}

const ALL = 'all';
const pageSizeOptions = [10, 20, 50] as const;

function statusOptionLabel(value: string): string {
  if (value === 'All') return 'All statuses';
  const labeled = STATUS_LABELS[value as CIActivityRow['status']];
  return labeled ?? value.replaceAll('_', ' ');
}

function triggerOptionLabel(value: string): string {
  return value === 'All' ? 'All triggers' : value;
}

export const RepositoriesCIActivityTab = ({
  filterByEntity,
  cachedEntities,
}: RepositoriesCIActivityTabProps = {}) => {
  const catalogApi = useApi(catalogApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [cacheState, setCacheState] = useState<CIActivityCacheState | null>(
    () => ciActivityCache.getState(),
  );
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [triggerFilter, setTriggerFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(search.trim().toLowerCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = ciActivityCache.subscribe(setCacheState);

    if (filterByEntity) {
      void ciActivityCache.startLoading(
        [filterByEntity],
        discoveryApi,
        fetchApi,
      );
    } else if (cachedEntities && cachedEntities.length > 0) {
      void ciActivityCache.startLoading(cachedEntities, discoveryApi, fetchApi);
    } else {
      catalogApi
        .getEntities({
          filter: [{ kind: 'Component', 'spec.type': 'git-repository' }],
        })
        .then(response => {
          if (cancelled) return undefined;
          const items = Array.isArray(response)
            ? response
            : (response?.items ?? []);
          return ciActivityCache.startLoading(items, discoveryApi, fetchApi);
        })
        .catch(e => {
          if (cancelled) return;
          ciActivityCache.setError(
            e instanceof Error ? e.message : 'Failed to load entities',
          );
        });
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [discoveryApi, fetchApi, catalogApi, filterByEntity, cachedEntities]);

  const rows = useMemo(() => cacheState?.rows ?? [], [cacheState?.rows]);
  const loading = cacheState?.loading ?? !cacheState;
  const fetchingMore = cacheState?.fetchingMore ?? false;
  const error = cacheState?.error ?? null;

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(rows.map(r => r.status))).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    return ['All', ...statuses];
  }, [rows]);

  const triggerOptions = useMemo(() => {
    const triggers = Array.from(new Set(rows.map(r => r.trigger))).sort(
      (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    return ['All', ...triggers];
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter(
        row =>
          (statusFilter === 'All' || row.status === statusFilter) &&
          (triggerFilter === 'All' || row.trigger === triggerFilter),
      ),
    [rows, statusFilter, triggerFilter],
  );

  const searchedRows = useMemo(() => {
    if (!searchQuery) return filteredRows;
    return filteredRows.filter(row => {
      const haystack = [
        row.project,
        row.eventDisplay,
        row.trigger,
        row.status,
        statusOptionLabel(row.status),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(searchQuery);
    });
  }, [filteredRows, searchQuery]);

  const columns = useMemo(() => buildCIActivityColumnConfig(), []);

  // Pass search/filter into useTable so offset resets when they change
  // (pre-filtering alone does not reset pagination in @backstage/ui 0.17.1).
  const tableQueryKey = `${statusFilter}::${triggerFilter}::${searchQuery}`;
  const { tableProps } = useTable({
    mode: 'complete',
    data: searchedRows,
    search: tableQueryKey,
    paginationOptions: {
      pageSize: 10,
      pageSizeOptions: [...pageSizeOptions],
    },
  });

  if (loading) {
    return <Text role="status">Loading CI activity...</Text>;
  }

  if (error) {
    return (
      <Alert
        status="danger"
        title="Unable to load CI activity"
        description={error}
      />
    );
  }

  if (rows.length === 0 && !fetchingMore) {
    return (
      <Flex direction="column" gap="2" py="6">
        <Text as="h3" variant="title-small" weight="bold">
          No CI activity yet
        </Text>
        <Text color="secondary">
          {filterByEntity
            ? 'CI activity for this repository will appear here after workflow or pipeline runs.'
            : 'CI activity from your GitHub and GitLab repositories will appear here after workflow or pipeline runs. Configure GitHub OAuth and GitLab integration in Backstage to see data.'}
        </Text>
      </Flex>
    );
  }

  // Wireframe 01 (AAP-101671): left filter rail (Status + Trigger stacked),
  // search + table on the right.
  const hasActiveFilters =
    statusFilter !== 'All' || triggerFilter !== 'All' || search.trim() !== '';

  return (
    <Flex
      align="start"
      direction={{ initial: 'column', md: 'row' }}
      gap="4"
      style={{ width: '100%' }}
    >
      <Flex direction="column" gap="4" style={{ width: 260, flexShrink: 0 }}>
        <Select
          label="Status"
          options={statusOptions.map(opt => ({
            id: opt === 'All' ? ALL : `status:${opt}`,
            label: statusOptionLabel(opt),
          }))}
          selectedKey={statusFilter === 'All' ? ALL : `status:${statusFilter}`}
          onSelectionChange={key => {
            if (key === ALL) {
              setStatusFilter('All');
              return;
            }
            setStatusFilter(String(key).replace(/^status:/, ''));
          }}
        />
        <Select
          label="Trigger"
          options={triggerOptions.map(opt => ({
            id: opt === 'All' ? ALL : `trigger:${opt}`,
            label: triggerOptionLabel(opt),
          }))}
          selectedKey={
            triggerFilter === 'All' ? ALL : `trigger:${triggerFilter}`
          }
          onSelectionChange={key => {
            if (key === ALL) {
              setTriggerFilter('All');
              return;
            }
            setTriggerFilter(String(key).replace(/^trigger:/, ''));
          }}
        />
        {hasActiveFilters ? (
          <Button
            variant="secondary"
            onPress={() => {
              setStatusFilter('All');
              setTriggerFilter('All');
              setSearch('');
            }}
            style={{ alignSelf: 'flex-start' }}
          >
            Clear filters
          </Button>
        ) : null}
      </Flex>

      <Flex direction="column" gap="4" style={{ flex: 1, minWidth: 0 }}>
        <Card>
          <CardBody>
            <Flex direction="column" gap="4" style={{ minWidth: 0 }}>
              <SearchField
                aria-label="Search CI activity"
                placeholder="Search CI activity..."
                value={search}
                onChange={setSearch}
              />
              {fetchingMore ? (
                <Text color="secondary" role="status">
                  Loading more CI activity…
                </Text>
              ) : null}
              <Table
                {...tableProps}
                columnConfig={columns}
                emptyState={
                  <Text role="status">
                    No CI activity matches your filters.
                  </Text>
                }
              />
            </Flex>
          </CardBody>
        </Card>
      </Flex>
    </Flex>
  );
};
