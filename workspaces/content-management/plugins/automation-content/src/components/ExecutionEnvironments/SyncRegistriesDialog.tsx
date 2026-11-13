import { useRef, useState } from 'react';
import useAsync from 'react-use/lib/useAsync';
import {
  toastApiRef,
  useApi,
  useTranslationRef,
} from '@backstage/frontend-plugin-api';
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
  Flex,
  Text,
} from '@backstage/ui';
import { RiRefreshLine } from '@remixicon/react';
import { contentSyncPermission } from '@ansible/automation-content-common/permissions';
import {
  automationContentApiRef,
  ContentApiError,
  registrySyncEvents,
} from '../../api';
import { eeTranslationRef } from '../../strings/en';
import { useContentPermission } from '../../useContentPermission';

export function SyncRegistriesDialog(): JSX.Element | null {
  const api = useApi(automationContentApiRef);
  const toastApi = useApi(toastApiRef);
  const { t } = useTranslationRef(eeTranslationRef);
  const permitted = useContentPermission(contentSyncPermission) === 'allowed';
  const status = useAsync(
    () => (permitted ? api.getRegistryStatus() : Promise.resolve(undefined)),
    [api, permitted],
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const inFlight = useRef(false);
  const failureToast = useRef<ReturnType<typeof toastApi.post>>();

  if (!permitted || status.value?.manualSyncEnabled !== true) return null;
  const names = status.value.items.map(registry => registry.name);

  async function syncSelected(): Promise<void> {
    if (inFlight.current || !selected.length) return;
    inFlight.current = true;
    setPending(true);
    setMessages([]);
    failureToast.current?.close();
    failureToast.current = undefined;
    const failed: string[] = [];
    try {
      const results = await Promise.allSettled(
        selected.map(name => api.syncRegistry(name)),
      );
      const errors = results.flatMap((result, index) => {
        const registry = selected[index];
        if (
          result.status === 'fulfilled' &&
          result.value.status === 'completed'
        ) {
          return [];
        }
        if (result.status === 'rejected') {
          const error: unknown = result.reason;
          if (
            error instanceof ContentApiError &&
            error.code === 'committed-audit-unconfirmed' &&
            error.retainedPrevious === false
          ) {
            return [t('sync.registryCommitted', { registry })];
          }
          if (
            !(error instanceof ContentApiError) ||
            (error.status >= 500 &&
              error.retainedPrevious !== true &&
              error.code !== 'REFRESH_FAILED' &&
              error.code !== 'AUDIT_UNAVAILABLE')
          ) {
            return [t('sync.registryOutcomeUnknown', { registry })];
          }
          if (error.status === 409) {
            failed.push(registry);
            return [t('sync.registryBusy', { registry })];
          }
        }
        failed.push(registry);
        return [t('sync.registryFailed', { registry })];
      });
      if (errors.length === 0) {
        setOpen(false);
        toastApi.post({
          title:
            selected.length === 1
              ? t('sync.registryCompleted', { registry: selected[0] })
              : t('sync.registriesCompleted', {
                  quantity: String(selected.length),
                }),
          status: 'success',
        });
      } else if (failed.length === 0) {
        setOpen(false);
        failureToast.current = toastApi.post({
          title: t('sync.registrySyncUnconfirmed'),
          description: errors.join(' '),
          status: 'warning',
        });
      } else {
        failureToast.current = toastApi.post({
          title: t('sync.registrySyncFailed'),
          description: t('sync.retryFailedRegistries'),
          status: 'danger',
        });
      }
      setMessages(errors);
      setSelected(failed);
      registrySyncEvents.dispatchEvent(new Event('settled'));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <DialogTrigger
      isOpen={open}
      onOpenChange={next => {
        if (inFlight.current) return;
        if (next) {
          setSelected([]);
          setMessages([]);
        }
        setOpen(next);
      }}
    >
      <Button variant="secondary" iconStart={<RiRefreshLine />}>
        {t('sync.registries')}
      </Button>
      <Dialog>
        <DialogHeader>{t('sync.sourcesTitle')}</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="3">
            <Text>{t('sync.sourcesDescription')}</Text>
            {names.length === 0 && <Text>{t('inventory.noRegistries')}</Text>}
            {names.map(name => (
              <Checkbox
                key={name}
                isDisabled={pending}
                isSelected={selected.includes(name)}
                onChange={checked =>
                  setSelected(previous =>
                    checked
                      ? [...previous, name]
                      : previous.filter(value => value !== name),
                  )
                }
              >
                {name}
              </Checkbox>
            ))}
            <Flex direction="column" gap="1" role="status">
              {pending && <Text>{t('sync.pending')}</Text>}
              {messages.map(message => (
                <Text key={message}>{message}</Text>
              ))}
            </Flex>
          </Flex>
        </DialogBody>
        <DialogFooter>
          {names.length > 0 && (
            <Checkbox
              isDisabled={pending}
              isSelected={selected.length === names.length}
              isIndeterminate={
                selected.length > 0 && selected.length < names.length
              }
              onChange={checked => setSelected(checked ? names : [])}
            >
              {t('sync.selectAll')}
            </Checkbox>
          )}
          <Button
            variant="secondary"
            isDisabled={pending}
            onPress={() => setOpen(false)}
          >
            {t('sync.cancel')}
          </Button>
          <Button
            isPending={pending}
            isDisabled={!selected.length}
            onPress={() => {
              void syncSelected();
            }}
          >
            {t('sync.syncSelected')}
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  );
}
