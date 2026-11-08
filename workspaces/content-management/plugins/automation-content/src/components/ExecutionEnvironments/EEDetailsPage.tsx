import { useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '@ansible/portal-plugin-sdk';
import { syncImageWithNotifications } from './imageSyncNotifications';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  Badge,
  Button,
  ButtonIcon,
  Card,
  CardBody,
  Cell,
  CellText,
  Container,
  Flex,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
  Select,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Table,
  Tabs,
  Text,
  useTable,
  type ColumnConfig,
} from '@backstage/ui';
import {
  automationContentApiRef,
  ContentApiError,
  type ArtifactContents,
  type ContentCounts,
  type ExecutionEnvironment,
} from '../../api';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import { eeRouteRef } from '../../routes';
import { EmptyState, StatusBadge, syncStatusIcon } from '../common';
import { copyText } from '../common/clipboard';
import type { StatusBadgeTone } from '../common';
import { BreadcrumbsNavigation } from '../common/BreadcrumbsNavigation';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import {
  environmentHref,
  definitionFileHref,
  definitionFileName,
  imageContentsSummary,
  relativeTime,
  sourceLabel,
  syncStateLabel,
} from './catalogHelpers';
import styles from './details.module.css';
import { UseInControllerDialog } from './UseInControllerDialog';
import { VerificationWarning } from './VerificationWarning';

type IncludedCollection = ArtifactContents['collections'][number];
interface CollectionRow extends IncludedCollection {
  id: string;
}

function collectionEmptyCopy(
  contentsKnown: boolean,
  approximate: boolean,
): { title: string; description: string } {
  if (!contentsKnown) {
    return {
      title: 'Image contents are unknown',
      description:
        'No manifest is available; the image may still contain collections.',
    };
  }
  if (approximate) {
    return {
      title: 'No collections reported in this inventory',
      description:
        'This inventory is incomplete; the image may contain additional collections.',
    };
  }
  return {
    title: 'No collections are included in this execution environment',
    description:
      'Collections included in this image will appear here when they are available.',
  };
}

function collectionContentsSummary(
  counts: ContentCounts,
  contentsKnown: boolean,
  approximate: boolean,
): string {
  if (!contentsKnown) return 'Unknown';

  const countLabels: Array<{
    key: keyof Pick<
      ContentCounts,
      'plugins' | 'roles' | 'playbooks' | 'edaPlugins' | 'rulebooks'
    >;
    singular: string;
    plural: string;
  }> = [
    { key: 'plugins', singular: 'plugin', plural: 'plugins' },
    { key: 'roles', singular: 'role', plural: 'roles' },
    { key: 'playbooks', singular: 'playbook', plural: 'playbooks' },
    { key: 'edaPlugins', singular: 'EDA plugin', plural: 'EDA plugins' },
    { key: 'rulebooks', singular: 'rulebook', plural: 'rulebooks' },
  ];
  const reportedCounts = countLabels.flatMap(({ key, singular, plural }) => {
    const count = counts[key];
    if (count === undefined) return [];
    return [`${count} ${count === 1 ? singular : plural}`];
  });

  if (!reportedCounts.length) {
    return approximate ? 'Approximate: —' : '—';
  }
  return `${approximate ? 'Approximate: ' : ''}${reportedCounts.join(', ')}`;
}

function statusBadgeTone(status: string): StatusBadgeTone {
  if (status === 'Available') return 'success';
  if (status === 'Failed') return 'danger';
  if (status === 'Stale') return 'warning';
  return 'info';
}

function classificationLabel(type: string | undefined): string {
  if (!type) return 'Unknown';
  return type
    .replace(/[-_]+/g, ' ')
    .replace(/^\w/, first => first.toUpperCase());
}

function inventorySourceLabel(origin: string): string {
  const labels: Record<string, string> = {
    'build-time-manifest': 'Build-time manifest',
    labels: 'Registry labels',
    'blob-fetch': 'Registry blob',
    'external-introspection': 'External introspection',
  };
  return labels[origin] ?? origin;
}

function registryDisplayLabel(registry: string): string {
  if (/[./:]/.test(registry)) return registry;
  return registry.replace(
    /(^|[-_])(\w)/g,
    (_, separator, character: string) =>
      `${separator ? ' ' : ''}${character.toUpperCase()}`,
  );
}

function inventoryStatusLabel(status: string): string {
  return status.replace(/^\w/, first => first.toUpperCase());
}

function imageSourceLabel(
  registry: string,
  definitionEntityRef?: string,
): string {
  if (definitionEntityRef) return 'Definition file';
  return sourceLabel(registry);
}

function MetadataRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <>
      <dt>
        <Text variant="body-medium" color="secondary">
          {label}
        </Text>
      </dt>
      <dd className={styles.metadataValue}>
        {typeof children === 'string' || typeof children === 'number' ? (
          <Text variant="body-medium">{children}</Text>
        ) : (
          children
        )}
      </dd>
    </>
  );
}

/** Artifact metadata and relationships, without definition-authoring or SCM actions. */
export function EEDetailsPage(): ReactElement {
  return (
    // Each route-owned page provides its own main landmark; the BUI host
    // layout has none, and the old Backstage Page component's <main> was
    // lost in the migration.
    <main>
      <NotificationProvider>
        <EEDetailsContent />
      </NotificationProvider>
    </main>
  );
}

function EEDetailsContent(): ReactElement {
  const { showNotification, notifications, removeNotification } =
    useNotifications();
  const { ref = '' } = useParams<{ ref: string }>();
  const api = useApi(automationContentApiRef);
  const { allowed: canSync } = usePermission({
    permission: automationContentSyncPermission,
  });
  const catalog = useApi(catalogApiRef);
  const navigate = useNavigate();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const base = useRouteRef(eeRouteRef)();
  const [params, setParams] = useSearchParams();
  const selected = ['overview', 'collections'].includes(params.get('tab') ?? '')
    ? params.get('tab')!
    : 'overview';
  const [copyStatus, setCopyStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [controllerOpen, setControllerOpen] = useState(false);
  // Tag switches and latest-change navigation stay on the current tab. The
  // item param is dropped: it names a content item of the previous digest's
  // inventory, which the new digest need not contain.
  const hrefKeepingTab = (targetRef: string): string => {
    const kept = new URLSearchParams();
    const tab = params.get('tab');
    if (tab) kept.set('tab', tab);
    const suffix = kept.toString() ? `?${kept}` : '';
    return `${environmentHref(base, targetRef)}${suffix}`;
  };
  const image = useAsyncRetry(
    () => api.getExecutionEnvironment(ref),
    [api, ref],
  );
  // A favorite means the image — the repository — not one digest. Candidates
  // are the repository's entities across all of its digests; the details page
  // picks a stable representative so the star does not move with the tag.
  const entities = useAsyncRetry(async () => {
    const current = image.value;
    if (!current) return { items: [] };
    return catalog.getEntities({
      filter: {
        kind: 'Component',
        'metadata.annotations.ansible.com/registry': [current.registry],
        'metadata.annotations.ansible.com/repository': [current.repository],
      },
    });
  }, [catalog, image.value?.registry, image.value?.repository]);
  const contents = useAsyncRetry(() => api.getContents(ref), [api, ref]);
  // The repository's tag→digest map powers the tag selector. It is optional:
  // when it cannot be loaded the page degrades to the static tag badges.
  const tagMap = useAsyncRetry(async () => {
    if (!image.value) return undefined;
    return api.getRepositoryTags(image.value.registry, image.value.repository);
    // Keyed on the resolved ref as well: a sync that moves the default tag
    // navigates to a new digest, and the map must not keep the stale one.
  }, [api, image.value?.registry, image.value?.repository, image.value?.ref]);
  const data = useMemo(
    () =>
      contents.value?.collections.map(c => ({
        ...c,
        id: `${c.fqcn}:${c.version}`,
      })),
    [contents.value],
  );
  // Collection details are keyed by catalog entity name, not the image's FQCN.
  // The entity provider publishes the FQCN and version as annotations
  // (ansible.com/collection, ansible.com/version), not spec fields; the
  // catalog narrows candidates by FQCN and the version matches here.
  const collectionEntities = useAsyncRetry(async () => {
    const collections =
      contents.value?.collections.filter(c => c.type === 'collection') ?? [];
    if (!collections.length) return { items: [] };
    return catalog.getEntities({
      filter: [...new Set(collections.map(c => c.fqcn))].map(fqcn => ({
        kind: 'Component',
        'spec.type': 'ansible-collection',
        'metadata.annotations.ansible.com/collection': fqcn,
      })),
    });
  }, [catalog, contents.value]);
  const table = useTable<CollectionRow>({
    mode: 'complete',
    data,
    paginationOptions: { pageSize: 10, pageSizeOptions: [10, 20, 50] },
  });
  const approximate =
    !image.value?.contentsKnown ||
    contents.value?.enumeration.status !== 'complete';
  const columns: ColumnConfig<CollectionRow>[] = [
    {
      id: 'name',
      label: 'Name',
      isRowHeader: true,
      cell: c => {
        const collection =
          c.type === 'collection'
            ? collectionEntities.value?.items.find(
                entity =>
                  entity.metadata.annotations?.['ansible.com/collection'] ===
                    c.fqcn &&
                  entity.metadata.annotations?.['ansible.com/version'] ===
                    c.version,
              )
            : undefined;
        return collection ? (
          <Cell>
            <Link
              href={`/self-service/collections/${encodeURIComponent(
                collection.metadata.name,
              )}`}
              color="info"
              className={styles.infoLink}
            >
              {c.fqcn}
            </Link>
          </Cell>
        ) : (
          <CellText title={c.fqcn} />
        );
      },
    },
    {
      id: 'type',
      label: 'Type',
      cell: c => <CellText title={c.type || '—'} />,
    },
    {
      id: 'version',
      label: 'Version',
      cell: c => <CellText title={c.version} />,
    },
    {
      id: 'status',
      label: 'Status',
      cell: () => <CellText title="—" />,
    },
    {
      id: 'publisher',
      label: 'Publisher',
      cell: () => <CellText title="—" />,
    },
    {
      id: 'signing',
      label: 'Signing',
      cell: () => <CellText title="—" />,
    },
    {
      id: 'source',
      label: 'Source',
      cell: () => <CellText title="—" />,
    },
    {
      id: 'contents',
      label: 'Contents',
      cell: (c: CollectionRow) => (
        <CellText
          title={
            image.value
              ? collectionContentsSummary(
                  c.counts,
                  image.value.contentsKnown,
                  approximate,
                )
              : 'Unknown'
          }
        />
      ),
    },
  ];
  // Switching tags navigates to another digest of the same repository; keep
  // the last artifact of that repository visible while the next resolves, so
  // the page never blanks mid-swap. Navigating to a different repository
  // still shows the loading state — briefly showing the wrong image would be
  // worse than the skeleton.
  const resolved = image.value?.ref === ref ? image.value : undefined;
  const [retained, setRetained] = useState<ExecutionEnvironment>();
  useEffect(() => {
    if (resolved) setRetained(resolved);
  }, [resolved]);
  const routeRepository = ref.split('@')[0];
  const value =
    resolved ??
    (retained &&
    `${retained.registry}/${retained.repository}` === routeRepository
      ? retained
      : undefined);
  // The repository's default tag leads the list and is labelled as the
  // default; the rest sort numerically so 9.0 precedes 10.0. The selected
  // tag is the first list entry that resolves to the displayed digest.
  const orderedTags = useMemo(() => {
    const sorted = [...(tagMap.value?.tags ?? [])].sort((a, b) =>
      a.tag.localeCompare(b.tag, undefined, { numeric: true }),
    );
    const latest = sorted.find(entry => entry.tag === 'latest');
    return latest
      ? [latest, ...sorted.filter(entry => entry.tag !== 'latest')]
      : sorted;
  }, [tagMap.value]);
  const defaultTag = value
    ? orderedTags.find(entry => entry.digest === value.digest)?.tag
    : undefined;
  const status = syncStateLabel(
    value?.lastReconciledAt,
    value?.lastReconcileOk,
  );
  // The star follows the image, not the tag: prefer the default tag's entity
  // so the representative stays put across tag switches, and fall back to any
  // of the repository's entities.
  const entity = useMemo(() => {
    const items = entities.value?.items ?? [];
    const defaultDigest = orderedTags[0]?.digest;
    return (
      items.find(
        candidate =>
          (candidate.metadata.annotations ?? {})['ansible.com/digest'] ===
          defaultDigest,
      ) ?? items[0]
    );
  }, [entities.value, orderedTags]);
  const definitionHref = value?.definitionEntityRef
    ? definitionFileHref(base, value.definitionEntityRef)
    : undefined;
  const definitionName = value?.definitionEntityRef
    ? definitionFileName(value.definitionEntityRef)
    : undefined;
  const classification = classificationLabel(
    value?.classification?.type ?? value?.type,
  );
  const emptyCollections = collectionEmptyCopy(
    value?.contentsKnown ?? false,
    approximate,
  );
  const collectionsEmpty =
    !contents.loading && !contents.error && !data?.length;
  const collectionsEmptyState = (
    <EmptyState
      title={emptyCollections.title}
      description={emptyCollections.description}
    />
  );
  const syncImage = async (): Promise<void> => {
    if (!canSync || !value || syncing) return;
    setSyncing(true);
    try {
      const result = await syncImageWithNotifications(
        api,
        value.ref,
        value.repository,
        showNotification,
      );
      if (result.status === 'failed') return;
      if (result.ref !== value.ref) {
        navigate(hrefKeepingTab(result.ref), { replace: true });
        return;
      }
      image.retry();
      contents.retry();
      tagMap.retry();
    } catch {
      // Outcome feedback is emitted as notifications by
      // syncImageWithNotifications; nothing further to report here.
    } finally {
      setSyncing(false);
    }
  };
  const copyPullReference = async (): Promise<void> => {
    if (!value) return;
    if (await copyText(value.pullReference)) {
      setCopyStatus('Pull reference copied');
    } else {
      setCopyStatus(
        'Unable to copy. Select and copy the pull reference above.',
      );
    }
  };
  return (
    <Container className={styles.detailContainer}>
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
      <Flex direction="column" gap="4">
        <BreadcrumbsNavigation
          items={[
            { label: 'Execution environments', href: base },
            { label: 'Images', href: `${base}/images` },
            { label: value?.repository ?? ref },
          ]}
        />
        <Flex
          className={styles.detailHeader}
          align="center"
          justify="between"
          gap="3"
        >
          <Flex direction="column" gap="2">
            <Text
              as="h1"
              variant="title-small"
              weight="bold"
              className={styles.title}
            >
              {value?.repository ?? 'Execution environment'}
            </Text>
            {value && tagMap.value && tagMap.value.tags.length ? (
              <Flex align="center" gap="2">
                <Text color="secondary">Tags</Text>
                <Select
                  aria-label="Tags"
                  value={defaultTag}
                  options={orderedTags.map((entry, index) => ({
                    id: entry.tag,
                    label: index === 0 ? `${entry.tag} (Default)` : entry.tag,
                  }))}
                  onChange={key => {
                    const next = orderedTags.find(entry => entry.tag === key);
                    // Selecting a tag is navigating to the artifact of the
                    // digest that tag last resolved to; the whole page —
                    // overview and All Content — then shows that tag's data.
                    if (next && next.ref !== ref) {
                      navigate(hrefKeepingTab(next.ref));
                    }
                  }}
                />
              </Flex>
            ) : null}
          </Flex>
          {value && (
            <Flex align="center" gap="2">
              {entity && (
                <ButtonIcon
                  variant="tertiary"
                  icon={
                    isStarredEntity(entity) ? <StarIcon /> : <StarBorderIcon />
                  }
                  aria-pressed={isStarredEntity(entity)}
                  aria-label={`${isStarredEntity(entity) ? 'Remove' : 'Add'} ${
                    entity.metadata.name
                  } ${isStarredEntity(entity) ? 'from' : 'to'} favorites`}
                  onPress={() => toggleStarredEntity(entity)}
                />
              )}
              <MenuTrigger>
                <ButtonIcon
                  variant="tertiary"
                  icon={<MoreVertIcon />}
                  aria-label={`Actions for ${value.repository}`}
                />
                <Menu>
                  <MenuItem
                    onAction={() => {
                      setControllerOpen(true);
                    }}
                  >
                    Use in Controller
                  </MenuItem>
                  {canSync && (
                    <MenuItem
                      isDisabled={syncing}
                      onAction={() => void syncImage()}
                    >
                      {syncing ? 'Syncing…' : 'Sync'}
                    </MenuItem>
                  )}
                </Menu>
              </MenuTrigger>
            </Flex>
          )}
        </Flex>
        {entities.error && (
          <Text>
            Favorites are unavailable. Image details are still available.
          </Text>
        )}
        {image.loading && !value && (
          <div aria-busy="true" aria-label="Loading image details">
            <Text role="status">Loading image details…</Text>
            <div aria-hidden="true">
              <Skeleton width="100%" height="4rem" />
              <Skeleton width="100%" height="12rem" />
            </div>
          </div>
        )}
        {image.error && (
          <div role="alert">
            {image.error instanceof ContentApiError &&
            image.error.status === 404
              ? 'This execution environment was not found. It may no longer be indexed.'
              : 'Unable to load this execution environment.'}{' '}
            <Button onPress={image.retry}>Retry</Button>
          </div>
        )}
        {value && (
          <Tabs
            selectedKey={selected}
            onSelectionChange={key => {
              const next = new URLSearchParams(params);
              next.set('tab', String(key));
              setParams(next);
            }}
          >
            <TabList aria-label="Execution environment details">
              <Tab id="overview">Overview</Tab>
              <Tab id="collections">All Content</Tab>
            </TabList>
            <TabPanel id="overview">
              <Card className={styles.detailSurface}>
                <CardBody className={styles.detailSurfaceBody}>
                  <dl className={styles.metadataGrid}>
                    <MetadataRow label="Registry">
                      {registryDisplayLabel(value.registry)}
                    </MetadataRow>
                    <MetadataRow label="Status">
                      <StatusBadge
                        tone={statusBadgeTone(status)}
                        size="small"
                        variant="outline"
                        icon={syncStatusIcon(status)}
                      >
                        {status}
                      </StatusBadge>
                    </MetadataRow>
                    <MetadataRow label="Signing">Unknown</MetadataRow>
                    <MetadataRow label="Origin">
                      <Flex direction="column" align="start" gap="1">
                        <StatusBadge
                          tone={
                            imageSourceLabel(
                              value.registry,
                              value.definitionEntityRef,
                            ) === 'Definition file'
                              ? 'info'
                              : 'neutral'
                          }
                        >
                          {imageSourceLabel(
                            value.registry,
                            value.definitionEntityRef,
                          )}
                        </StatusBadge>
                      </Flex>
                    </MetadataRow>
                    {definitionHref && definitionName && (
                      <MetadataRow label="Definition file">
                        <Link
                          href={definitionHref}
                          color="info"
                          className={styles.infoLink}
                        >
                          {definitionName}
                        </Link>
                      </MetadataRow>
                    )}
                    <MetadataRow label="Tags">
                      <Flex gap="2" className={styles.wrapFlex}>
                        {value.tags.length ? (
                          value.tags.map(tag => <Badge key={tag}>{tag}</Badge>)
                        ) : (
                          <Text color="secondary">Untagged</Text>
                        )}
                      </Flex>
                    </MetadataRow>
                    <MetadataRow label="Digest">{value.digest}</MetadataRow>
                    <MetadataRow label="Last synchronized">
                      <Flex align="center" gap="2" className={styles.wrapFlex}>
                        <Text>{relativeTime(value.lastReconciledAt)}</Text>
                        <VerificationWarning image={value} />
                      </Flex>
                    </MetadataRow>
                    <MetadataRow label="Contents">
                      <Flex direction="column" gap="1">
                        <Text>{imageContentsSummary(value)}</Text>
                        {!value.contentsKnown && (
                          <Text color="secondary">
                            This inventory is unavailable; the image may still
                            contain content.
                          </Text>
                        )}
                      </Flex>
                    </MetadataRow>
                    <MetadataRow label="Classification">
                      {classification}
                    </MetadataRow>
                    <MetadataRow label="Inventory status">
                      {inventoryStatusLabel(value.enumeration.status)}
                    </MetadataRow>
                    <MetadataRow label="Inventory source">
                      {inventorySourceLabel(value.enumeration.source)}
                    </MetadataRow>
                    <MetadataRow label="Ansible core">
                      {value.enumeration.ansibleCore ?? 'Unknown'}
                    </MetadataRow>
                    <MetadataRow label="Extracted at">
                      {value.enumeration.extractedAt ?? 'Unknown'}
                    </MetadataRow>
                  </dl>
                  <div className={styles.pullReferenceSection}>
                    <Text as="h2" variant="body-large" weight="bold">
                      Pull reference
                    </Text>
                    <Flex
                      align="start"
                      gap="2"
                      className={styles.pullReference}
                    >
                      <code className={styles.pullReferenceCode}>
                        {value.pullReference}
                      </code>
                      <ButtonIcon
                        variant="tertiary"
                        icon={<FileCopyIcon />}
                        aria-label="Copy pull reference"
                        onPress={copyPullReference}
                      />
                    </Flex>
                    {copyStatus && <Text role="status">{copyStatus}</Text>}
                  </div>
                </CardBody>
              </Card>
            </TabPanel>
            <TabPanel id="collections">
              {contents.error && (
                <div role="alert">
                  Unable to load image collections.{' '}
                  <Button onPress={contents.retry}>Retry</Button>
                </div>
              )}
              {collectionsEmpty ? (
                collectionsEmptyState
              ) : (
                <Card className={styles.detailSurface}>
                  <CardBody className={styles.detailSurfaceBody}>
                    <div aria-busy={contents.loading} className={styles.table}>
                      {!contents.error && (
                        <Table
                          {...table.tableProps}
                          isPending={contents.loading}
                          columnConfig={columns}
                          emptyState={collectionsEmptyState}
                        />
                      )}
                    </div>
                  </CardBody>
                </Card>
              )}
            </TabPanel>
          </Tabs>
        )}
        {controllerOpen && value && (
          <UseInControllerDialog
            open
            imageName={value.repository}
            pullReference={value.pullReference}
            onClose={() => setControllerOpen(false)}
          />
        )}
      </Flex>
    </Container>
  );
}
