import { useCallback, useState } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import { useApi, useTranslationRef } from '@backstage/frontend-plugin-api';
import {
  catalogApiRef,
  useEntityRefLink,
} from '@backstage/plugin-catalog-react';
import {
  Alert,
  Button,
  Cell,
  CellText,
  Flex,
  Link,
  Select,
  Tab,
  TabList,
  TabPanel,
  Table,
  Tabs,
  Text,
  type ColumnConfig,
} from '@backstage/ui';
import { EE_REPOSITORY_ANNOTATIONS } from '@ansible/automation-content-common/eeRepository';
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
    />
  );
}

function RepositoryDetails({
  registry,
  repository,
}: {
  registry: string;
  repository: string;
}): JSX.Element {
  const api = useApi(automationContentApiRef);
  const { t } = useTranslationRef(eeTranslationRef);
  const detail = useAsyncRetry(
    () => api.getEERepository(registry, repository),
    [api, registry, repository],
  );
  const selection = useEESelection(detail.value);
  const selected = selection.selected;
  const reload = useCallback(() => detail.retry(), [detail]);

  let content: JSX.Element;
  if (detail.loading) {
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
        {selection.unavailable || !selected ? (
          <Alert status="warning" title={t('detail.selectedUnavailable')} />
        ) : (
          <DigestDetails
            key={selected.artifactRef}
            artifactRef={selected.artifactRef}
            taggedPullReference={selected.taggedPullReference}
            section={selection.section}
            selectSection={selection.selectSection}
          />
        )}
      </>
    );
  }

  return (
    <Flex direction="column" gap="4" role="region" aria-label={t('detail.tab')}>
      <SyncAction repository={{ registry, repository }} onReload={reload} />
      {content}
    </Flex>
  );
}

function DigestDetails({
  artifactRef,
  taggedPullReference,
  section,
  selectSection,
}: {
  artifactRef: string;
  taggedPullReference?: string;
  section: 'overview' | 'contents';
  selectSection: (section: 'overview' | 'contents') => void;
}): JSX.Element {
  const api = useApi(automationContentApiRef);
  const { t } = useTranslationRef(eeTranslationRef);
  const detail = useAsyncRetry(
    () =>
      Promise.all([
        api.getEEArtifact(artifactRef),
        api.getEEArtifactContents(artifactRef),
      ]),
    [api, artifactRef],
  );
  if (detail.loading)
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
  const [artifact, contents] = detail.value;
  const pullReference = taggedPullReference ?? artifact.pullReference;
  return (
    <Flex direction="column" gap="3">
      <CopyPullReference key={pullReference} pullReference={pullReference} />
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
          <dl>
            <dt>{t('detail.digest')}</dt>
            <dd>
              <code>{artifact.digest}</code>
            </dd>
            <dt>{t('detail.ansibleCore')}</dt>
            <dd>{artifact.enumeration?.ansibleCore ?? t('unknown')}</dd>
            <dt>{t('detail.synchronization')}</dt>
            <dd>
              {artifact.lastReconciledAt
                ? new Date(artifact.lastReconciledAt).toLocaleString()
                : t('inventory.never')}
            </dd>
          </dl>
          <SigningEvidence observation={artifact.signing} />
        </TabPanel>
        <TabPanel id="contents">
          <ContainedCollections artifact={artifact} contents={contents} />
        </TabPanel>
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
      <code>{pullReference}</code>
      <Button
        variant="secondary"
        onPress={() => {
          void copy();
        }}
      >
        {t('detail.copy')}
      </Button>
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
  const status = contents.enumeration?.status ?? 'unknown';
  const statusMessage = {
    complete:
      contents.collections.length > 0
        ? 'detail.completeContents'
        : 'detail.emptyContents',
    partial: 'detail.partialContents',
    unknown: 'detail.unknownContents',
  } as const;
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
              <Link href={entityLink(ref)}>{row.fqcn}</Link>
            ) : (
              <Text>{row.fqcn}</Text>
            )}
          </Cell>
        );
      },
    },
    {
      id: 'version',
      label: t('detail.collectionVersion'),
      cell: row => <CellText title={row.version} />,
    },
  ];
  return (
    <Flex direction="column" gap="2">
      <Text as="h3" weight="bold">
        {t('detail.collections')}
      </Text>
      <Text role="status">{t(statusMessage[status])}</Text>
      {linked.error && <Text>{t('detail.linksUnavailable')}</Text>}
      {contents.collections.length > 0 && (
        <Table
          columnConfig={columns}
          data={contents.collections.map(item => ({
            ...item,
            id: `${item.fqcn}@${item.version}`,
          }))}
          pagination={{ type: 'none' }}
        />
      )}
    </Flex>
  );
}
