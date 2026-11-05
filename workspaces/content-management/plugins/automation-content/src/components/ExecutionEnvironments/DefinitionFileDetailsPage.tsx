import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useNavigate, useParams } from 'react-router-dom';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
  useRouteRef,
} from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  Button,
  ButtonIcon,
  Flex,
  Menu,
  MenuItem,
  MenuTrigger,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@backstage/ui';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '@ansible/portal-plugin-sdk';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import { useNativeEntityPage } from '@ansible/portal-extension-host/alpha';
import { UnregisterEntityDialog } from '../UnregisterEntityDialog';
import { BreadcrumbsNavigation } from '../common/BreadcrumbsNavigation';
import { EmptyState } from '../common';
import { eeRouteRef } from '../../routes';
import { parseEEDefinition } from '../../utils/eeDefinitionUtils';
import {
  cleanHttpUrl,
  downloadEntityAsTarArchive,
  getEntityEEDefinitionUrl,
  isEntityBuildable,
} from './catalog/helpers';
import { EEBuildDialog } from './catalog/EEBuildDialog';
import { useEEBuildFlow } from './catalog/useEEBuildFlow';
import { DefinitionFileOverview } from './definitionFileDetails/DefinitionFileOverview';
import {
  fetchGitFileContentFromBackend,
  getGitFileLocation,
  sourceFilePath,
  type GitFileFailureReason,
  type GitFileOutcome,
} from './definitionFileDetails/gitFileReader';
import styles from './definitionFileDetails/definitionFileDetails.module.css';

function editDefinitionUrl(entity: Entity): string | undefined {
  return cleanHttpUrl(getEntityEEDefinitionUrl(entity));
}

function downloadExperience(entity: Entity): boolean {
  return (
    entity.metadata.annotations?.['ansible.io/download-experience']
      ?.toString()
      .toLowerCase()
      .trim() === 'true'
  );
}

interface SourceFileResults {
  entityRef: string;
  entity: Entity;
  readme?: GitFileOutcome;
  definition?: GitFileOutcome;
}

function failureReason(
  outcome: GitFileOutcome | undefined,
): GitFileFailureReason | undefined {
  return outcome && !outcome.ok ? outcome.reason : undefined;
}

