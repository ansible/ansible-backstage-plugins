import { useCallback, useMemo, useState, type ReactNode } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import useInterval from 'react-use/lib/useInterval';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import { useApi, useTranslationRef } from '@backstage/frontend-plugin-api';
import {
  catalogApiRef,
  useEntityRefLink,
} from '@backstage/plugin-catalog-react';
import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonIcon,
  Card,
  CardBody,
  Cell,
  CellText,
  Flex,
  Grid,
  Link,
  Select,
  Tab,
  TabList,
  TabPanel,
  Table,
  Tabs,
  Text,
  useTable,
  type ColumnConfig,
} from '@backstage/ui';
import { RiFileCopyLine } from '@remixicon/react';
import {
  EE_REPOSITORY_ANNOTATIONS,
  type EERepositoryDetails,
} from '@ansible/automation-content-common/eeRepository';
import {
  automationContentApiRef,
  ContentApiError,
  type ArtifactContents,
  type ExecutionEnvironment,
} from '../../api';
import { eeTranslationRef } from '../../strings/en';
import { SigningEvidence } from './SigningEvidence';
import { SyncAction } from './SyncAction';
import { useEESelection } from './useEESelection';
import { timeSince } from './timeSince';

const referenceWrap = { overflowWrap: 'anywhere' } as const;

export function EEImageDetails({ entity }: { entity: Entity }): JSX.Element {
  const annotations = entity.metadata.annotations;
  const registry = annotations?.[EE_REPOSITORY_ANNOTATIONS.registry];
  const repository = annotations?.[EE_REPOSITORY_ANNOTATIONS.repository];
  const { t } = useTranslationRef(eeTranslationRef);
  if (!registry || !repository)
    return <Text>{t('detail.repositoryMissing')}</Text>;
  return (
    <RepositoryDetails
      key={stringifyEntityRef(entity)}
      registry={registry}
      repository={repository}
      description={entity.metadata.description}
    />
  );
}

