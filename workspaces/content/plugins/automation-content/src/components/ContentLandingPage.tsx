import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { RequiresContentPermission } from './common/RequiresContentPermission';
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
  const syncError = (error?: string) =>
    isSuperuser
      ? (error ?? 'Registry reconciliation failed.')
      : 'Sync failed for this registry';
  const { showNotification, notifications, removeNotification } =
    useNotifications();
  const [syncing, setSyncing] = useState(false);
  const [syncingRegistry, setSyncingRegistry] = useState<string>();
  const syncInFlight = useRef(false);
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
  const sync = async (name?: string) => {
    if (syncInFlight.current || !isSuperuser) return;
    syncInFlight.current = true;
    setSyncing(true);
    setSyncingRegistry(name);
    setStatus(name ? `Syncing ${name}` : 'Syncing configured registries');
    try {
      if (name) {
        const result = await api.syncRegistry(name);
        const ok = result.status === 'completed';
        showNotification({
          title: `${name}: ${ok ? 'sync complete' : 'sync failed'}`,
          description: ok
            ? `${result.discovered} artifacts discovered`
            : syncError(result.error),
          severity: ok ? 'success' : 'error',
        });
        setStatus(`${name}: ${ok ? 'sync completed' : 'sync failed'}`);
      } else {
        const result = await api.syncAll();
        for (const registry of result.registries) {
          showNotification({
            title: `${registry.registry}: ${
              registry.ok ? 'sync complete' : 'sync failed'
            }`,
            description: registry.ok
              ? `${registry.discovered} artifacts discovered`
              : syncError(registry.error),
            severity: registry.ok ? 'success' : 'error',
          });
        }
        setStatus(
          result.registries.some(registry => !registry.ok)
            ? 'Sync completed with registry failures'
            : 'Sync completed',
        );
      }
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
      syncInFlight.current = false;
      setSyncing(false);
      setSyncingRegistry(undefined);
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
              <Button
                variant="secondary"
                isPending={syncing && !syncingRegistry}
                isDisabled={syncing}
                onPress={() => sync()}
              >
                Sync all
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
        {(environments.loading ||
          collections.loading ||
          registries.loading) && (
          <Text role="status">Loading automation content…</Text>
        )}
        {environments.loading || collections.loading ? (
          <div aria-busy="true" aria-label="Loading inventory counts">
            <div aria-hidden="true">
              <Skeleton width="100%" height="4rem" />
            </div>
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
            <div aria-hidden="true">
              <Skeleton width="100%" height="12rem" />
            </div>
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
                  {isSuperuser && <Text>{registry.url}</Text>}
                  {isSuperuser && (
                    <Button
                      variant="secondary"
                      aria-label={`Sync ${registry.name}`}
                      isDisabled={syncing}
                      isPending={syncing && syncingRegistry === registry.name}
                      onPress={() => sync(registry.name)}
                    >
                      Sync registry
                    </Button>
                  )}
                  <Text
                    color={
                      registry.lastReconcileOk === false ? 'danger' : 'primary'
                    }
                  >
                    {healthLabel(registry.lastReconcileOk)}
                  </Text>
                  {registry.lastReconcileError && (
                    <Text>
                      {isSuperuser
                        ? registry.lastReconcileError
                        : 'Last sync failed'}
                    </Text>
                  )}
                  <Text>{relativeTime(registry.lastReconciledAt)}</Text>
                  {registry.lastReconciledAt && (
                    <Text color="secondary">{registry.lastReconciledAt}</Text>
                  )}
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
export function ContentLandingPage(): ReactElement {
  return (
    <RequiresContentPermission>
      <NotificationProvider>
        <LandingContent />
      </NotificationProvider>
    </RequiresContentPermission>
  );
}
