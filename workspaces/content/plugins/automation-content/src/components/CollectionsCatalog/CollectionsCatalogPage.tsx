import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
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
export function CollectionsCatalogPage(): ReactElement {
  const api = useApi(automationContentApiRef);
  const base = useRouteRef(collectionsRouteRef)();
  const environmentBase = useRouteRef(eeRouteRef)();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [page, setPage] = useState(0);
  const [latestOnly, setLatestOnly] = useState(true);
  const result = useAsyncRetry(
    () => api.listCollections(search || undefined),
    [api, search],
  );
  const groups = useMemo(
    () => groupCollections(result.value ?? []),
    [result.value],
  );
  const filtered = groups.flatMap(group =>
    latestOnly
      ? [{ ...group, displayedVersion: group.versions[0] }]
      : group.versions.map(displayedVersion => ({
          ...group,
          displayedVersion,
        })),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 12));
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
        <Grid.Root columns={{ initial: '1', lg: '12' }} gap="6">
          <Grid.Item colSpan={{ initial: '1', lg: '3' }}>
            <Flex direction="column" gap="4">
              <SearchField
                label="Search collections"
                value={query}
                onChange={value => {
                  setQuery(value);
                  setPage(0);
                }}
              />
              <Checkbox
                isSelected={latestOnly}
                onChange={value => {
                  setLatestOnly(value);
                  setPage(0);
                }}
              >
                Show latest version only
              </Checkbox>
            </Flex>
          </Grid.Item>
          <Grid.Item colSpan={{ initial: '1', lg: '9' }}>
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
                <Text role="status">Loading collections…</Text>
              )}
              {result.loading && (
                <Grid.Root
                  aria-hidden="true"
                  columns={{ initial: '1', md: '2', xl: '3' }}
                  gap="4"
                >
                  {[0, 1, 2].map(i => (
                    <Skeleton key={i} width="100%" height="12rem" />
                  ))}
                </Grid.Root>
              )}
              {!result.loading && !result.error && !filtered.length && (
                <EmptyState
                  title={
                    search
                      ? 'No collections match your search or filters'
                      : 'No collections found'
                  }
                  description={
                    search
                      ? 'Clear your search to browse all collections.'
                      : 'No collections have been reported by the indexed registries.'
                  }
                />
              )}
              {!result.loading && !result.error && (
                <Grid.Root columns={{ initial: '1', md: '2', xl: '3' }} gap="4">
                  {filtered
                    .slice(currentPage * 12, currentPage * 12 + 12)
                    .map(group => (
                      <Card
                        key={`${group.fqcn}@${group.displayedVersion.version}`}
                        href={`${collectionHref(
                          base,
                          group.namespace,
                          group.name,
                        )}?version=${encodeURIComponent(
                          group.displayedVersion.version,
                        )}`}
                        label={`View ${group.fqcn} details`}
                      >
                        <CardHeader>
                          <Text as="h3" variant="title-small">
                            {group.fqcn}
                          </Text>
                          <Badge>
                            {latestOnly
                              ? `Latest: ${group.latest}`
                              : `v${group.displayedVersion.version}`}
                          </Badge>
                          {group.displayedVersion.repository && (
                            <Badge>{group.displayedVersion.repository}</Badge>
                          )}
                        </CardHeader>
                        <CardBody>
                          <Flex direction="column" gap="3">
                            <Text as="p">
                              {group.displayedVersion.description ||
                                'No description available.'}
                            </Text>
                            <Text>
                              {group.versions.length} versions
                              {latestOnly ? ' · Counts across versions' : ''}
                            </Text>
                            <CollectionMetadata
                              counts={
                                latestOnly
                                  ? group.counts
                                  : group.displayedVersion.counts
                              }
                              providedBy={
                                latestOnly
                                  ? group.providedBy
                                  : group.displayedVersion.providedBy
                              }
                              environmentBase={environmentBase}
                            />
                          </Flex>
                        </CardBody>
                      </Card>
                    ))}
                </Grid.Root>
              )}
            </div>
            {!result.loading && !result.error && !!filtered.length && (
              <Flex gap="3" align="center" style={{ flexWrap: 'wrap' }}>
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
                <Text>
                  Page {currentPage + 1} of {totalPages}
                </Text>
                <Button
                  isDisabled={(currentPage + 1) * 12 >= filtered.length}
                  onPress={() => setPage(currentPage + 1)}
                >
                  Next page
                </Button>
              </Flex>
            )}
          </Grid.Item>
        </Grid.Root>
      </Flex>
    </Container>
  );
}