function DefinitionFileDetailsContent(): ReactElement {
  const { namespace = 'default', name = '' } = useParams<{
    namespace: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const catalog = useApi(catalogApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const base = useRouteRef(eeRouteRef)();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const notifications = useNotifications();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedNativeTabIndex, setSelectedNativeTabIndex] =
    useState<number>();
  const buildFlow = useEEBuildFlow();
  const entityRef = stringifyEntityRef({
    kind: 'Component',
    namespace,
    name,
  });
  const entityRequest = useAsyncRetry(
    () => catalog.getEntityByRef(entityRef),
    [catalog, entityRef],
  );
  const entity = entityRequest.value;
  const selectNativeTab = useCallback((index: number) => {
    setSelectedNativeTabIndex(index);
  }, []);
  useEffect(() => {
    setSelectedNativeTabIndex(undefined);
  }, [entityRef]);
  const native = useNativeEntityPage(
    entity,
    CONTENT_TYPES.EXECUTION_ENVIRONMENT_DEFINITION,
    selectNativeTab,
  );
  const isRegistryImageEntity =
    entity?.metadata.annotations?.['ansible.com/digest'] !== undefined;
  const validDefinitionEntity =
    entity?.kind.toLowerCase() === 'component' &&
    entity.metadata.name === name &&
    (entity.metadata.namespace ?? 'default') === namespace &&
    entity.spec?.type === 'execution-environment' &&
    !isRegistryImageEntity;
  const ownerRef =
    typeof entity?.spec?.owner === 'string' ? entity.spec.owner : undefined;
  const ownerRequest = useAsyncRetry(async () => {
    if (!ownerRef) return '—';
    try {
      const owner = await catalog.getEntityByRef(ownerRef);
      return owner?.metadata.title ?? owner?.metadata.name ?? ownerRef;
    } catch {
      return ownerRef;
    }
  }, [catalog, ownerRef]);
  const sourceLocation = cleanHttpUrl(
    entity?.metadata.annotations?.['backstage.io/source-location'],
  );
  const editUrl = entity ? editDefinitionUrl(entity) : undefined;
  const isDownloadExperience = entity ? downloadExperience(entity) : false;
  const inlineReadme =
    typeof entity?.spec?.readme === 'string' && entity.spec.readme.trim()
      ? entity.spec.readme
      : undefined;
  const inlineDefinition =
    typeof entity?.spec?.definition === 'string' &&
    entity.spec.definition.trim()
      ? entity.spec.definition
      : undefined;
  const gitFileLocation = useMemo(
    () => (entity ? getGitFileLocation(entity) : undefined),
    [entity],
  );
  const sourceFilesRequest = useAsyncRetry(async (): Promise<
    SourceFileResults | undefined
  > => {
    if (!entity) return undefined;
    const currentEntityRef = entityRef;
    if (
      !validDefinitionEntity ||
      !gitFileLocation ||
      (inlineReadme && inlineDefinition)
    ) {
      return {
        entityRef: currentEntityRef,
        entity,
      };
    }

    const [readmeOutcome, definitionOutcome] = await Promise.all([
      inlineReadme
        ? Promise.resolve(undefined)
        : fetchGitFileContentFromBackend(
            discoveryApi,
            fetchApi,
            gitFileLocation,
            sourceFilePath(gitFileLocation, entity.metadata.name, 'readme'),
          ),
      inlineDefinition
        ? Promise.resolve(undefined)
        : fetchGitFileContentFromBackend(
            discoveryApi,
            fetchApi,
            gitFileLocation,
            sourceFilePath(gitFileLocation, entity.metadata.name, 'definition'),
          ),
    ]);

    return {
      entityRef: currentEntityRef,
      entity,
      ...(readmeOutcome ? { readme: readmeOutcome } : {}),
      ...(definitionOutcome ? { definition: definitionOutcome } : {}),
    };
  }, [
    discoveryApi,
    entity,
    entityRef,
    fetchApi,
    gitFileLocation,
    inlineDefinition,
    inlineReadme,
    validDefinitionEntity,
  ]);
  const candidateSourceFiles = sourceFilesRequest.value;
  const currentSourceFiles =
    candidateSourceFiles &&
    candidateSourceFiles.entityRef === entityRef &&
    candidateSourceFiles.entity === entity
      ? candidateSourceFiles
      : undefined;
  const readmeOutcome = inlineReadme ? undefined : currentSourceFiles?.readme;
  const definitionOutcome = inlineDefinition
    ? undefined
    : currentSourceFiles?.definition;
  const readme =
    inlineReadme ?? (readmeOutcome?.ok ? readmeOutcome.data : undefined);
  const definition =
    inlineDefinition ??
    (definitionOutcome?.ok ? definitionOutcome.data : undefined);
  const readmeFailure = failureReason(readmeOutcome);
  const definitionFailure = failureReason(definitionOutcome);
  const parsedDefinition = useMemo(
    () => parseEEDefinition(definition),
    [definition],
  );
  const downloadArchive = useCallback(() => {
    if (entity && !downloadEntityAsTarArchive(entity)) {
      notifications.showNotification({
        title: 'Download',
        description:
          'Could not download the execution environment. Please try again.',
        severity: 'error',
      });
    }
  }, [entity, notifications]);
  const openExternal = useCallback((url: string | undefined) => {
    const safeUrl = cleanHttpUrl(url);
    if (safeUrl) window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }, []);
  const handleDeleteConfirm = useCallback(() => {
    setDeleteOpen(false);
    navigate(`${base}/catalog`, { replace: true });
  }, [base, navigate]);
  const retryEntity = entityRequest.retry;
  const refreshDetails = useCallback(() => {
    retryEntity();
  }, [retryEntity]);
  const pageLabel = entity?.metadata.name ?? name;
  const nativeTabs = native?.tabs ?? [];
  const selectedNativeTab =
    selectedNativeTabIndex === undefined
      ? undefined
      : nativeTabs[selectedNativeTabIndex];
  const selectedTab = selectedNativeTab?.id ?? 'overview';
  const overviewContent = entity ? (
    <DefinitionFileOverview
      entity={entity}
      ownerName={ownerRequest.value ?? ownerRef ?? '—'}
      parsedDefinition={parsedDefinition}
      hasDefinition={Boolean(definition?.trim())}
      readmeFailure={readmeFailure}
      definitionFailure={definitionFailure}
      sourceLocationUrl={sourceLocation}
      editDefinitionUrl={isDownloadExperience ? undefined : editUrl}
      readme={readme}
      isRefreshing={entityRequest.loading || sourceFilesRequest.loading}
      isDownloadExperience={isDownloadExperience}
      onRefresh={refreshDetails}
      onRetrySourceFiles={sourceFilesRequest.retry}
      onEditDefinition={() => openExternal(editUrl)}
      onDownloadArchive={downloadArchive}
    />
  ) : null;

  return (
    <div className={styles.page}>
      <Flex direction="column" gap="4">
        <BreadcrumbsNavigation
          items={[
            { label: 'Execution environments', href: base },
            { label: 'Definition files', href: `${base}/catalog` },
            { label: pageLabel },
          ]}
        />
        <Flex
          align="center"
          justify="between"
          gap="3"
          className={styles.header}
        >
          <Text
            as="h1"
            variant="title-small"
            weight="bold"
            className={styles.title}
          >
            {pageLabel}
          </Text>
          {validDefinitionEntity && entity && (
            <Flex align="center" gap="2">
              <ButtonIcon
                variant="tertiary"
                icon={
                  isStarredEntity(entity) ? <StarIcon /> : <StarBorderIcon />
                }
                aria-pressed={isStarredEntity(entity)}
                aria-label={`${isStarredEntity(entity) ? 'Remove' : 'Add'} ${
                  entity.metadata.name
                } ${isStarredEntity(entity) ? 'from' : 'to'} favorites`}
                onPress={() => toggleStarredEntity(entity)}
              />
              <MenuTrigger>
                <Button variant="secondary" iconEnd={<ArrowDropDownIcon />}>
                  Actions
                </Button>
                <Menu>
                  {isEntityBuildable(entity) && (
                    <MenuItem
                      onAction={() => {
                        void buildFlow.startBuildFlow(entity);
                      }}
                    >
                      Build
                    </MenuItem>
                  )}
                  {!isDownloadExperience && editUrl && (
                    <MenuItem onAction={() => openExternal(editUrl)}>
                      Edit definition
                    </MenuItem>
                  )}
                  {!isDownloadExperience && sourceLocation && (
                    <MenuItem onAction={() => openExternal(sourceLocation)}>
                      View in source
                    </MenuItem>
                  )}
                  <MenuItem color="danger" onAction={() => setDeleteOpen(true)}>
                    Delete
                  </MenuItem>
                </Menu>
              </MenuTrigger>
            </Flex>
          )}
        </Flex>

        {buildFlow.authBusy && (
          <Text role="status">Getting source-control credentials…</Text>
        )}
        <NotificationStack
          notifications={notifications.notifications}
          onClose={notifications.removeNotification}
        />
        {entityRequest.loading && (
          <div aria-busy="true" aria-label="Loading definition details">
            <Text role="status">Loading definition details…</Text>
            <Skeleton width="100%" height="12rem" />
          </div>
        )}
        {entityRequest.error && (
          <div role="alert">
            Unable to load this definition file.{' '}
            <Button onPress={entityRequest.retry}>Retry</Button>
          </div>
        )}
        {!entityRequest.loading &&
          !entityRequest.error &&
          !validDefinitionEntity && (
            <EmptyState
              title="Definition file not found"
              description="This definition file is not available in the catalog."
            />
          )}
        {sourceFilesRequest.loading && (
          <Text role="status">Loading source files…</Text>
        )}
        {!entityRequest.loading &&
          !entityRequest.error &&
          validDefinitionEntity &&
          entity && (
            <>
              {nativeTabs.length > 0 ? (
                <Tabs
                  selectedKey={selectedTab}
                  onSelectionChange={key => {
                    if (key === 'overview') {
                      setSelectedNativeTabIndex(undefined);
                      return;
                    }
                    const index = nativeTabs.findIndex(tab => tab.id === key);
                    if (index >= 0) native?.onSelect(nativeTabs[index].id);
                  }}
                >
                  <TabList aria-label="Definition file details">
                    <Tab id="overview">Overview</Tab>
                    {nativeTabs.map(tab => (
                      <Tab key={tab.id} id={tab.id}>
                        {tab.label}
                      </Tab>
                    ))}
                  </TabList>
                  <TabPanel id="overview">{overviewContent}</TabPanel>
                  {nativeTabs.map(tab => {
                    const Contribution = tab.component;
                    return (
                      <TabPanel key={tab.id} id={tab.id}>
                        {selectedTab === tab.id && (
                          <Suspense fallback={null}>
                            <Contribution />
                          </Suspense>
                        )}
                      </TabPanel>
                    );
                  })}
                </Tabs>
              ) : (
                overviewContent
              )}
            </>
          )}
        {validDefinitionEntity && entity && (
          <UnregisterEntityDialog
            open={deleteOpen}
            entity={entity}
            onConfirm={handleDeleteConfirm}
            onClose={() => setDeleteOpen(false)}
          />
        )}
        <EEBuildDialog
          open={buildFlow.dialogOpen}
          entity={buildFlow.buildEntity}
          scmToken={buildFlow.scmToken}
          scmProvider={buildFlow.scmProvider}
          onClose={buildFlow.closeDialog}
        />
      </Flex>
    </div>
  );
}

/** Catalog entity view reached only through an explicit definition-entity reference. */
export function DefinitionFileDetailsPage(): ReactElement {
  return (
    <NotificationProvider>
      <DefinitionFileDetailsContent />
    </NotificationProvider>
  );
}
