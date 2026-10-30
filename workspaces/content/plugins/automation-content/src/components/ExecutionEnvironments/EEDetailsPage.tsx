import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CellText,
  Container,
  Flex,
  Grid,
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
} from '../../api';
import { collectionsRouteRef, eeRouteRef, rootRouteRef } from '../../routes';
import { EmptyState, StarIcon } from '../common';
import { BreadcrumbsNavigation } from '../common/BreadcrumbsNavigation';
import { ContentItemsTable } from './ContentItemsTable';
import {
  environmentHref,
  imageContentsSummary,
  matchesEnvironment,
  relativeTime,
} from './catalogHelpers';
import styles from './details.module.css';
import { ContentItemDocumentation } from '../ContentItemDocumentation';

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

/** Artifact metadata and relationships, without definition-authoring or SCM actions. */
export function EEDetailsPage(): ReactElement {
  const { ref = '' } = useParams<{ ref: string }>();
  const api = useApi(automationContentApiRef);
  const catalog = useApi(catalogApiRef);
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  // Catalog-owned preferences are optional; they never gate artifact details.
  const entities = useAsyncRetry(
    () => catalog.getEntities({ filter: { kind: 'Component' } }),
    [catalog],
  );
  const base = useRouteRef(eeRouteRef)();
  const collectionsBase = useRouteRef(collectionsRouteRef)();
  const home = useRouteRef(rootRouteRef)();
  const [params, setParams] = useSearchParams();
  const selected = ['overview', 'collections', 'content'].includes(
    params.get('tab') ?? '',
  )
    ? params.get('tab')!
    : 'overview';
  const [copyStatus, setCopyStatus] = useState('');
  const image = useAsyncRetry(
    () => api.getExecutionEnvironment(ref),
    [api, ref],
  );
  const contents = useAsyncRetry(() => api.getContents(ref), [api, ref]);
  const data = useMemo(
    () =>
      contents.value?.collections.map(c => ({
        ...c,
        id: `${c.fqcn}:${c.version}`,
      })),
    [contents.value],
  );
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
      label: 'Collection',
      isRowHeader: true,
      cell: c => (
        <CellText
          title={c.fqcn}
          href={`${collectionsBase}/${encodeURIComponent(
            c.namespace,
          )}/${encodeURIComponent(c.name)}?${new URLSearchParams({
            in: ref,
            version: c.version,
          })}`}
        />
      ),
    },
    {
      id: 'version',
      label: 'Version',
      cell: c => <CellText title={c.version} />,
    },
    ...(
      ['plugins', 'roles', 'playbooks', 'edaPlugins', 'rulebooks'] as const
    ).map(key => ({
      id: key,
      label:
        key === 'edaPlugins'
          ? 'EDA plugins'
          : key.charAt(0).toUpperCase() + key.slice(1),
      cell: (c: CollectionRow) => {
        if (!image.value?.contentsKnown) return <CellText title="Unknown" />;
        const prefix = approximate ? 'Approximate: ' : '';
        return <CellText title={`${prefix}${c.counts[key] ?? 'Unknown'}`} />;
      },
    })),
  ];
  const value = image.value;
  const entity =
    value && entities.value?.items.find(e => matchesEnvironment(e, value));
  const metadata: Record<string, string> = value
    ? {
        Ref: value.ref,
        Registry: value.registry,
        Repository: value.repository,
        Digest: value.digest,
        Classification: value.classification
          ? `${value.classification.type} (${value.classification.confidence})`
          : 'Unknown',
        'Inventory status': value.enumeration.status,
        'Inventory source': value.enumeration.source,
        'Ansible core': value.enumeration.ansibleCore ?? 'Unknown',
        'Extracted at': value.enumeration.extractedAt ?? 'Unknown',
        'Last reconciled': relativeTime(value.lastReconciledAt),
        Contents: imageContentsSummary(value),
      }
    : {};
  const emptyCollections = collectionEmptyCopy(
    value?.contentsKnown ?? false,
    approximate,
  );
  const itemFqcn = params.get('item');
  if (itemFqcn) {
    return (
      <Container>
        <Flex direction="column" gap="4">
          <BreadcrumbsNavigation
            items={[
              { label: 'Execution environments', href: base },
              {
                label: value?.repository ?? ref,
                href: `${environmentHref(base, ref)}?tab=content`,
              },
              { label: itemFqcn },
            ]}
          />
          <ContentItemDocumentation fqcn={itemFqcn} inArtifact={ref} />
        </Flex>
      </Container>
    );
  }
  return (
    <Container>
      <Flex direction="column" gap="4">
        <BreadcrumbsNavigation
          items={[
            { label: 'Automation content', href: home },
            { label: 'Execution environments', href: base },
            { label: value?.repository ?? ref },
          ]}
        />
        <Flex align="center" gap="2">
          <Text as="h1" variant="title-medium" className={styles.wrap}>
            {value?.repository ?? 'Execution environment'}
          </Text>
          {entity && (
            <Button
              variant="tertiary"
              aria-pressed={isStarredEntity(entity)}
              aria-label={`${isStarredEntity(entity) ? 'Remove' : 'Add'} ${
                value?.repository
              } ${value?.digest} ${
                isStarredEntity(entity) ? 'from' : 'to'
              } favorites`}
              onPress={() => toggleStarredEntity(entity)}
            >
              <StarIcon selected={isStarredEntity(entity)} />
            </Button>
          )}
        </Flex>
        {entities.error && (
          <Text>
            Favorites are unavailable. Image details are still available.
          </Text>
        )}
        {image.loading && (
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
              <Tab id="collections">Collections in this image</Tab>
              <Tab id="content">Content items</Tab>
            </TabList>
            <TabPanel id="overview">
              <Card>
                <CardHeader>
                  <Text as="h2" variant="title-medium">
                    About this image
                  </Text>
                </CardHeader>
                <CardBody>
                  <Flex direction="column" gap="4">
                    {!value.contentsKnown && (
                      <Text>
                        Contents unknown — this does not mean the image contains
                        nothing.
                      </Text>
                    )}
                    <Grid.Root columns={{ initial: '1', md: '2' }} gap="3">
                      {Object.entries(metadata).map(([label, text]) => (
                        <div key={label}>
                          <Text
                            weight="bold"
                            color="secondary"
                            variant="body-x-small"
                          >
                            {label}
                          </Text>
                          <Text as="p" className={styles.wrap}>
                            {text}
                          </Text>
                        </div>
                      ))}
                    </Grid.Root>
                    <Flex direction="column" gap="2">
                      <Text
                        weight="bold"
                        color="secondary"
                        variant="body-x-small"
                      >
                        Tags
                      </Text>
                      <Flex gap="2" className={styles.wrapFlex}>
                        {value.tags.length ? (
                          value.tags.map(tag => <Badge key={tag}>{tag}</Badge>)
                        ) : (
                          <Text>Untagged</Text>
                        )}
                      </Flex>
                    </Flex>
                    <Text as="h3" variant="title-small">
                      Pull reference
                    </Text>
                    <Text className={styles.wrap}>{value.pullReference}</Text>
                    <Button
                      variant="secondary"
                      onPress={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            value.pullReference,
                          );
                          setCopyStatus('Pull reference copied');
                        } catch {
                          setCopyStatus(
                            'Unable to copy. Select and copy the pull reference above.',
                          );
                        }
                      }}
                    >
                      Copy pull reference
                    </Button>
                    <div role="status">{copyStatus}</div>
                  </Flex>
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
              <Text>
                {contents.value?.enumeration.status ?? 'Unknown'} inventory ·{' '}
                {contents.value?.enumeration.source ?? 'Unknown source'}
              </Text>
              <div aria-busy={contents.loading} className={styles.table}>
                {!contents.error && (
                  <Table
                    {...table.tableProps}
                    isPending={contents.loading}
                    columnConfig={columns}
                    emptyState={
                      <EmptyState
                        title={emptyCollections.title}
                        description={emptyCollections.description}
                      />
                    }
                  />
                )}
              </div>
            </TabPanel>
            <TabPanel id="content">
              <ContentItemsTable
                inArtifact={ref}
                itemHref={item =>
                  `${environmentHref(base, ref)}?${new URLSearchParams({
                    tab: 'content',
                    item: item.fqcn,
                  })}`
                }
              />
            </TabPanel>
          </Tabs>
        )}
      </Flex>
    </Container>
  );
}
