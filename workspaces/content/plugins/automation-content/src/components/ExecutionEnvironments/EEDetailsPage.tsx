import { useMemo, useState } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
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
import { automationContentApiRef, type ArtifactContents } from '../../api';
import { collectionsRouteRef, eeRouteRef, rootRouteRef } from '../../routes';
import { EmptyState, PageHeaderSection } from '../common';
import { BreadcrumbsNavigation } from '../common/BreadcrumbsNavigation';
import { ContentItemsTable } from './ContentItemsTable';
import { environmentHref } from './catalogHelpers';
import styles from './details.module.css';
import { ContentItemDocumentation } from '../ContentItemDocumentation';

type IncludedCollection = ArtifactContents['collections'][number];
interface CollectionRow extends IncludedCollection {
  id: string;
}

/** Artifact metadata and relationships, without definition-authoring or SCM actions. */
export function EEDetailsPage() {
  const { ref = '' } = useParams<{ ref: string }>();
  const api = useApi(automationContentApiRef);
  const base = useRouteRef(eeRouteRef)();
  const collectionsBase = useRouteRef(collectionsRouteRef)();
  const home = useRouteRef(rootRouteRef)();
  const [params, setParams] = useSearchParams();
  const selected = ['about', 'collections', 'content'].includes(
    params.get('tab') ?? '',
  )
    ? params.get('tab')!
    : 'about';
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
          description={c.version}
          href={`${collectionsBase}/${encodeURIComponent(
            c.namespace,
          )}/${encodeURIComponent(c.name)}?${new URLSearchParams({
            in: ref,
            version: c.version,
          })}`}
        />
      ),
    },
    ...(
      ['plugins', 'roles', 'playbooks', 'edaPlugins', 'rulebooks'] as const
    ).map(key => ({
      id: key,
      label: key === 'edaPlugins' ? 'EDA plugins' : key,
      cell: (c: CollectionRow) => (
        <CellText
          title={`${approximate ? 'Approximate: ' : ''}${
            c.counts[key] ?? 'Unknown'
          }`}
        />
      ),
    })),
  ];
  const value = image.value;
  const metadata: Record<string, string> = value
    ? {
        Ref: value.ref,
        Registry: value.registry,
        Repository: value.repository,
        Digest: value.digest,
        Tags: value.tags.join(', ') || 'Untagged',
        Classification: value.classification
          ? `${value.classification.type} (${value.classification.confidence})`
          : 'Unknown',
        'Inventory status': value.enumeration.status,
        'Inventory source': value.enumeration.source,
        'Ansible core': value.enumeration.ansibleCore ?? 'Unknown',
        'Extracted at': value.enumeration.extractedAt ?? 'Unknown',
        'Last reconciled': value.lastReconciledAt ?? 'Never',
      }
    : {};
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
        <PageHeaderSection
          title={value?.repository ?? 'Execution environment'}
        />
        {image.loading && (
          <div aria-busy="true" aria-label="Loading image details">
            <Skeleton width="100%" height="4rem" />
            <Skeleton width="100%" height="12rem" />
          </div>
        )}
        {image.error && (
          <div role="alert">
            Unable to load this execution environment.{' '}
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
              <Tab id="about">About</Tab>
              <Tab id="collections">Collections in this image</Tab>
              <Tab id="content">Content items</Tab>
            </TabList>
            <TabPanel id="about">
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
                          <Text weight="bold">{label}</Text>
                          <Text as="p" className={styles.wrap}>
                            {text}
                          </Text>
                        </div>
                      ))}
                    </Grid.Root>
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
              <div aria-busy={contents.loading}>
                <Table
                  {...table.tableProps}
                  isPending={contents.loading}
                  columnConfig={columns}
                  emptyState={
                    <EmptyState
                      title={
                        value.contentsKnown
                          ? 'No collections included'
                          : 'Image contents are unknown'
                      }
                      description={
                        value.contentsKnown
                          ? 'No collections were reported in this inventory.'
                          : 'No manifest is available; the image may still contain collections.'
                      }
                    />
                  }
                />
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
