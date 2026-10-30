import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useApi } from '@backstage/core-plugin-api';
import {
  Button,
  CellText,
  Flex,
  SearchField,
  Table,
  Text,
  useTable,
  type ColumnConfig,
} from '@backstage/ui';
import { automationContentApiRef, type ContentItemSummary } from '../../api';
import { EmptyState } from '../common';
import styles from './details.module.css';

interface ItemRow extends ContentItemSummary {
  id: string;
}

/** Backend-scoped content search. Loaded rows and total matches remain distinct. */
export function ContentItemsTable({
  inArtifact,
  collection,
  itemHref,
}: {
  inArtifact?: string;
  collection?: string;
  itemHref: (item: ContentItemSummary) => string;
}): ReactElement {
  const api = useApi(automationContentApiRef);
  const [query, setQuery] = useState('');
  const result = useAsyncRetry(
    () =>
      api.searchContentItems({
        in: inArtifact,
        collection,
        q: query,
        limit: 500,
      }),
    [api, inArtifact, collection, query],
  );
  const data = useMemo(
    () =>
      result.value?.items.map((item, index) => ({
        ...item,
        id: `${item.in ?? inArtifact}:${item.type}:${item.fqcn}:${index}`,
      })),
    [result.value, inArtifact],
  );
  const table = useTable<ItemRow>({
    mode: 'complete',
    data,
    paginationOptions: { pageSize: 10, pageSizeOptions: [10, 20, 50] },
  });
  const columns: ColumnConfig<ItemRow>[] = [
    {
      id: 'name',
      label: 'Name',
      isRowHeader: true,
      cell: item => <CellText title={item.fqcn} href={itemHref(item)} />,
    },
    { id: 'type', label: 'Type', cell: item => <CellText title={item.type} /> },
    {
      id: 'description',
      label: 'Description',
      cell: item => (
        <CellText title={item.shortDescription ?? 'No description available'} />
      ),
    },
    {
      id: 'version',
      label: 'Collection version',
      cell: item => <CellText title={item.collectionVersion} />,
    },
    {
      id: 'added',
      label: 'Added',
      cell: item => <CellText title={item.versionAdded ?? 'Unknown'} />,
    },
  ];
  return (
    <Flex direction="column" gap="3">
      <SearchField
        label="Search content items"
        value={query}
        onChange={setQuery}
      />
      {result.error && (
        <div role="alert">
          Unable to load content items.{' '}
          <Button onPress={result.retry}>Retry</Button>
        </div>
      )}
      {!result.loading && !result.error && result.value && (
        <Text aria-live="polite">
          {data?.length ?? 0} loaded of {result.value?.totalItems ?? 0} matching
          content items
        </Text>
      )}
      {result.value && result.value.totalItems > result.value.items.length && (
        <Text>
          Results are limited to 500 items. Refine your search to find more.
        </Text>
      )}
      <div aria-busy={result.loading} className={styles.table}>
        {!result.error && (
          <Table
            {...table.tableProps}
            isPending={result.loading}
            columnConfig={columns}
            emptyState={
              <EmptyState
                title="No content items found"
                description="Refine your search, or check the image inventory fidelity."
              />
            }
          />
        )}
      </div>
    </Flex>
  );
}
