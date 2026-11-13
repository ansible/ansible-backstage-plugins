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
      const key = syncFailureMessage(error);
      setResult({
        message: t(key),
        error: true,
        ...(key === 'sync.committed' ? { reload: true } : {}),
      });
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  return { enabled, pending, result, run };
}

function syncFailureMessage(error: unknown) {
  if (!(error instanceof ContentApiError)) return 'sync.failed';
  if (error.retainedPrevious === false) return 'sync.committed';
  if (error.status === 409) return 'sync.conflict';
  if (error.retainedPrevious) return 'sync.retained';
  if (error.status === 403) return 'sync.denied';
  return 'sync.failed';
}

export function SyncFeedback({
  sync,
  onReload,
}: Readonly<{
  sync: ReturnType<typeof useEESync>;
  onReload: () => void;
}>): JSX.Element | null {
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

export function SyncAction(
  props: Readonly<SyncActionProps>,
): JSX.Element | null {
  const { t } = useTranslationRef(eeTranslationRef);
  const api = useApi(automationContentApiRef);
  const permitted = useContentPermission(contentSyncPermission) === 'allowed';
  const { manualSyncEnabled } = props;
  const capability = useAsync(
    async () =>
      permitted &&
      manualSyncEnabled === undefined &&
      (await api.getRegistryStatus()).manualSyncEnabled === true,
    [api, manualSyncEnabled, permitted],
  );
  const sync = useEESync({
    ...props,
    enabled:
      permitted &&
      (manualSyncEnabled ?? (!capability.loading && capability.value === true)),
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
