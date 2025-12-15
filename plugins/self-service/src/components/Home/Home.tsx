import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  makeStyles,
  Snackbar,
  Tooltip,
  Typography,
} from '@material-ui/core';
import { Content, Header, HeaderLabel, Page } from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  CatalogFilterLayout,
  EntityKindPicker,
  EntityListProvider,
  EntityOwnerPicker,
  EntitySearchBar,
  EntityTagPicker,
  UserListPicker,
} from '@backstage/plugin-catalog-react';
import {
  TemplateCategoryPicker,
  TemplateGroups,
} from '@backstage/plugin-scaffolder-react/alpha';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';

import { WizardCard } from './TemplateCard';
import { rootRouteRef } from '../../routes';
import { ansibleApiRef, rhAapAuthApiRef } from '../../apis';
import { SyncConfirmationDialog } from './SyncConfirmationDialog';
import Sync from '@material-ui/icons/Sync';
import Info from '@material-ui/icons/Info';
import OpenInNew from '@material-ui/icons/OpenInNew';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { SkeletonLoader } from './SkeletonLoader';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';

const headerStyles = makeStyles(theme => ({
  header_title_color: {
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
  },
  header_subtitle: {
    display: 'inline-block',
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
    opacity: 0.8,
    maxWidth: '75ch',
    marginTop: '8px',
    fontWeight: 500,
    lineHeight: 1.57,
  },
}));

