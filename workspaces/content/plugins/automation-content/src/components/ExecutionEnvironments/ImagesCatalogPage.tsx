import { useMemo, useState } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  Badge,
  Button,
  Cell,
  CellText,
  Checkbox,
  Container,
  Flex,
  SearchField,
  Table,
  Text,
  useTable,
  type ColumnConfig,
} from '@backstage/ui';
import { automationContentApiRef, type ExecutionEnvironment } from '../../api';
import { eeRouteRef } from '../../routes';
import { EmptyState, PageHeaderSection, StarIcon } from '../common';
import {
  environmentHref,
  matchesEnvironment,
  relativeTime,
} from './catalogHelpers';

interface ImageRow extends ExecutionEnvironment {
  id: string;
}

/** Registry inventory with client-side filtering and optional catalog-owned stars. */
export function ImagesCatalogPage() {
  const api = useApi(automationContentApiRef);
  const catalog = useApi(catalogApiRef);
  const base = useRouteRef(eeRouteRef)();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const [starredOnly, setStarredOnly] = useState(false);
  const images = useAsyncRetry(() => api.listExecutionEnvironments(), [api]);
  // Catalog failure must never hide backend inventory.
  const entities = useAsyncRetry(
    () => catalog.getEntities({ filter: { kind: 'Component' } }),
    [catalog],
  );
  const data = useMemo(
    () => images.value?.map(image => ({ ...image, id: image.ref })),
    [images.value],
  );
  const table = useTable<ImageRow>({
    mode: 'complete',
    data,
    filter: starredOnly,
    filterFn: (rows, only) =>
      only
        ? rows.filter(row => {
            const entity = entities.value?.items.find(e =>
              matchesEnvironment(e, row),
            );
            return entity && isStarredEntity(entity);
          })
        : rows,
    searchFn: (rows, query) =>
      rows.filter(row =>
        [
          row.repository,
          row.registry,
          row.digest,
          ...row.tags,
          row.classification?.type ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    paginationOptions: { pageSize: 10, pageSizeOptions: [10, 20, 50] },
  });
  const columns: ColumnConfig<ImageRow>[] = [
    {
      id: 'image',
      label: 'Image',
      isRowHeader: true,
      cell: row => (
        <CellText
          title={row.repository}
          description={row.registry}
          href={environmentHref(base, row.ref)}
        />
      ),
    },
    {
      id: 'tags',
      label: 'Tags / digest',
      cell: row => (
        <CellText
          title={row.tags.join(', ') || 'Untagged'}
          description={row.digest.slice(0, 19)}
        />
      ),
    },
    {
      id: 'contents',
      label: 'Contents',
      cell: row => (
        <CellText
          title={
            !row.contentsKnown
              ? 'Contents unknown'
              : `${
                  row.enumeration.status !== 'complete' ? 'Approximate: ' : ''
                }${row.counts?.collections ?? 'Unknown'} collections / ${
                  row.counts?.plugins ?? 'Unknown'
                } plugins`
          }
        />
      ),
    },
    {
      id: 'fidelity',
      label: 'Inventory fidelity',
      cell: row => (
        <Cell>
          <Flex direction="column" gap="1">
            <Badge>
              {row.contentsKnown ? row.enumeration.status : 'Contents unknown'}
            </Badge>
            <Text>{row.enumeration.source}</Text>
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'classification',
      label: 'Classification',
      cell: row => (
        <CellText
          title={row.classification?.type ?? 'Unknown'}
          description={row.classification?.confidence}
        />
      ),
    },
    {
      id: 'freshness',
      label: 'Last reconciled',
      cell: row => <CellText title={relativeTime(row.lastReconciledAt)} />,
    },
    {
      id: 'favourite',
      label: 'Favorite',
      cell: row => {
        const entity = entities.value?.items.find(e =>
          matchesEnvironment(e, row),
        );
        return (
          <Cell>
            {entity && (
              <Button
                variant="tertiary"
                aria-label={`${isStarredEntity(entity) ? 'Remove' : 'Add'} ${
                  row.repository
                } ${row.digest} ${
                  isStarredEntity(entity) ? 'from' : 'to'
                } favorites`}
                onPress={() => toggleStarredEntity(entity)}
              >
                <StarIcon selected={isStarredEntity(entity)} />
              </Button>
            )}
          </Cell>
        );
      },
    },
  ];
  return (
    <Container>
      <Flex direction="column" gap="4">
        <PageHeaderSection
          title="Execution environments"
          description="Discover immutable images from configured registries and inspect their Ansible content."
        />
        <SearchField
          label="Search images"
          value={table.search.value}
          onChange={table.search.onChange}
        />
        <Checkbox isSelected={starredOnly} onChange={setStarredOnly}>
          Favorites only
        </Checkbox>
        {images.error && (
          <div role="alert">
            Unable to load execution environments.{' '}
            <Button onPress={images.retry}>Retry</Button>
          </div>
        )}
        {entities.error && (
          <Text>
            Favorites are unavailable. Image inventory is still available.
          </Text>
        )}
        <Text aria-live="polite">{data?.length ?? 0} images loaded</Text>
        <div aria-busy={images.loading}>
          <Table
            {...table.tableProps}
            isPending={images.loading}
            columnConfig={columns}
            emptyState={
              <EmptyState
                title={
                  data?.length
                    ? 'No images match your filters'
                    : 'No execution environments discovered'
                }
                description={
                  data?.length
                    ? 'Change your search or turn off Favorites only.'
                    : 'Images appear after configured registries are reconciled.'
                }
              />
            }
          />
        </div>
      </Flex>
    </Container>
  );
}
