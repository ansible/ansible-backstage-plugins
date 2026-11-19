import {
  useApi,
  useRouteRef,
  useTranslationRef,
} from '@backstage/frontend-plugin-api';
import { useNavigate } from 'react-router-dom';
import useAsyncFn from 'react-use/lib/useAsyncFn';
import useMountedState from 'react-use/lib/useMountedState';
import {
  ButtonIcon,
  Flex,
  Menu,
  MenuItem,
  MenuTrigger,
  Text,
} from '@backstage/ui';
import { RiMore2Line } from '@remixicon/react';
import type { EERepositorySummary } from '@ansible/automation-content-common/eeRepository';
import { automationContentApiRef } from '../../api';
import { templatesRouteRef } from '../../routes';
import { controllerTemplateHref } from './controllerTemplateHref';
import { eeTranslationRef } from '../../strings/en';
import { SyncFeedback, useEESync } from './SyncAction';

export function EEImageRowActions({
  image,
  canSync,
  onReload,
}: Readonly<{
  image: EERepositorySummary;
  canSync: boolean;
  onReload: () => void;
}>): JSX.Element {
  const { t } = useTranslationRef(eeTranslationRef);
  const sync = useEESync({ repository: image, enabled: canSync, onReload });
  const api = useApi(automationContentApiRef);
  const navigate = useNavigate();
  const isMounted = useMountedState();
  const templatesHref = useRouteRef(templatesRouteRef)?.();
  const { registry, repository, representativeRef, representativeTag } = image;
  const [controller, openControllerTemplate] = useAsyncFn(async () => {
    if (!templatesHref) return;
    const tag = representativeTag
      ? (await api.getEERepository(registry, repository)).tags.find(
          version =>
            version.tag === representativeTag &&
            version.artifactRef === representativeRef,
        )
      : undefined;
    const pullReference =
      tag?.taggedPullReference ??
      (await api.getEEArtifact(representativeRef)).pullReference;
    if (!isMounted()) return;

    navigate(
      controllerTemplateHref(
        templatesHref,
        registry,
        repository,
        pullReference,
      ),
    );
  }, [
    api,
    isMounted,
    navigate,
    templatesHref,
    registry,
    repository,
    representativeRef,
    representativeTag,
  ]);

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
        <MenuTrigger>
          <ButtonIcon
            aria-label={t('inventory.rowActions', {
              repository: image.repository,
            })}
            icon={<RiMore2Line />}
            variant="secondary"
            isDisabled={!templatesHref && !sync.enabled}
          />
          <Menu placement="bottom end">
            {templatesHref && (
              <MenuItem
                isDisabled={controller.loading}
                onAction={() => void openControllerTemplate()}
              >
                {t('detail.useInController')}
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
      {controller.error && (
        <Text role="alert">{t('inventory.controllerSourceFailed')}</Text>
      )}
      <SyncFeedback sync={sync} onReload={onReload} />
    </Flex>
  );
}
