import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useApi } from '@backstage/core-plugin-api';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Grid,
  Skeleton,
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
  const api = useApi(automationContentApiRef);
  const result = useAsyncRetry(
    () => api.getContentItem(fqcn, inArtifact),
    [api, fqcn, inArtifact],
  );
  const doc = result.value;
  return (
    <Flex direction="column" gap="4">
      <PageHeaderSection title={fqcn} description={doc?.shortDescription} />
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
        <>
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
                  Inventory: {doc.enumeration.status} · {doc.enumeration.source}
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
          {lines(doc.notes).length > 0 && (
            <Card>
              <CardHeader>
                <Text variant="title-medium" as="h2">
                  Notes
                </Text>
              </CardHeader>
              <CardBody>
                {lines(doc.notes).map((line, index) => (
                  <Text as="p" key={index}>
                    {line}
                  </Text>
                ))}
              </CardBody>
            </Card>
          )}
          {Object.keys(doc.options ?? {}).length > 0 && (
            <Card>
              <CardHeader>
                <Text variant="title-medium" as="h2">
                  Arguments
                </Text>
              </CardHeader>
              <CardBody>
                {Object.entries(doc.options ?? {}).map(([name, spec]) => (
                  <OptionTree key={name} name={name} spec={spec} />
                ))}
              </CardBody>
            </Card>
          )}
          <Grid.Root columns={{ initial: '1', lg: '2' }} gap="4">
            {doc.examples && (
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
            )}
            {Object.keys(doc.returns ?? {}).length > 0 && (
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
            )}
          </Grid.Root>
        </>
      )}
    </Flex>
  );
}
