import { useMemo, useState } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Container,
  Flex,
  Grid,
  SearchField,
  Skeleton,
  Text,
} from '@backstage/ui';
import { automationContentApiRef } from '../../api';
import { collectionsRouteRef, eeRouteRef } from '../../routes';
import { EmptyState, PageHeaderSection } from '../common';
import { collectionHref, groupCollections } from './collectionHelpers';
import { CollectionMetadata } from './CollectionMetadata';

/** Registry-backed collection catalog, grouped without losing artifact occurrences. */
export function CollectionsCatalogPage() {
  const api = useApi(automationContentApiRef);
  const base = useRouteRef(collectionsRouteRef)();
  const environmentBase = useRouteRef(eeRouteRef)();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const result = useAsyncRetry(() => api.listCollections(), [api]);
  const groups = useMemo(
    () => groupCollections(result.value ?? []),
    [result.value],
  );
  const filtered = groups.filter(g =>
    `${g.fqcn} ${g.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 12) - 1),
  );
  return (
    <Container>
      <Flex direction="column" gap="4">
        <PageHeaderSection
          title="Collections"
          description="Discover Ansible collections and the execution environments that provide them."
        />
        <SearchField
          label="Search collections"
          value={query}
          onChange={value => {
            setQuery(value);
            setPage(0);
          }}
        />
        {result.error && (
          <div role="alert">
            Unable to load collections.{' '}
            <Button onPress={result.retry}>Retry</Button>
          </div>
        )}
        {!result.loading && !result.error && result.value && (
          <Text as="h2" variant="title-medium" aria-live="polite">
            Ansible Collections ({filtered.length})
          </Text>
        )}
        <div aria-busy={result.loading}>
          {result.loading && (
            <Grid.Root columns={{ initial: '1', md: '2', xl: '3' }} gap="4">
              {[0, 1, 2].map(i => (
                <Skeleton key={i} width="100%" height="12rem" />
              ))}
            </Grid.Root>
          )}
          {!result.loading && !result.error && !filtered.length && (
            <EmptyState
              title={
                groups.length
                  ? 'No collections match your search or filters'
                  : 'No collections found'
              }
              description={
                groups.length
                  ? 'Clear your search to browse all collections.'
                  : 'No collections have been reported by the indexed registries.'
              }
            />
          )}
          <Grid.Root columns={{ initial: '1', md: '2', xl: '3' }} gap="4">
            {filtered
              .slice(currentPage * 12, currentPage * 12 + 12)
              .map(group => (
                <Card
                  key={group.fqcn}
                  href={collectionHref(base, group.namespace, group.name)}
                  label={`View ${group.fqcn} details`}
                >
                  <CardHeader>
                    <Text as="h3" variant="title-small">
                      {group.fqcn}
                    </Text>
                    <Badge>Latest: {group.latest}</Badge>
                  </CardHeader>
                  <CardBody>
                    <Flex direction="column" gap="3">
                      <Text as="p">
                        {group.description || 'No description available.'}
                      </Text>
                      <Text>
                        {group.versions.length} versions · Counts across
                        versions
                      </Text>
                      <CollectionMetadata
                        counts={group.counts}
                        providedBy={group.providedBy}
                        environmentBase={environmentBase}
                      />
                    </Flex>
                  </CardBody>
                </Card>
              ))}
          </Grid.Root>
        </div>
        {!!filtered.length && (
          <Flex gap="3" align="center">
            <Button
              isDisabled={currentPage === 0}
              onPress={() => setPage(currentPage - 1)}
            >
              Previous page
            </Button>
            <Text>
              Showing {currentPage * 12 + 1}–
              {Math.min(currentPage * 12 + 12, filtered.length)} of{' '}
              {filtered.length}
            </Text>
            <Button
              isDisabled={(currentPage + 1) * 12 >= filtered.length}
              onPress={() => setPage(currentPage + 1)}
            >
              Next page
            </Button>
          </Flex>
        )}
      </Flex>
    </Container>
  );
}
