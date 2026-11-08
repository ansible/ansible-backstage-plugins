import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useApi } from '@backstage/core-plugin-api';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@backstage/ui';
import { automationContentApiRef, ContentApiError } from '../../api';
import { PageHeaderSection } from '../common';
import { OptionTree } from './OptionTree';
import styles from './documentation.module.css';

function lines(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/** Shared ansible-doc view. Pass the artifact ref to preserve version-specific documentation. */
export function ContentItemDocumentation({
  fqcn,
  inArtifact,
}: {
  fqcn: string;
  inArtifact?: string;
}) {
  return (
    <ContentItemDocumentationContent
      key={JSON.stringify([fqcn, inArtifact])}
      fqcn={fqcn}
      inArtifact={inArtifact}
    />
  );
}

function ContentItemDocumentationContent({
  fqcn,
  inArtifact,
}: {
  fqcn: string;
  inArtifact?: string;
}) {
  const api = useApi(automationContentApiRef);
  const [params, setParams] = useSearchParams();
  const result = useAsyncRetry(
    () => api.getContentItem(fqcn, inArtifact),
    [api, fqcn, inArtifact],
  );
  const doc = result.loading ? undefined : result.value;
  const noteLines = lines(doc?.notes);
  const optionEntries = Object.entries(doc?.options ?? {});
  const returnEntries = Object.entries(doc?.returns ?? {});
  const tabs = [
    { id: 'overview', label: 'Overview' },
    ...(noteLines.length ? [{ id: 'notes', label: 'Notes' }] : []),
    ...(optionEntries.length ? [{ id: 'arguments', label: 'Arguments' }] : []),
    ...(doc?.examples ? [{ id: 'examples', label: 'Examples' }] : []),
    ...(returnEntries.length
      ? [{ id: 'returns', label: 'Return values' }]
      : []),
  ];
  const selectedTab =
    tabs.find(tab => tab.id === params.get('tab'))?.id ?? 'overview';

  return (
    <Flex direction="column" gap="4">
      <PageHeaderSection title={fqcn} description={doc?.shortDescription} />
      {doc?.in && (
        <Text color="secondary" className={styles.wrap}>
          Documentation from {doc.in}
        </Text>
      )}
      {result.loading && (
        <div aria-busy="true" aria-label="Loading documentation">
          <Text role="status">Loading documentation…</Text>
          <div aria-hidden="true">
            <Skeleton width="100%" height="6rem" />
            <Skeleton width="100%" height="12rem" />
          </div>
        </div>
      )}
      {result.error && (
        <div role="alert">
          {result.error instanceof ContentApiError &&
          result.error.status === 404
            ? 'Documentation was not found for this content item in the selected artifact.'
            : 'Unable to load documentation for this content item.'}{' '}
          <Button onPress={result.retry}>Retry</Button>
        </div>
      )}
      {doc && (
        <Tabs
          selectedKey={selectedTab}
          onSelectionChange={key => {
            const next = new URLSearchParams(params);
            next.set('tab', String(key));
            setParams(next);
          }}
        >
          <TabList aria-label={`${fqcn} documentation`}>
            {tabs.map(tab => (
              <Tab key={tab.id} id={tab.id}>
                {tab.label}
              </Tab>
            ))}
          </TabList>
          <TabPanel id="overview">
            <Card>
              <CardHeader>
                <Text variant="title-medium" as="h2">
                  Description
                </Text>
              </CardHeader>
              <CardBody>
                <Flex direction="column" gap="3">
                  <Text>
                    {doc.type} · {doc.collection} {doc.collectionVersion}
                    {doc.versionAdded ? ` · Added ${doc.versionAdded}` : ''}
                    {doc.deprecated ? ' · Deprecated' : ''}
                  </Text>
                  <Text>
                    Inventory: {doc.enumeration.status} ·{' '}
                    {doc.enumeration.source}
                    {doc.enumeration.ansibleCore
                      ? ` · ansible-core ${doc.enumeration.ansibleCore}`
                      : ''}
                  </Text>
                  {lines(doc.description).map((line, index) => (
                    <Text as="p" key={index}>
                      {line}
                    </Text>
                  ))}
                  {lines(doc.author).length > 0 && (
                    <Text>Authors: {lines(doc.author).join(', ')}</Text>
                  )}
                  {lines(doc.providedBy).length > 0 && (
                    <Text className={styles.wrap}>
                      Available in: {lines(doc.providedBy).join(', ')}
                    </Text>
                  )}
                </Flex>
              </CardBody>
            </Card>
          </TabPanel>
          {noteLines.length > 0 && (
            <TabPanel id="notes">
              <Card>
                <CardHeader>
                  <Text variant="title-medium" as="h2">
                    Notes
                  </Text>
                </CardHeader>
                <CardBody>
                  {noteLines.map((line, index) => (
                    <Text as="p" key={index}>
                      {line}
                    </Text>
                  ))}
                </CardBody>
              </Card>
            </TabPanel>
          )}
          {optionEntries.length > 0 && (
            <TabPanel id="arguments">
              <Card>
                <CardHeader>
                  <Text variant="title-medium" as="h2">
                    Arguments
                  </Text>
                </CardHeader>
                <CardBody>
                  {optionEntries.map(([name, spec]) => (
                    <OptionTree key={name} name={name} spec={spec} />
                  ))}
                </CardBody>
              </Card>
            </TabPanel>
          )}
          {doc.examples && (
            <TabPanel id="examples">
              <Card>
                <CardHeader>
                  <Text variant="title-medium" as="h2">
                    Examples
                  </Text>
                </CardHeader>
                <CardBody>
                  <pre className={styles.code}>{doc.examples}</pre>
                </CardBody>
              </Card>
            </TabPanel>
          )}
          {returnEntries.length > 0 && (
            <TabPanel id="returns">
              <Card>
                <CardHeader>
                  <Text variant="title-medium" as="h2">
                    Return values
                  </Text>
                </CardHeader>
                <CardBody>
                  <pre className={styles.code}>
                    {JSON.stringify(doc.returns, null, 2)}
                  </pre>
                </CardBody>
              </Card>
            </TabPanel>
          )}
        </Tabs>
      )}
    </Flex>
  );
}
