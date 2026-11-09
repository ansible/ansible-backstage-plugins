import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useNotifications } from '@ansible/portal-plugin-sdk';
import { syncImageWithNotifications } from './imageSyncNotifications';
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
  Card,
  CardBody,
  Cell,
  CellText,
  Checkbox,
  ColumnConfig,
  Container,
  Flex,
  Link,
  Menu,
  MenuItem,
  MenuListBox,
  MenuListBoxItem,
  MenuTrigger,
  SearchField,
  Table,
  Text,
  useTable,
  type SortDescriptor,
} from '@backstage/ui';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { automationContentApiRef, type ExecutionEnvironment } from '../../api';
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
import catalogStyles from './ImagesCatalogPage.module.css';
import { useNavigate } from 'react-router-dom';
import { VerificationWarning } from './VerificationWarning';

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

/** Registry inventory with server-side search and optional catalog-owned stars. */
export function ImagesCatalogPage({
  showHeader = true,
  wrapInContainer = true,
}: {
  showHeader?: boolean;
  wrapInContainer?: boolean;
}): ReactElement {
  const api = useApi(automationContentApiRef);
  const { showNotification } = useNotifications();
  const catalog = useApi(catalogApiRef);
  const navigate = useNavigate();
  const { allowed: canSync } = usePermission({
    permission: automationContentSyncPermission,
  });
  const base = useRouteRef(eeRouteRef)();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const [starredOnly, setStarredOnly] = useState(false);
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [allTypes, setAllTypes] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);
  const [perPage, setPerPage] = useState(10);
  const [sort, setSort] = useState<SortDescriptor | null>(null);
  const sortKeys = {
    image: 'repository',
    source: 'registry',
    sourceType: 'sourceType',
    'last-synced': 'lastReconciledAt',
  } as const;
  const sortKey = sort
    ? sortKeys[sort.column as keyof typeof sortKeys]
    : undefined;
  const [syncingRefs, setSyncingRefs] = useState<Set<string>>(new Set());
  const inFlightRefs = useRef(new Set<string>());
  const [controllerImage, setControllerImage] =
    useState<ExecutionEnvironment | null>(null);
  const images = useAsyncRetry(
    () =>
      api.listExecutionEnvironments({
        allTypes,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        page,
        perPage,
        ...(sortKey && sort
          ? {
              sort: sortKey,
              order: sort.direction === 'ascending' ? 'asc' : 'desc',
            }
          : {}),
      }),
    [api, allTypes, debouncedSearch, page, perPage, sortKey, sort?.direction],
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

  const table = useTable<ImageRow, { starredOnly: boolean }>({
    mode: 'complete',
    sort,
    onSortChange: descriptor => {
      setPage(1);
      setSort(descriptor);
    },
    data,
    filter: { starredOnly },
    filterFn: (rows, filters) =>
      rows.filter(row => {
        if (filters.starredOnly) {
          const entity = entityByImageRef.get(row.ref);
          if (!entity || !isStarredEntity(entity)) return false;
        }
        return true;
      }),
    // Favorites still filter the fetched page; search is server-authoritative.
    paginationOptions: { type: 'none' },
  });

  const visibleImages = useMemo(() => {
    return (data ?? []).filter(row => {
      if (starredOnly) {
        const entity = entityByImageRef.get(row.ref);
        if (!entity || !isStarredEntity(entity)) return false;
      }
      return true;
    });
  }, [data, entityByImageRef, isStarredEntity, starredOnly]);

  const syncArtifact = async (ref: string): Promise<void> => {
    if (!canSync || inFlightRefs.current.has(ref)) return;
    inFlightRefs.current.add(ref);
    setSyncingRefs(new Set(inFlightRefs.current));
    try {
      const result = await syncImageWithNotifications(
        api,
        ref,
        data?.find(row => row.ref === ref)?.repository ?? ref,
        showNotification,
      );
      if (result.status === 'failed') return;
      images.retry();
    } catch {
      // Outcome feedback is emitted as notifications by
      // syncImageWithNotifications; nothing further to report here.
    } finally {
      inFlightRefs.current.delete(ref);
      setSyncingRefs(new Set(inFlightRefs.current));
    }
  };

  const columns: ColumnConfig<ImageRow>[] = [
    {
      id: 'image',
      label: 'Image',
      isSortable: true,
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
      isSortable: true,
      cell: row => (
        <CellText
          title={row.registry ? displayRegistryName(row.registry) : '—'}
        />
      ),
    },
    {
      id: 'sourceType',
      label: 'Source type',
      isSortable: true,
      cell: row => {
        const source = imageSourceLabel(row.registry, row.definitionEntityRef);
        return (
          <Cell>
            <Flex direction="column" align="start" gap="1">
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
      isSortable: true,
      cell: row => (
        <Cell>
          <Flex align="center" gap="2" className={styles.wrapFlex}>
            <Text title={relativeTime(row.lastReconciledAt)}>
              {relativeTime(row.lastReconciledAt)}
            </Text>
            <VerificationWarning image={row} />
          </Flex>
        </Cell>
      ),
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

  const emptyState = (
    <EmptyState
      title={
        data?.length || debouncedSearch || starredOnly
          ? 'No images match your search or filters'
          : 'No execution environments discovered'
      }
      description={
        data?.length || debouncedSearch || starredOnly
          ? 'Change your search or filters.'
          : 'Images appear after configured registries are reconciled.'
      }
      action={
        data?.length || debouncedSearch || starredOnly ? (
          <Button
            variant="secondary"
            onPress={() => {
              setSearch('');
              setStarredOnly(false);
            }}
          >
            Clear search and filters
          </Button>
        ) : undefined
      }
    />
  );

  const content = (
    <Flex direction="column" gap="4">
      {showHeader && (
        <PageHeaderSection
          title="Images"
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
            value={search}
            onChange={setSearch}
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
            <MenuTrigger isOpen={viewMenuOpen} onOpenChange={setViewMenuOpen}>
              <ButtonIcon
                size="medium"
                variant="tertiary"
                aria-label={`View: ${view === 'table' ? 'Table' : 'Card'}`}
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    {view === 'table' ? (
                      <>
                        <rect x="3" y="4" width="18" height="16" rx="1" />
                        <path d="M3 9h18M3 14h18M9 4v16" />
                      </>
                    ) : (
                      <>
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                      </>
                    )}
                  </svg>
                }
              />
              <MenuListBox
                aria-label="Image view"
                selectionMode="single"
                disallowEmptySelection
                placement="bottom end"
                selectedKeys={new Set([view])}
                onSelectionChange={keys => {
                  if (keys !== 'all') {
                    const selected = [...keys][0];
                    if (selected === 'table' || selected === 'grid') {
                      setView(selected);
                      setViewMenuOpen(false);
                    }
                  }
                }}
              >
                <MenuListBoxItem id="table">Table view</MenuListBoxItem>
                <MenuListBoxItem id="grid">Card view</MenuListBoxItem>
              </MenuListBox>
            </MenuTrigger>
          </Flex>
        </Flex>
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
        <div aria-busy={images.loading} className={styles.table}>
          {!images.error &&
            view === 'table' &&
            (!images.loading && !visibleImages.length ? (
              emptyState
            ) : (
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
                emptyState={emptyState}
              />
            ))}
          {!images.error && view === 'grid' && (
            <>
              {visibleImages.length > 0 && (
                <div className={catalogStyles.imageGrid}>
                  {visibleImages.map(image => {
                    const entity = entityByImageRef.get(image.ref);
                    const starred = entity ? isStarredEntity(entity) : false;
                    const detailHref = environmentHref(base, image.ref);
                    return (
                      <div
                        key={image.ref}
                        className={catalogStyles.cardLink}
                        role="link"
                        tabIndex={0}
                        aria-label={`View ${image.repository} details`}
                        onClick={() => navigate(detailHref)}
                        onKeyDown={event => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === 'Enter' || event.key === ' ')
                          ) {
                            event.preventDefault();
                            navigate(detailHref);
                          }
                        }}
                      >
                        <Card className={catalogStyles.imageCard}>
                          <CardBody>
                            <Flex direction="column" gap="3">
                              <Flex
                                align="start"
                                justify="between"
                                gap="2"
                                className={styles.wrapFlex}
                              >
                                <Link
                                  href={detailHref}
                                  color="info"
                                  className={styles.infoLink}
                                  onClick={event => event.stopPropagation()}
                                >
                                  {image.repository}
                                </Link>
                                <Flex
                                  align="center"
                                  gap="1"
                                  onClick={event => event.stopPropagation()}
                                  onKeyDown={event => event.stopPropagation()}
                                >
                                  {entity && (
                                    <ButtonIcon
                                      variant="tertiary"
                                      icon={
                                        starred ? (
                                          <StarIcon />
                                        ) : (
                                          <StarBorderIcon />
                                        )
                                      }
                                      aria-pressed={starred}
                                      aria-label={`${
                                        starred ? 'Remove' : 'Add'
                                      } ${image.repository} ${
                                        starred ? 'from' : 'to'
                                      } favorites`}
                                      onPress={() =>
                                        toggleStarredEntity(entity)
                                      }
                                    />
                                  )}
                                  <MenuTrigger>
                                    <ButtonIcon
                                      variant="tertiary"
                                      icon={<MoreVertIcon />}
                                      aria-label={`Actions for ${image.repository}`}
                                    />
                                    <Menu>
                                      <MenuItem
                                        onAction={() =>
                                          setControllerImage(image)
                                        }
                                      >
                                        Use in Controller
                                      </MenuItem>
                                      {canSync && (
                                        <MenuItem
                                          isDisabled={syncingRefs.has(
                                            image.ref,
                                          )}
                                          onAction={() => {
                                            void syncArtifact(image.ref);
                                          }}
                                        >
                                          {syncingRefs.has(image.ref)
                                            ? 'Syncing…'
                                            : 'Sync'}
                                        </MenuItem>
                                      )}
                                    </Menu>
                                  </MenuTrigger>
                                </Flex>
                              </Flex>
                              <Flex
                                align="center"
                                justify="between"
                                gap="2"
                                className={styles.wrapFlex}
                              >
                                <Text color="secondary">
                                  {image.registry
                                    ? displayRegistryName(image.registry)
                                    : '—'}
                                </Text>
                                <StatusBadge
                                  tone={syncStatusTone(
                                    syncStateLabel(
                                      image.lastReconciledAt,
                                      image.lastReconcileOk,
                                    ),
                                  )}
                                  size="small"
                                  variant="outline"
                                  icon={syncStatusIcon(
                                    syncStateLabel(
                                      image.lastReconciledAt,
                                      image.lastReconcileOk,
                                    ),
                                  )}
                                >
                                  {syncStateLabel(
                                    image.lastReconciledAt,
                                    image.lastReconcileOk,
                                  )}
                                </StatusBadge>
                              </Flex>
                              <Text color="secondary">
                                {imageSourceLabel(
                                  image.registry,
                                  image.definitionEntityRef,
                                )}
                              </Text>
                              <div className={catalogStyles.cardSection}>
                                <Text variant="body-medium" weight="bold">
                                  Tags
                                </Text>
                                <Text color="secondary">
                                  {image.tags.length
                                    ? image.tags.join(', ')
                                    : 'Untagged'}
                                </Text>
                              </div>
                              <div className={catalogStyles.cardSection}>
                                <Text variant="body-medium" weight="bold">
                                  Contents
                                </Text>
                                <Text color="secondary">
                                  {imageContentsSummary(image)}
                                </Text>
                              </div>
                              <Flex
                                align="center"
                                justify="between"
                                gap="2"
                                className={styles.wrapFlex}
                              >
                                <Text color="secondary">
                                  Last synced:{' '}
                                  {relativeTime(image.lastReconciledAt)}
                                </Text>
                                <VerificationWarning image={image} />
                              </Flex>
                            </Flex>
                          </CardBody>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
              {!visibleImages.length && !images.loading && emptyState}
              {visibleImages.length > 0 && !!images.value?.totalItems && (
                <Flex
                  align="center"
                  justify="between"
                  gap="2"
                  className={catalogStyles.gridPagination}
                >
                  <Text color="secondary">
                    {`${(page - 1) * perPage + 1}–${Math.min(
                      page * perPage,
                      images.value.totalItems,
                    )} of ${images.value.totalItems}`}
                  </Text>
                  <Flex gap="2">
                    <Button
                      variant="secondary"
                      isDisabled={images.loading || page <= 1}
                      onPress={() => setPage(current => current - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      isDisabled={
                        images.loading ||
                        page * perPage >= images.value.totalItems
                      }
                      onPress={() => setPage(current => current + 1)}
                    >
                      Next
                    </Button>
                  </Flex>
                </Flex>
              )}
            </>
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
