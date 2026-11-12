import {
  toastApiRef,
  useApi,
  useTranslationRef,
} from '@backstage/frontend-plugin-api';
import { ButtonIcon, Flex, Menu, MenuItem, MenuTrigger } from '@backstage/ui';
import { RiMore2Line } from '@remixicon/react';
import type { EERepositorySummary } from '@ansible/automation-content-common/eeRepository';
import { eeTranslationRef } from '../../strings/en';
import { RepositoryFavoriteButton } from './RepositoryFavoriteButton';
import { SyncFeedback, useEESync } from './SyncAction';

export function EEImageRowActions({
  image,
  detailHref,
  canSync,
  onReload,
}: {
  image: EERepositorySummary;
  detailHref?: string;
  canSync: boolean;
  onReload: () => void;
}): JSX.Element {
  const { t } = useTranslationRef(eeTranslationRef);
  const toastApi = useApi(toastApiRef);
  const sync = useEESync({
    repository: image,
    enabled: canSync,
    onReload,
    onRepositoryComplete: description => {
      toastApi.post({
        title: t('sync.repositoryCompleted', { repository: image.repository }),
        description,
        status: 'success',
      });
    },
  });

  return (
    <Flex direction="column" gap="1">
      <Flex
        align="center"
        gap="1"
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ')
            event.stopPropagation();
        }}
      >
        {detailHref && (
          <RepositoryFavoriteButton
            entityRef={image.entityRef}
            repository={image.repository}
          />
        )}
        <MenuTrigger>
          <ButtonIcon
            aria-label={t('inventory.rowActions', {
              repository: image.repository,
            })}
            icon={<RiMore2Line />}
            variant="secondary"
            isDisabled={!detailHref && !sync.enabled}
          />
          <Menu placement="bottom end">
            {detailHref && (
              <MenuItem href={detailHref}>
                {t('inventory.viewDetails')}
              </MenuItem>
            )}
            {sync.enabled && (
              <MenuItem
                isDisabled={sync.pending}
                onAction={() => {
                  void sync.run();
                }}
              >
                {t('sync.repositoryMenu')}
              </MenuItem>
            )}
          </Menu>
        </MenuTrigger>
      </Flex>
      <SyncFeedback sync={sync} onReload={onReload} />
    </Flex>
  );
}
