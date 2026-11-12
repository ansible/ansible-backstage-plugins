import { useRef, useState } from 'react';
import useAsync from 'react-use/lib/useAsync';
import { useApi, useTranslationRef } from '@backstage/frontend-plugin-api';
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

  if (!permitted || status.value?.manualSyncEnabled !== true) return null;
  const names = status.value.items.map(registry => registry.name);

  async function syncSelected(): Promise<void> {
    if (inFlight.current || !selected.length) return;
    inFlight.current = true;
    setPending(true);
    setMessages([]);
    const failed: string[] = [];
    try {
      const results = await Promise.allSettled(
        selected.map(name => api.syncRegistry(name)),
      );
      const nextMessages = results.map((result, index) => {
        const registry = selected[index];
        if (
          result.status === 'fulfilled' &&
          result.value.status === 'completed'
        ) {
          return t('sync.registryCompleted', { registry });
        }
        failed.push(registry);
        if (
          result.status === 'rejected' &&
          result.reason instanceof ContentApiError &&
          result.reason.status === 409
        ) {
          return t('sync.registryBusy', { registry });
        }
        return t('sync.registryFailed', { registry });
      });
      setMessages(nextMessages);
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
