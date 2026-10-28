import { useState } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Container,
  Flex,
  Grid,
  Skeleton,
  Text,
} from '@backstage/ui';
import {
  NotificationProvider,
  NotificationStack,
  useIsSuperuser,
  useNotifications,
} from '@ansible/portal-plugin-sdk';
import { automationContentApiRef } from '../api';
import { collectionsRouteRef, eeRouteRef } from '../routes';
import { EmptyState, PageHeaderSection } from './common';
import { relativeTime } from './ExecutionEnvironments/catalogHelpers';

function healthLabel(ok?: boolean): string {
  if (ok === false) return 'Last reconciliation failed';
  return ok ? 'Healthy' : 'Not yet reconciled';
}

function LandingContent() {
  const api = useApi(automationContentApiRef);
  const { isSuperuser } = useIsSuperuser();
  const { showNotification, notifications, removeNotification } =
    useNotifications();
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const eeHref = useRouteRef(eeRouteRef)();
  const collectionsHref = useRouteRef(collectionsRouteRef)();
  const registries = useAsyncRetry(() => api.listRegistries(), [api]);
  const environments = useAsyncRetry(
    () => api.listExecutionEnvironments(),
    [api],
  );
  const collections = useAsyncRetry(() => api.listCollections(), [api]);
  const approximate = environments.value?.some(
    image => !image.contentsKnown || image.enumeration.status !== 'complete',
  );
  const itemCount = collections.value?.reduce(
    (sum, collection) =>
      sum +
      (collection.counts.plugins ?? 0) +
      (collection.counts.roles ?? 0) +
      (collection.counts.playbooks ?? 0) +
      (collection.counts.edaPlugins ?? 0) +
      (collection.counts.rulebooks ?? 0),
    0,
  );
  const sync = async () => {
    if (syncing || !isSuperuser) return;
    setSyncing(true);
    setStatus('Syncing configured registries');
    try {
      const result = await api.syncAll();
      for (const registry of result.registries) {
        showNotification({
          title: `${registry.registry}: ${
            registry.ok ? 'sync complete' : 'sync failed'
          }`,
          description: registry.ok
            ? `${registry.discovered} artifacts discovered`
            : registry.error ?? 'Registry reconciliation failed.',
          severity: registry.ok ? 'success' : 'error',
        });
      }
      setStatus(
        result.registries.some(registry => !registry.ok)
          ? 'Sync completed with registry failures'
          : 'Sync completed',
      );
      registries.retry();
      environments.retry();
      collections.retry();
    } catch {
      setStatus('Sync failed. Retry when the content service is available.');
      showNotification({
        title: 'Content sync failed',
        description: 'The content service could not complete the sync.',
        severity: 'error',
      });
    } finally {
      setSyncing(false);
    }
  };
  return (
    <Container>
      <Flex direction="column" gap="4">
        <PageHeaderSection
          title="Automation content"
          description="Discover and inspect Ansible content across configured OCI registries."
          actions={
            isSuperuser && (
              <Button variant="secondary" isPending={syncing} onPress={sync}>
                Sync all registries
              </Button>
            )
          }
          status={status}
        />
        <Flex gap="3" direction={{ initial: 'column', md: 'row' }}>
          <ButtonLink href={eeHref}>Browse execution environments</ButtonLink>
          <ButtonLink href={collectionsHref}>Browse collections</ButtonLink>
        </Flex>
        {(environments.error || collections.error) && (
          <div role="alert">
            Inventory counts are unavailable.{' '}
            <Button
              onPress={() => {
                environments.retry();
                collections.retry();
              }}
            >
              Retry counts
            </Button>
          </div>
        )}
        {environments.loading || collections.loading ? (
          <div aria-busy="true" aria-label="Loading inventory counts">
            <Skeleton width="100%" height="4rem" />
          </div>
        ) : (
          !(environments.error || collections.error) && (
            <Flex direction="column" gap="2">
              <Text>
                {environments.value?.length ?? 0} execution environments
              </Text>
              <Text>
                {
                  new Set(collections.value?.map(collection => collection.fqcn))
                    .size
                }{' '}
                distinct collections · {collections.value?.length ?? 0}{' '}
                version/artifact occurrences
              </Text>
              <Text>
                {approximate ? 'Approximate reported' : 'Reported'} content item
                occurrences: {itemCount ?? 0}
              </Text>
              <Text color="secondary">
                Content counts describe reported inventory, not unique content
                across images. Unknown inventories may contain additional
                content.
              </Text>
            </Flex>
          )
        )}
        <Text as="h2" variant="title-medium">
          Registry health
        </Text>
        {registries.error && (
          <div role="alert">
            Unable to load registry health.{' '}
            <Button onPress={registries.retry}>Retry registry health</Button>
          </div>
        )}
        {registries.loading && (
          <div aria-busy="true" aria-label="Loading registry health">
            <Skeleton width="100%" height="12rem" />
          </div>
        )}
        {registries.value?.length === 0 && (
          <EmptyState
            title="No content sources configured"
            description="Ask your administrator to configure OCI registries in the application configuration."
          />
        )}
        <Grid.Root columns={{ initial: '1', md: '2' }} gap="4">
          {registries.value?.map(registry => (
            <Card key={registry.name}>
              <CardHeader>
                <Text as="h3" variant="title-small">
                  {registry.name}
                </Text>
              </CardHeader>
              <CardBody>
                <Flex direction="column" gap="2">
                  <Text>{registry.url}</Text>
                  <Text
                    color={
                      registry.lastReconcileOk === false ? 'danger' : 'primary'
                    }
                  >
                    {healthLabel(registry.lastReconcileOk)}
                  </Text>
                  {registry.lastReconcileError && (
                    <Text>{registry.lastReconcileError}</Text>
                  )}
                  <Text>{relativeTime(registry.lastReconciledAt)}</Text>
                  <Text>{registry.lastReconciledAt ?? 'Never reconciled'}</Text>
                  {registry.capabilities ? (
                    <>
                      <Text>Referrers: {registry.capabilities.referrers}</Text>
                      <Text>
                        Catalog enumeration:{' '}
                        {registry.capabilities.catalogEnumeration
                          ? 'Yes'
                          : 'No'}
                      </Text>
                      <Text>
                        Tag pagination:{' '}
                        {registry.capabilities.tagPagination ? 'Yes' : 'No'}
                      </Text>
                      <Text>Delete: {registry.capabilities.delete}</Text>
                      <Text>
                        Notifications: {registry.capabilities.notifications}
                      </Text>
                      <Text>
                        Authentication:{' '}
                        {registry.capabilities.auth.join(', ') || 'None'}
                      </Text>
                      {registry.capabilities.notes?.map(note => (
                        <Text key={note}>{note}</Text>
                      ))}
                    </>
                  ) : (
                    <Text>Capabilities unknown</Text>
                  )}
                </Flex>
              </CardBody>
            </Card>
          ))}
        </Grid.Root>
        <NotificationStack
          notifications={notifications}
          onClose={removeNotification}
        />
      </Flex>
    </Container>
  );
}

/** Registry health, inventory summary and admin-only sync with per-registry feedback. */
export function ContentLandingPage() {
  return (
    <NotificationProvider>
      <LandingContent />
    </NotificationProvider>
  );
}
