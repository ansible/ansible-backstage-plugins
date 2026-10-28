import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Container,
  Flex,
  Select,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@backstage/ui';
import { automationContentApiRef } from '../../api';
import { collectionsRouteRef, eeRouteRef } from '../../routes';
import { EmptyState, PageHeaderSection } from '../common';
import { BreadcrumbsNavigation } from '../common/BreadcrumbsNavigation';
import { ContentItemsTable } from '../ExecutionEnvironments/ContentItemsTable';
import { ContentItemDocumentation } from '../ContentItemDocumentation';
import { collectionHref, groupCollections } from './collectionHelpers';
import { CollectionMetadata } from './CollectionMetadata';

/** Collection versions and artifact relationships, with shared ansible-doc rendering. */
export function CollectionDetailsPage() {
  const { namespace = '', name = '' } = useParams<{
    namespace: string;
    name: string;
  }>();
  const fqcn = `${namespace}.${name}`;
  const api = useApi(automationContentApiRef);
  const base = useRouteRef(collectionsRouteRef)();
  const environmentBase = useRouteRef(eeRouteRef)();
  const [params, setParams] = useSearchParams();
  const result = useAsyncRetry(() => api.listCollections(), [api, fqcn]);
  const group = groupCollections(result.value ?? []).find(g => g.fqcn === fqcn);
  const version =
    group?.versions.find(v => v.version === params.get('version')) ??
    group?.versions[0];
  const selected = ['about', 'content', 'environments'].includes(
    params.get('tab') ?? '',
  )
    ? params.get('tab')!
    : 'about';
  const href = collectionHref(base, namespace, name);
  const item = params.get('item');
  const scope = params.get('in') ?? undefined;
  if (item)
    return (
      <Container>
        <Flex direction="column" gap="4">
          <BreadcrumbsNavigation
            items={[
              { label: 'Collections', href: base },
              { label: fqcn, href: `${href}?tab=content` },
              { label: item },
            ]}
          />
          <ContentItemDocumentation
            fqcn={item}
            inArtifact={params.get('itemIn') ?? scope}
          />
        </Flex>
      </Container>
    );
  return (
    <Container>
      <Flex direction="column" gap="4">
        <BreadcrumbsNavigation
          items={[{ label: 'Collections', href: base }, { label: fqcn }]}
        />
        <PageHeaderSection
          title={fqcn}
          description={version?.description || 'No description available.'}
        />
        {result.loading && (
          <div aria-busy="true" aria-label="Loading collection details">
            <Skeleton width="100%" height="4rem" />
            <Skeleton width="100%" height="12rem" />
          </div>
        )}
        {result.error && (
          <div role="alert">
            Unable to load this collection.{' '}
            <Button onPress={result.retry}>Retry</Button>
          </div>
        )}
        {!result.loading && !result.error && !group && (
          <EmptyState
            title="Collection not found"
            description="This collection is not present in the indexed registries."
          />
        )}
        {group && version && (
          <>
            <Select
              label="Collection version"
              value={version.version}
              options={group.versions.map(v => ({
                id: v.version,
                label: `${v.version} — ${
                  v.providedBy.join(', ') || 'No providers reported'
                }`,
              }))}
              onChange={key => {
                const next = new URLSearchParams(params);
                next.set('version', String(key));
                setParams(next);
              }}
            />
            {params.has('version') &&
              params.get('version') !== version.version && (
                <Text>
                  The requested version is no longer indexed. Showing the latest
                  version.
                </Text>
              )}
            <Tabs
              selectedKey={selected}
              onSelectionChange={key => {
                const next = new URLSearchParams(params);
                next.set('tab', String(key));
                setParams(next);
              }}
            >
              <TabList aria-label="Collection details">
                <Tab id="about">About</Tab>
                <Tab id="content">Content</Tab>
                <Tab id="environments">Execution Environments</Tab>
              </TabList>
              <TabPanel id="about">
                <Card>
                  <CardHeader>
                    <Text as="h2" variant="title-medium">
                      About this collection
                    </Text>
                  </CardHeader>
                  <CardBody>
                    <Flex direction="column" gap="3">
                      <Text>
                        {version.description || 'No description available.'}
                      </Text>
                      <Text>Version {version.version}</Text>
                      <CollectionMetadata
                        counts={version.counts}
                        providedBy={version.providedBy}
                        environmentBase={environmentBase}
                      />
                    </Flex>
                  </CardBody>
                </Card>
              </TabPanel>
              <TabPanel id="content">
                <Text>
                  Content across all indexed versions
                  {scope ? ` in ${scope}` : ''}. Each row shows its collection
                  version.
                </Text>
                <ContentItemsTable
                  collection={fqcn}
                  inArtifact={scope}
                  itemHref={content => {
                    const next = new URLSearchParams(params);
                    next.set('tab', 'content');
                    next.set('item', content.fqcn);
                    if (content.in) next.set('itemIn', content.in);
                    return `${href}?${next}`;
                  }}
                />
              </TabPanel>
              <TabPanel id="environments">
                <Text as="h2" variant="title-medium">
                  All versions and providing execution environments
                </Text>
                {group.versions.map(v => (
                  <Card key={v.version}>
                    <CardHeader>
                      <Text as="h3" variant="title-small">
                        Version {v.version}
                      </Text>
                    </CardHeader>
                    <CardBody>
                      <CollectionMetadata
                        counts={v.counts}
                        providedBy={v.providedBy}
                        environmentBase={environmentBase}
                      />
                    </CardBody>
                  </Card>
                ))}
              </TabPanel>
            </Tabs>
          </>
        )}
      </Flex>
    </Container>
  );
}