export const HomeComponent = () => {
  const classes = headerStyles();
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
  const ansibleApi = useApi(ansibleApiRef);
  const rhAapAuthApi = useApi(rhAapAuthApiRef);
  const scaffolderApi = useApi(scaffolderApiRef);
  const { allowed } = usePermission({
    permission: catalogEntityCreatePermission,
  });
  const [open, setOpen] = useState(false);
  const [syncOptions, setSyncOptions] = useState<string[]>([]);
  const [showSnackbar, setShowSnackbar] = useState<boolean>(false);
  const [snackbarMsg, setSnackbarMsg] = useState<string>('Sync failed');
  const [jobTemplates, setJobTemplates] = useState<
    { id: number; name: string }[]
  >([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<{
    orgsUsersTeams: { lastSync: string | null };
    jobTemplates: { lastSync: string | null };
  }>({
    orgsUsersTeams: { lastSync: null },
    jobTemplates: { lastSync: null },
  });

  const fetchSyncStatus = useCallback(async () => {
    try {
      const status = await ansibleApi.getSyncStatus();
      setSyncStatus(status);
    } catch {
      // Silently handle sync status fetch errors
      // The dialog will show "Never synced" as fallback
    }
  }, [ansibleApi]);

  const ShowSyncConfirmationDialog = () => {
    fetchSyncStatus();
    setOpen(true);
  };

  const handleSync = useCallback(async () => {
    let result = false;
    setSnackbarMsg('Starting sync...');
    setShowSnackbar(true);
    if (syncOptions.includes('orgsUsersTeams')) {
      result = await ansibleApi.syncOrgsUsersTeam();
      if (result) {
        setSnackbarMsg('Organizations, Users and Teams synced successfully');
        fetchSyncStatus();
      } else {
        setSnackbarMsg('Organizations, Users and Teams sync failed');
      }
      setShowSnackbar(true);
    }
    if (syncOptions.includes('templates')) {
      result = await ansibleApi.syncTemplates();
      setShowSnackbar(false);
      if (result) {
        setSnackbarMsg('Templates synced successfully');
        fetchSyncStatus();
      } else {
        setSnackbarMsg('Templates sync failed');
      }
      setShowSnackbar(true);
    }
    setSyncOptions([]);
  }, [ansibleApi, syncOptions, fetchSyncStatus]);

  const handleClose = (newSyncOptions?: string[]) => {
    setOpen(false);

    if (newSyncOptions) {
      setSyncOptions(newSyncOptions);
    }
  };

  useEffect(() => {
    rhAapAuthApi.getAccessToken().then(token => {
      if (scaffolderApi.autocomplete) {
        scaffolderApi
          .autocomplete({
            token,
            resource: 'job_templates',
            provider: 'aap-api-cloud',
            context: {},
          })
          .then(({ results }) =>
            setJobTemplates(
              results.map(result => ({
                id: parseInt(result.id, 10),
                name: result.title as string,
              })),
            ),
          )
          .finally(() => setLoading(false));
      }
    });
  }, [scaffolderApi, rhAapAuthApi]);

  useEffect(() => {
    if (syncOptions.length > 0) {
      handleSync();
    }
  }, [syncOptions, handleSync]);

  return (
    <Page themeId="app">
      {open && (
        <SyncConfirmationDialog
          id="sync-menu"
          keepMounted
          open={open}
          onClose={handleClose}
          value={syncOptions}
          syncStatus={syncStatus}
        />
      )}
      <Header
        pageTitleOverride="View Templates"
        title={<span className={classes.header_title_color}>Templates</span>}
        subtitle={
          <>
            <div>
              <span className={classes.header_subtitle}>
                Browse available templates. Each template provides a guided
                experience to get your automation running. Select "Start" to
                begin the guided task.
              </span>
            </div>
            <Typography
              component="a"
              href="https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html/using_self-service_automation_portal/self-service-working-templates_aap-self-service-using#self-service-launch-template_self-service-working-templates"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                cursor: 'pointer',
                color: 'inherit',
                textDecoration: 'underline',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '8px',
                opacity: 0.8,
              }}
            >
              Learn more <OpenInNew fontSize="small" />
            </Typography>
            {allowed && (
              <HeaderLabel
                label=""
                value={
                  <Typography
                    component="a"
                    onClick={ShowSyncConfirmationDialog}
                    style={{ cursor: 'pointer', color: 'inherit' }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        textDecoration: 'underline',
                      }}
                    >
                      Sync now <Sync fontSize="small" />
                      <Tooltip title="Sync AAP Job Templates, Organizations, Users, and Teams from AAP to automation portal.">
                        <Info fontSize="small" style={{ marginLeft: '4px' }} />
                      </Tooltip>
                    </span>
                  </Typography>
                }
                contentTypograpyRootComponent="span"
              />
            )}
          </>
        }
        style={{ background: 'inherit' }}
      >
        {allowed && (
          <Button
            data-testid="add-template-button"
            onClick={() => navigate(`${rootLink()}/catalog-import`)}
            variant="contained"
          >
            Add Template
          </Button>
        )}
      </Header>
      <Content>
        <EntityListProvider>
          <CatalogFilterLayout>
            <CatalogFilterLayout.Filters>
              <div data-testid="search-bar-container">
                <EntitySearchBar />
              </div>
              <EntityKindPicker initialFilter="template" hidden />
              <div data-testid="user-picker-container">
                <UserListPicker
                  initialFilter="all"
                  availableFilters={['all', 'starred']}
                />
              </div>
              <div data-testid="categories-picker">
                <TemplateCategoryPicker />
              </div>
              <EntityTagPicker />
              <EntityOwnerPicker />
            </CatalogFilterLayout.Filters>
            <CatalogFilterLayout.Content>
              {loading ? (
                <div
                  data-testid="loading-templates"
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    width: '100%',
                    gap: '10px',
                  }}
                >
                  {Array.from({ length: 3 }).map((_, index) => (
                    <SkeletonLoader key={`skeleton-${index}`} />
                  ))}
                </div>
              ) : (
                <div data-testid="templates-container">
                  <TemplateGroups
                    groups={[
                      {
                        filter: (entity: TemplateEntityV1beta3) => {
                          const hasExecutionEnvironmentType =
                            entity.spec?.type?.includes(
                              'execution-environment',
                            ) ?? false;
                          if (hasExecutionEnvironmentType) {
                            return false;
                          }
                          return jobTemplates.some(({ id }) =>
                            entity.metadata.aapJobTemplateId
                              ? id === entity.metadata.aapJobTemplateId
                              : true,
                          );
                        },
                      },
                    ]}
                    TemplateCardComponent={WizardCard}
                  />
                </div>
              )}
            </CatalogFilterLayout.Content>
          </CatalogFilterLayout>
        </EntityListProvider>
      </Content>
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={showSnackbar}
        onClose={() => setShowSnackbar(false)}
        autoHideDuration={3000}
        message={snackbarMsg}
        style={{ zIndex: 10000, marginTop: '70px' }}
      />
    </Page>
  );
};
