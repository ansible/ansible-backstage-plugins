import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import SyncIcon from '@material-ui/icons/Sync';
import {
  Box,
  Button,
  ButtonLink,
  Flex,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@backstage/ui';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { usePermission } from '@backstage/plugin-permission-react';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import { useNativeCatalogTabs } from '@ansible/portal-extension-host/alpha';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '@ansible/portal-plugin-sdk';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import { ImageSyncDialog } from './catalog/ImageSyncDialog';
import { useRouteRef } from '@backstage/core-plugin-api';
import { eeDetailsRouteRef, eeRouteRef } from '../../routes';
import { DefinitionFilesCatalogPage } from './DefinitionFilesCatalogPage';
import { ImagesCatalogPage } from './ImagesCatalogPage';
import { PageHeaderSection } from '../common';
import styles from './EECatalogPage.module.css';

export type EECatalogView = 'images' | 'catalog';

/** Panel shared by the native SDK contribution and the legacy-host fallback. */
export function ImagesTabContent(): ReactElement {
  return <ImagesCatalogPage showHeader={false} wrapInContainer={false} />;
}

/** Shared EE catalog shell keeps each prototype tab addressable by its route. */
function EETabs({ view }: { view: EECatalogView }): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const eeBase = useRouteRef(eeRouteRef)();
  const detailLink = useRouteRef(eeDetailsRouteRef);
  const [searchParams] = useSearchParams();
  const catalogContext = useMemo(
    () => ({
      contentType: CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE,
      entityDetailPath: (
        name: string,
        entryPointId?: string,
        filters?: Record<string, string>,
      ) => {
        const params = new URLSearchParams(filters);
        if (entryPointId) params.set('tab', entryPointId);
        const query = params.toString();
        return `${detailLink({ ref: encodeURIComponent(name) })}${
          query ? `?${query}` : ''
        }`;
      },
    }),
    [detailLink],
  );
  const nativeTabs = useNativeCatalogTabs(catalogContext);
  // No native contribution provider in the legacy app: retain its Images panel.
  const contributedTabs = nativeTabs ?? [
    {
      id: 'automation-content.discovery.images-tab',
      label: 'Images',
      component: ImagesTabContent,
    },
  ];
  const tabs = [
    ...contributedTabs.map(tab => ({
      ...tab,
      id:
        tab.id === 'automation-content.discovery.images-tab'
          ? 'images'
          : tab.id,
    })),
    {
      id: 'catalog',
      label: 'Definition files',
      component: DefinitionFilesCatalogPage,
    },
  ];
  const requestedTab = searchParams.get('catalogTab');
  const selectedTab =
    view === 'images' &&
    requestedTab &&
    tabs.some(tab => tab.id === requestedTab)
      ? requestedTab
      : view;
  const { notifications, removeNotification } = useNotifications();
  const { allowed: canSync } = usePermission({
    permission: automationContentSyncPermission,
  });
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  useEffect(() => {
    const tabIndex = (location.state as { tabIndex?: number })?.tabIndex;
    const path =
      tabIndex === undefined ? undefined : ['images', 'catalog'][tabIndex];
    if (path) navigate(`${eeBase}/${path}`, { replace: true, state: {} });
  }, [location.state, navigate, eeBase]);

  return (
    <Box className={styles.pageFrame} data-testid="ee-catalog-frame">
      <Box className={styles.pageSurface} data-testid="ee-catalog-surface">
        <Flex
          direction="column"
          gap="4"
          px="5"
          py="3"
          className={styles.pageContent}
        >
          <NotificationStack
            notifications={notifications}
            onClose={removeNotification}
          />
          <PageHeaderSection
            title="Execution Environments"
            description="Browse and manage execution environment images and definition files, or create a new EE definition for your automation workflows."
            tooltip="Execution environment images and definition files available to the portal."
            actions={
              <>
                <ButtonLink href="/create" variant="primary">
                  Create
                </ButtonLink>
                {canSync && (
                  <Flex align="center" gap="2">
                    <Button
                      variant="secondary"
                      iconStart={<SyncIcon />}
                      onPress={() => setSyncDialogOpen(true)}
                    >
                      Sync registries
                    </Button>
                  </Flex>
                )}
              </>
            }
          />
          <Tabs
            selectedKey={selectedTab}
            onSelectionChange={key => {
              if (key === 'images' || key === 'catalog') {
                navigate(`${eeBase}/${key}`);
              } else {
                navigate(
                  `${eeBase}/images?${new URLSearchParams({
                    catalogTab: String(key),
                  })}`,
                );
              }
            }}
          >
            <TabList aria-label="Execution environment catalogs">
              {tabs.map(tab => (
                <Tab key={tab.id} id={tab.id}>
                  {tab.label}
                </Tab>
              ))}
            </TabList>
            {tabs.map(tab => (
              <TabPanel key={tab.id} id={tab.id}>
                {selectedTab === tab.id && (
                  <Suspense fallback={null}>
                    <tab.component key={syncVersion} />
                  </Suspense>
                )}
              </TabPanel>
            ))}
          </Tabs>
          <ImageSyncDialog
            open={syncDialogOpen}
            onClose={() => setSyncDialogOpen(false)}
            onSynced={() => {
              setSyncVersion(version => version + 1);
            }}
          />
        </Flex>
      </Box>
    </Box>
  );
}

/** Route-bound port of the prototype tab view. */
export function EECatalogPage({ view }: { view: EECatalogView }): ReactElement {
  return (
    // Route-owned main landmark; see EEDetailsPage for the rationale.
    <main>
      <NotificationProvider>
        <EETabs view={view} />
      </NotificationProvider>
    </main>
  );
}
