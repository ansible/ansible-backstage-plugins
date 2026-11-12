import { useRef, useState } from 'react';
import useAsync from 'react-use/lib/useAsync';
import { useApi, useTranslationRef } from '@backstage/frontend-plugin-api';
import { Button, Flex, Text } from '@backstage/ui';
import { contentSyncPermission } from '@ansible/automation-content-common/permissions';
import { automationContentApiRef, ContentApiError } from '../../api';
import { eeTranslationRef } from '../../strings/en';
import { useContentPermission } from '../../useContentPermission';

interface SyncActionProps {
  repository?: { registry: string; repository: string };
  manualSyncEnabled?: boolean;
  onReload: () => void;
}

export function SyncAction({
  repository,
  manualSyncEnabled,
  onReload,
}: SyncActionProps): JSX.Element | null {
  const api = useApi(automationContentApiRef);
  const { t } = useTranslationRef(eeTranslationRef);
  const permitted = useContentPermission(contentSyncPermission) === 'allowed';
  const capability = useAsync(
    async () =>
      permitted && manualSyncEnabled === undefined
        ? (await api.getRegistryStatus()).manualSyncEnabled === true
        : manualSyncEnabled === true,
    [api, manualSyncEnabled, permitted],
  );
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    error?: boolean;
    reload?: boolean;
  }>();

  if (!permitted || !capability.value || capability.loading) return null;

  async function run(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setResult(undefined);
    try {
      if (repository) {
        const summary = await api.syncEERepository(
          repository.registry,
          repository.repository,
        );
        setResult({
          message: t('sync.completed', {
            added: String(summary.addedTags),
            moved: String(summary.movedTags),
            removed: String(summary.removedTags),
          }),
        });
        onReload();
      } else {
        await api.syncAll();
        setResult({ message: t('sync.scheduled'), reload: true });
      }
    } catch (error) {
      if (
        error instanceof ContentApiError &&
        error.retainedPrevious === false
      ) {
        setResult({ message: t('sync.committed'), error: true, reload: true });
      } else {
        let message: string = t('sync.failed');
        if (error instanceof ContentApiError) {
          if (error.status === 409) message = t('sync.conflict');
          else if (error.retainedPrevious) message = t('sync.retained');
          else if (error.status === 403) message = t('sync.denied');
        }
        setResult({ message, error: true });
      }
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  const completion = result?.error ? undefined : result?.message;
  return (
    <Flex direction="column" gap="2" align="start">
      <Button
        variant="secondary"
        isPending={pending}
        onPress={() => {
          void run();
        }}
      >
        {t(repository ? 'sync.repository' : 'sync.inventory')}
      </Button>
      <Text as="p" role="status">
        {pending ? t('sync.pending') : completion}
      </Text>
      {result?.error && (
        <Text as="p" role="alert">
          {result.message}
        </Text>
      )}
      {result?.reload && (
        <Button variant="tertiary" onPress={onReload}>
          {t('reload')}
        </Button>
      )}
    </Flex>
  );
}
