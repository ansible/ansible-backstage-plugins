import { useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import type { Entity } from '@backstage/catalog-model';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  Button,
  ButtonIcon,
  Cell,
  CellText,
  Checkbox,
  ColumnConfig,
  Container,
  Flex,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
  SearchField,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import {
  automationContentApiRef,
  ContentApiError,
  type ExecutionEnvironment,
} from '../../api';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import { eeRouteRef } from '../../routes';
import {
  EmptyState,
  PageHeaderSection,
  StatusBadge,
  syncStatusIcon,
} from '../common';
import type { StatusBadgeTone } from '../common';
import { UseInControllerDialog } from './UseInControllerDialog';
import {
  environmentHref,
  imageContentsSummary,
  matchesEnvironment,
  relativeTime,
  sourceLabel,
  syncStateLabel,
} from './catalogHelpers';
import styles from './details.module.css';

interface ImageRow extends ExecutionEnvironment {
  id: string;
}

function displayRegistryName(registry: string): string {
  return registry.charAt(0).toUpperCase() + registry.slice(1);
}

function syncStatusTone(status: string): StatusBadgeTone {
  if (status === 'Available') return 'success';
  if (status === 'Failed') return 'danger';
  if (status === 'Stale') return 'warning';
  return 'info';
}

function imageSourceLabel(
  registry: string,
  definitionEntityRef?: string,
): string {
  if (definitionEntityRef) return 'Definition file';
  return sourceLabel(registry);
}

/** Registry inventory with client-side search and optional catalog-owned stars. */
export function ImagesCatalogPage({
  showHeader = true,
  wrapInContainer = true,
}: {
  showHeader?: boolean;
  wrapInContainer?: boolean;
}): ReactElement {
  const api = useApi(automationContentApiRef);
  const catalog = useApi(catalogApiRef);
  const { allowed: canSync } = usePermission({
    permission: automationContentSyncPermission,
  });
  const base = useRouteRef(eeRouteRef)();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const [starredOnly, setStarredOnly] = useState(false);
  const [allTypes, setAllTypes] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [syncError, setSyncError] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [syncingRefs, setSyncingRefs] = useState<Set<string>>(new Set());
  const inFlightRefs = useRef(new Set<string>());
  const [controllerImage, setControllerImage] =
    useState<ExecutionEnvironment | null>(null);
  const images = useAsyncRetry(
    () => api.listExecutionEnvironments({ allTypes, page, perPage }),
    [api, allTypes, page, perPage],
  );
  const data = useMemo(
    () => images.value?.items.map(image => ({ ...image, id: image.ref })),
    [images.value],
  );

  // Catalog failure must never hide backend inventory. Only fetch candidates
  // for this page; annotation values are ORed within the digest filter.
  const entities = useAsyncRetry(async () => {
    if (!data?.length) return { items: [] };
    return catalog.getEntities({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/digest': [
          ...new Set(data.map(image => image.digest)),
        ],
      },
    });
  }, [catalog, data]);

  const entityByImageRef = useMemo(() => {
    const linked = new Map<string, Entity>();
    for (const image of data ?? []) {
      const entity = entities.value?.items.find(candidate =>
        matchesEnvironment(candidate, image),
      );
      if (entity) linked.set(image.ref, entity);
    }
    return linked;
  }, [data, entities.value]);

  const table = useTable<ImageRow>({
    mode: 'complete',
    data,
    filter: starredOnly,
    filterFn: (rows, only) =>
      only
        ? rows.filter(row => {
            const entity = entityByImageRef.get(row.ref);
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
    // Search and favorites filter the fetched page, not the whole inventory.
    paginationOptions: { type: 'none' },
  });

  const syncArtifact = async (ref: string): Promise<void> => {
    if (!canSync || inFlightRefs.current.has(ref)) return;
    inFlightRefs.current.add(ref);
    setSyncingRefs(new Set(inFlightRefs.current));
    setSyncError('');
    setSyncStatus('');
    try {
      const result = await api.syncArtifact(ref);
      if (result.status === 'failed') {
        setSyncError(
          result.retainedPrevious
            ? 'Sync failed. Previously indexed content is still shown.'
            : 'Unable to sync this image.',
        );
        return;
      }
      setSyncStatus(
        result.ref === ref
          ? 'Sync completed.'
          : 'Sync completed. The latest image changed and the catalog was refreshed.',
      );
      images.retry();
    } catch (error) {
      if (error instanceof ContentApiError && error.status === 403) {
        setSyncError('Sync access needed for this image.');
      } else if (error instanceof ContentApiError && error.status === 404) {
        setSyncError(
          'Latest image not found. This repository may not have a latest tag.',
        );
      } else {
        setSyncError('Unable to sync this image.');
      }
    } finally {
      inFlightRefs.current.delete(ref);
      setSyncingRefs(new Set(inFlightRefs.current));
    }
  };

  const columns: ColumnConfig<ImageRow>[] = [
    {
      id: 'image',
      label: 'Image',
      isRowHeader: true,
      cell: row => (
        <Cell>
          <Flex align="center" gap="2" className={styles.wrapFlex}>
            <Link
              href={environmentHref(base, row.ref)}
              color="info"
              className={styles.infoLink}
            >
              {row.repository}
            </Link>
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'source',
      label: 'Source',
      cell: row => {
        const source = imageSourceLabel(row.registry, row.definitionEntityRef);
        return (
          <Cell>
            <Flex direction="column" align="start" gap="1">
              {row.registry && <Text>{displayRegistryName(row.registry)}</Text>}
              <StatusBadge
                tone={source === 'Definition file' ? 'info' : 'neutral'}
              >
                {source}
              </StatusBadge>
            </Flex>
          </Cell>
        );
      },
    },
    {
      id: 'contents',
      label: 'Contents',
      cell: row => <CellText title={imageContentsSummary(row)} />,
    },
    {
      id: 'status',
      label: 'Status',
      cell: row => {
        const status = syncStateLabel(
          row.lastReconciledAt,
          row.lastReconcileOk,
        );
        return (
          <Cell>
            <StatusBadge
              tone={syncStatusTone(status)}
              size="small"
              variant="outline"
              icon={syncStatusIcon(status)}
            >
              {status}
            </StatusBadge>
          </Cell>
        );
      },
    },
    {
      id: 'last-synced',
      label: 'Last synced',
      cell: row => <CellText title={relativeTime(row.lastReconciledAt)} />,
    },
    {
      id: 'actions',
      label: 'Actions',
      cell: row => {
        const entity = entityByImageRef.get(row.ref);
        const starred = entity ? isStarredEntity(entity) : false;
        return (
          <Cell>
            <Flex align="center" gap="1">
              {entity && (
                <ButtonIcon
                  variant="tertiary"
                  icon={starred ? <StarIcon /> : <StarBorderIcon />}
                  aria-pressed={starred}
                  aria-label={`${starred ? 'Remove' : 'Add'} ${
                    row.repository
                  } ${starred ? 'from' : 'to'} favorites`}
                  onPress={() => toggleStarredEntity(entity)}
                />
              )}
              <MenuTrigger>
                <ButtonIcon
                  variant="tertiary"
                  icon={<MoreVertIcon />}
                  aria-label={`Actions for ${row.repository}`}
                />
                <Menu>
                  <MenuItem
                    onAction={() => {
                      setControllerImage(row);
                    }}
                  >
                    Use in Controller
                  </MenuItem>
                  {canSync && (
                    <MenuItem
                      isDisabled={syncingRefs.has(row.ref)}
                      onAction={() => {
                        void syncArtifact(row.ref);
                      }}
                    >
                      {syncingRefs.has(row.ref) ? 'Syncing…' : 'Sync'}
                    </MenuItem>
                  )}
                </Menu>
              </MenuTrigger>
            </Flex>
          </Cell>
        );
      },
    },
  ];

  const content = (
    <Flex direction="column" gap="4">
      {showHeader && (
        <PageHeaderSection
          title="Execution environments"
          description="Discover immutable images from configured registries and inspect their Ansible content."
        />
      )}
      <Flex direction="column" gap="3">
        <Flex
          align="center"
          justify="between"
          gap="3"
          className={styles.searchToolbar}
        >
          <SearchField
            aria-label="Search images"
            placeholder="Search images"
            value={table.search.value}
            onChange={table.search.onChange}
          />
          <Flex align="center" gap="3" className={styles.wrapFlex}>
            <Checkbox isSelected={starredOnly} onChange={setStarredOnly}>
              Favorites only
            </Checkbox>
            <Checkbox
              isSelected={allTypes}
              onChange={value => {
                setPage(1);
                setAllTypes(value);
              }}
            >
              Show all images
            </Checkbox>
          </Flex>
        </Flex>
        {syncError && <Text role="alert">{syncError}</Text>}
        {syncStatus && <Text role="status">{syncStatus}</Text>}
        <Text as="h2" variant="title-medium">
          Execution environment images
          {images.value ? ` (${images.value.totalItems})` : ''}
        </Text>
        {images.error && (
          <div role="alert">
            Unable to load execution environments.{' '}
            <Button onPress={images.retry}>Retry</Button>
          </div>
        )}
        {entities.error && (
          <Text>Catalog links are unavailable. Favorites may be missing.</Text>
        )}
        {!images.loading && !images.error && images.value && (
          <Text aria-live="polite">{data?.length ?? 0} images loaded</Text>
        )}
        <div aria-busy={images.loading} className={styles.table}>
          {!images.error && (
            <Table
              {...table.tableProps}
              pagination={{
                type: 'page',
                pageSize: perPage,
                pageSizeOptions: [10, 20, 50],
                showPageSizeOptions: true,
                onPageSizeChange: size => {
                  setPerPage(size);
                  setPage(1);
                },
                offset: ((images.value?.page ?? page) - 1) * perPage,
                totalCount: images.value?.totalItems ?? 0,
                hasNextPage:
                  !images.loading &&
                  page * perPage < (images.value?.totalItems ?? 0),
                hasPreviousPage: !images.loading && page > 1,
                onNextPage: () => setPage(current => current + 1),
                onPreviousPage: () => setPage(current => current - 1),
              }}
              isPending={images.loading}
              columnConfig={columns}
              emptyState={
                <EmptyState
                  title={
                    data?.length
                      ? 'No images match your search or filters'
                      : 'No execution environments discovered'
                  }
                  description={
                    data?.length
                      ? 'Change your search or favorites filter.'
                      : 'Images appear after configured registries are reconciled.'
                  }
                  action={
                    data?.length ? (
                      <Button
                        variant="secondary"
                        onPress={() => {
                          table.search.onChange('');
                          setStarredOnly(false);
                        }}
                      >
                        Clear search and filters
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          )}
        </div>
      </Flex>
      {controllerImage && (
        <UseInControllerDialog
          open
          imageName={controllerImage.repository}
          pullReference={controllerImage.pullReference}
          onClose={() => setControllerImage(null)}
        />
      )}
    </Flex>
  );
  return wrapInContainer ? <Container>{content}</Container> : content;
}