function RepositoryDetails({
  registry,
  repository,
  description,
}: {
  registry: string;
  repository: string;
  description?: string;
}): JSX.Element {
  const api = useApi(automationContentApiRef);
  const { t } = useTranslationRef(eeTranslationRef);
  const detail = useAsyncRetry(
    () => api.getEERepository(registry, repository),
    [api, registry, repository],
  );
  const selection = useEESelection(detail.value);
  const selected = selection.selected;
  const [refresh, setRefresh] = useState(0);
  const retryRepository = detail.retry;
  const reload = useCallback(() => {
    retryRepository();
    setRefresh(value => value + 1);
  }, [retryRepository]);

  let content: JSX.Element;
  if (detail.loading && !detail.value) {
    content = <Text role="status">{t('detail.loading')}</Text>;
  } else if (detail.error) {
    content = (
      <Alert
        status="warning"
        title={t(
          detail.error instanceof ContentApiError && detail.error.status === 404
            ? 'detail.repositoryMissing'
            : 'detail.artifactFailed',
        )}
        customActions={
          <Button variant="tertiary" onPress={reload}>
            {t('retry')}
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        <Flex
          align={{ initial: 'start', sm: 'end' }}
          direction={{ initial: 'column', sm: 'row' }}
          justify={description ? 'between' : 'end'}
          gap="3"
        >
          {description && <Text color="secondary">{description}</Text>}
          <Flex
            align={{ initial: 'start', sm: 'end' }}
            direction={{ initial: 'column', sm: 'row' }}
            gap="3"
          >
            <Select
              label={t('detail.tag')}
              options={selection.options.map(option => ({
                id: option.id,
                label: option.tag ?? option.digest,
              }))}
              selectedKey={selected?.id ?? null}
              onSelectionChange={key => {
                if (typeof key === 'string') selection.select(key);
              }}
            />
            <SyncAction
              repository={{ registry, repository }}
              onReload={reload}
            />
          </Flex>
        </Flex>
        {selection.unavailable || !selected ? (
          <Alert status="warning" title={t('detail.selectedUnavailable')} />
        ) : (
          <DigestDetails
            key={selected.artifactRef}
            selected={selected}
            repository={detail.value}
            refresh={refresh}
            section={selection.section}
            selectSection={selection.selectSection}
          />
        )}
      </>
    );
  }

  return (
    <Flex direction="column" gap="4" role="region" aria-label={t('detail.tab')}>
      {content}
    </Flex>
  );
}

function DigestDetails({
  selected,
  repository,
  refresh,
  section,
  selectSection,
}: {
  selected: NonNullable<ReturnType<typeof useEESelection>['selected']>;
  repository?: EERepositoryDetails;
  refresh: number;
  section: 'overview' | 'contents';
  selectSection: (section: 'overview' | 'contents') => void;
}): JSX.Element {
  const { artifactRef } = selected;
  const api = useApi(automationContentApiRef);
  const { t } = useTranslationRef(eeTranslationRef);
  const detail = useAsyncRetry(
    () => api.getEEArtifact(artifactRef),
    [api, artifactRef, refresh],
  );
  const inventory = useAsyncRetry(
    () => api.getEEArtifactContents(artifactRef),
    [api, artifactRef, refresh],
  );
  const [now, setNow] = useState(Date.now);
  useInterval(() => setNow(Date.now()), 15_000);
  if (detail.loading && !detail.value)
    return <Text role="status">{t('detail.artifactLoading')}</Text>;
  if (detail.error || !detail.value) {
    return (
      <Alert
        status="danger"
        title={t('detail.artifactFailed')}
        customActions={
          <Button variant="tertiary" onPress={detail.retry}>
            {t('retry')}
          </Button>
        }
      />
    );
  }
  const artifact = detail.value;
  const contents = inventory.error ? undefined : inventory.value;
  const pullReference = selected.taggedPullReference ?? artifact.pullReference;
  const enumeration = contents?.enumeration;
  const inventoryStatus = enumeration?.status ?? 'unknown';
  const unavailable = t('unknown');
  function timestamp(value?: string): ReactNode {
    if (!value || !Number.isFinite(Date.parse(value))) return unavailable;
    return (
      <time dateTime={value} title={new Date(value).toLocaleString()}>
        {timeSince(value, now, t('inventory.justNow'))}
      </time>
    );
  }
  const lastSync = repository?.lastSuccessfulReconcileAt;
  let status: string = t('inventory.notReconciled');
  if (repository?.stale) status = t('inventory.stale');
  else if (lastSync) status = t('inventory.available');
  const collectionCount = contents?.collections.length ?? 0;
  const knownContents =
    collectionCount === 1
      ? t('inventory.oneCollection')
      : t('inventory.collectionCount', { quantity: String(collectionCount) });
  const pluginCount = artifact.counts?.plugins;
  const facts: Array<[string, ReactNode]> = [
    [t('inventory.image'), <Box style={referenceWrap}>{pullReference}</Box>],
    [
      t('detail.tag'),
      <Flex gap="2" align="center">
        {selected.tag ?? t('detail.digest')}
        {selected.tag === 'latest' && <Badge>{t('detail.latest')}</Badge>}
      </Flex>,
    ],
    [t('inventory.status'), status],
    [
      t('detail.modified'),
      selected.lastModified &&
      Number.isFinite(Date.parse(selected.lastModified))
        ? new Date(selected.lastModified).toLocaleDateString()
        : unavailable,
    ],
    [t('detail.ansibleCore'), enumeration?.ansibleCore ?? unavailable],
    [
      t('inventory.contents'),
      inventoryStatus === 'unknown' ? (
        t('inventory.contentsUnknown')
      ) : (
        <Text>
          {knownContents}
          {pluginCount !== undefined && (
            <> · {t('detail.pluginCount', { quantity: String(pluginCount) })}</>
          )}
        </Text>
      ),
    ],
    [t('detail.synchronization'), timestamp(lastSync)],
    [
      t('detail.classification'),
      artifact.classification?.type === 'execution-environment'
        ? t('detail.executionEnvironment')
        : unavailable,
    ],
    [
      t('detail.inventoryStatus'),
      t(`detail.inventoryStates.${inventoryStatus}`),
    ],
    [
      t('detail.inventorySource'),
      inventoryStatus !== 'unknown' && enumeration?.source
        ? t(`detail.inventorySources.${enumeration.source}`)
        : unavailable,
    ],
    [t('detail.extractedAt'), timestamp(enumeration?.extractedAt)],
    [t('inventory.registry'), artifact.registry],
    [t('inventory.sourceType'), t('inventory.externalRegistry')],
    [
      t('inventory.signing'),
      t(`signing.${artifact.signing?.state ?? 'undetermined'}`),
    ],
    [t('signing.evidence'), <SigningEvidence observation={artifact.signing} />],
    [
      t('detail.digest'),
      <Box as="code" minWidth="0" style={referenceWrap}>
        {artifact.digest}
      </Box>,
    ],
  ];
  let contentsPanel: JSX.Element;
  if (inventory.error) {
    contentsPanel = (
      <Alert
        status="danger"
        title={t('detail.contentsFailed')}
        customActions={
          <Button variant="tertiary" onPress={inventory.retry}>
            {t('retry')}
          </Button>
        }
      />
    );
  } else if (contents) {
    contentsPanel = (
      <ContainedCollections
        key={selected.id}
        artifact={artifact}
        contents={contents}
      />
    );
  } else {
    contentsPanel = <Text role="status">{t('detail.contentsLoading')}</Text>;
  }
  return (
    <Flex direction="column" gap="3">
      <Tabs
        selectedKey={section}
        onSelectionChange={key => {
          if (key === 'overview' || key === 'contents') selectSection(key);
        }}
      >
        <TabList aria-label={t('detail.sections')}>
          <Tab id="overview">{t('detail.overview')}</Tab>
          <Tab id="contents">{t('detail.contents')}</Tab>
        </TabList>
        <TabPanel id="overview">
          <Card>
            <CardBody>
              <Flex direction="column" gap="4">
                <Grid.Root columns={{ initial: '1', md: '2' }} gap="4">
                  {facts.map(([label, value]) => (
                    <Grid.Item key={label}>
                      <Box as="dl" m="0">
                        <Box as="dt">
                          <Text variant="body-small" weight="bold">
                            {label}
                          </Text>
                        </Box>
                        <Box as="dd" m="0">
                          {value}
                        </Box>
                      </Box>
                    </Grid.Item>
                  ))}
                </Grid.Root>
                <CopyPullReference
                  key={pullReference}
                  pullReference={pullReference}
                />
              </Flex>
            </CardBody>
          </Card>
        </TabPanel>
        <TabPanel id="contents">{contentsPanel}</TabPanel>
      </Tabs>
    </Flex>
  );
}

function CopyPullReference({
  pullReference,
}: {
  pullReference: string;
}): JSX.Element {
  const { t } = useTranslationRef(eeTranslationRef);
  const [copied, setCopied] = useState<boolean>();
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(pullReference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Flex direction="column" align="start" gap="1">
      <Text weight="bold">{t('detail.pullReference')}</Text>
      <Flex gap="2" align="center">
        <Box as="code" minWidth="0" style={referenceWrap}>
          {pullReference}
        </Box>
        <ButtonIcon
          variant="tertiary"
          size="small"
          aria-label={t('detail.copy')}
          icon={<RiFileCopyLine />}
          onPress={() => {
            void copy();
          }}
        />
      </Flex>
      <Text role="status">
        {copied !== undefined &&
          t(copied ? 'detail.copied' : 'detail.copyFailed')}
      </Text>
    </Flex>
  );
}

type CollectionRow = ArtifactContents['collections'][number] & { id: string };
const DIGEST_ANNOTATION = 'ansible.com/digest';
const COLLECTION_ANNOTATION = 'ansible.com/collection';
const VERSION_ANNOTATION = 'ansible.com/version';

function ContainedCollections({
  artifact,
  contents,
}: {
  artifact: ExecutionEnvironment;
  contents: ArtifactContents;
}): JSX.Element {
  const catalog = useApi(catalogApiRef);
  const entityLink = useEntityRefLink();
  const { t } = useTranslationRef(eeTranslationRef);
  const linked = useAsyncRetry(async () => {
    if (!contents.collections.length) return new Map<string, string>();
    const digestEntities = await catalog.getEntities({
      filter: {
        kind: 'Component',
        'spec.type': 'execution-environment',
        [`metadata.annotations.${EE_REPOSITORY_ANNOTATIONS.registry}`]:
          artifact.registry,
        [`metadata.annotations.${EE_REPOSITORY_ANNOTATIONS.repository}`]:
          artifact.repository,
        [`metadata.annotations.${DIGEST_ANNOTATION}`]: artifact.digest,
      },
    });
    const entityRefs = Array.from(
      new Set(
        digestEntities.items.flatMap(entity =>
          (entity.relations ?? [])
            .filter(relation => relation.type === 'dependsOn')
            .map(relation => relation.targetRef),
        ),
      ),
    );
    if (entityRefs.length === 0) return new Map<string, string>();
    const matches = await catalog.getEntitiesByRefs({ entityRefs });
    const links = new Map<string, string>();
    for (const entity of matches.items) {
      const fqcn = entity?.metadata.annotations?.[COLLECTION_ANNOTATION];
      const version = entity?.metadata.annotations?.[VERSION_ANNOTATION];
      if (entity?.spec?.type === 'ansible-collection' && fqcn && version) {
        links.set(`${fqcn}@${version}`, stringifyEntityRef(entity));
      }
    }
    return links;
  }, [artifact, catalog, contents.collections.length]);
  const columns: ColumnConfig<CollectionRow>[] = [
    {
      id: 'collection',
      label: t('detail.collectionName'),
      isRowHeader: true,
      cell: row => {
        const ref = linked.value?.get(row.id);
        return (
          <Cell>
            {ref ? (
              <Link
                href={entityLink(ref)}
                style={{ textDecorationLine: 'underline' }}
              >
                {row.fqcn}
              </Link>
            ) : (
              <Text>{row.fqcn}</Text>
            )}
          </Cell>
        );
      },
    },
    {
      id: 'type',
      label: t('detail.contentType'),
      cell: () => <CellText title={t('detail.collectionType')} />,
    },
    {
      id: 'version',
      label: t('detail.collectionVersion'),
      cell: row => <CellText title={row.version} />,
    },
    {
      id: 'status',
      label: t('inventory.status'),
      cell: () => <CellText title={t('detail.included')} />,
    },
    {
      id: 'publisher',
      label: t('detail.publisher'),
      cell: () => <CellText title={t('unknown')} />,
    },
    {
      id: 'signing',
      label: t('inventory.signing'),
      cell: () => <CellText title={t('unknown')} />,
    },
    {
      id: 'source',
      label: t('inventory.source'),
      cell: () => <CellText title={artifact.registry} />,
    },
    {
      id: 'contents',
      label: t('inventory.contents'),
      cell: row => (
        <CellText
          title={
            row.counts.plugins === undefined
              ? t('unknown')
              : t('detail.pluginCount', {
                  quantity: String(row.counts.plugins),
                })
          }
        />
      ),
    },
  ];
  const rows = useMemo(
    () =>
      contents.collections.map(item => ({
        ...item,
        id: `${item.fqcn}@${item.version}`,
      })),
    [contents.collections],
  );
  const { tableProps } = useTable({
    mode: 'complete',
    data: rows,
    paginationOptions: { pageSize: 10, pageSizeOptions: [10, 20, 50] },
  });
  if (rows.length === 0) {
    const statusMessage = {
      complete: 'detail.emptyContents',
      partial: 'detail.partialContents',
      unknown: 'detail.unknownContents',
    } as const;
    const status = contents.enumeration?.status ?? 'unknown';
    return <Text role="status">{t(statusMessage[status])}</Text>;
  }

  return (
    <Card>
      <Table {...tableProps} columnConfig={columns} />
    </Card>
  );
}
