import { useRef, useState } from 'react';
import useAsync from 'react-use/lib/useAsync';
import {
  toastApiRef,
  useApi,
  useTranslationRef,
} from '@backstage/frontend-plugin-api';
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

export function useEESync({
  repository,
  enabled,
  onReload,
}: Pick<SyncActionProps, 'repository' | 'onReload'> & { enabled: boolean }) {
  const api = useApi(automationContentApiRef);
  const toastApi = useApi(toastApiRef);
  const { t } = useTranslationRef(eeTranslationRef);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    error?: boolean;
    reload?: boolean;
  }>();

  async function run(): Promise<void> {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setResult(undefined);
    try {
      if (repository) {
        const summary = await api.syncEERepository(
          repository.registry,
          repository.repository,
        );
        const description = t('sync.completed', {
          added: String(summary.addedTags),
          moved: String(summary.movedTags),
          removed: String(summary.removedTags),
        });
        toastApi.post({
          title: t('sync.repositoryCompleted', {
            repository: repository.repository,
          }),
          description,
          status: 'success',
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

  return { enabled, pending, result, run };
}

export function SyncFeedback({
  sync,
  onReload,
}: {
  sync: ReturnType<typeof useEESync>;
  onReload: () => void;
}): JSX.Element | null {
  const { t } = useTranslationRef(eeTranslationRef);
  const { pending, result } = sync;
  if (!pending && !result) return null;
  const completion = result?.error ? undefined : result?.message;
  return (
    <>
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
    </>
  );
}

export function SyncAction(props: SyncActionProps): JSX.Element | null {
  const { t } = useTranslationRef(eeTranslationRef);
  const api = useApi(automationContentApiRef);
  const permitted = useContentPermission(contentSyncPermission) === 'allowed';
  const capability = useAsync(
    async () =>
      permitted && props.manualSyncEnabled === undefined
        ? (await api.getRegistryStatus()).manualSyncEnabled === true
        : props.manualSyncEnabled === true,
    [api, props.manualSyncEnabled, permitted],
  );
  const sync = useEESync({
    ...props,
    enabled: permitted && capability.value === true && !capability.loading,
  });
  if (!sync.enabled) return null;
  return (
    <Flex direction="column" gap="2" align="start">
      <Button
        variant="secondary"
        isPending={sync.pending}
        onPress={() => {
          void sync.run();
        }}
      >
        {t(props.repository ? 'sync.repositoryMenu' : 'sync.inventory')}
      </Button>
      <SyncFeedback sync={sync} onReload={props.onReload} />
    </Flex>
  );
}
