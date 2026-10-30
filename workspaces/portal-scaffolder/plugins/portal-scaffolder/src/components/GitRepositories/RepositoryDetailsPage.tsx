import {
  useNativeEntityPage,
  NativeEntityActionMenu,
} from '@ansible/portal-extension-host/alpha';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Typography, Tab, Tabs } from '@material-ui/core';
import { EmptyStateView } from '@ansible/portal-plugin-sdk';
import SearchIcon from '@material-ui/icons/Search';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import { Entity } from '@backstage/catalog-model';
import {
  catalogApiRef,
  EntityListProvider,
} from '@backstage/plugin-catalog-react';
import {
  useApi,
  useRouteRef,
  discoveryApiRef,
  fetchApiRef,
  type DiscoveryApi,
  type FetchApi,
} from '@backstage/core-plugin-api';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';
import { gitRepositoriesCatalogApiRef } from '@ansible/backstage-rhaap-common/gitRepositoriesCatalog';
import { useApiHolder } from '@backstage/core-plugin-api';
import {
  useExtensionTabs,
  useExtensionCards,
  useExtensionActions,
  EXTENSION_POINTS,
  CONTENT_TYPES,
} from '@ansible/portal-extension-api';

import {
  ExtensionTabContent,
  ExtensionCardContent,
  ExtensionActionMenu,
} from '../../extensions/ExtensionRenderer';
import { RepositoryBreadcrumbs } from './RepositoryBreadcrumbs';
import { RepositoryAboutCard } from './RepositoryAboutCard';
import { RepositoryReadmeCard } from './RepositoryReadmeCard';
import { RepositoriesCIActivityTab } from './RepositoriesCIActivityTab';
import { CollectionsListPage } from '../CollectionsCatalog/CollectionsListPage';
import { useCollectionsStyles } from '../CollectionsCatalog/styles';
import { getSourceUrl } from '../CollectionsCatalog/utils';
import { rootRouteRef } from '../../routes';
import { buildRawReadmeFetchUrl } from './scmUtils';
import {
  fetchGitFileContentFromBackend,
  ScmIntegrationAuthError,
} from '../common';

type ReadmeStateSetters = {
  setReadmeContent: (value: string) => void;
  setReadmeLoading: (value: boolean) => void;
  setScmIntegrationAuthError: (value: boolean) => void;
};

type BackendReadmePlan = {
  kind: 'backend';
  scmProvider: string;
  scmHost: string;
  scmOrg: string;
  scmRepo: string;
  filePath: string;
  gitRef: string;
};

type DirectReadmePlan = {
  kind: 'direct';
  defaultBranch: string;
  filePath: string;
};

function resolveReadmeLoadPlan(
  entity: Entity,
): BackendReadmePlan | DirectReadmePlan {
  const annotations = entity.metadata?.annotations || {};
  const spec = (entity.spec || {}) as { repository_default_branch?: string };
  const scmProvider = (annotations['ansible.io/scm-provider'] ?? '')
    .toString()
    .toLowerCase();
  const scmHost = annotations['ansible.io/scm-host'];
  const scmOrg = annotations['ansible.io/scm-organization'];
  const scmRepo = annotations['ansible.io/scm-repository'];
  const defaultBranch = spec.repository_default_branch || 'main';
  const filePath = 'README.md';

  const canUseBackend =
    ['github', 'gitlab'].includes(scmProvider) &&
    scmHost &&
    scmOrg &&
    scmRepo &&
    defaultBranch;

  if (canUseBackend) {
    return {
      kind: 'backend',
      scmProvider,
      scmHost: String(scmHost),
      scmOrg: String(scmOrg),
      scmRepo: String(scmRepo),
      filePath,
      gitRef: defaultBranch,
    };
  }
  return { kind: 'direct', defaultBranch, filePath };
}

function startBackendReadmeFetch(
  plan: BackendReadmePlan,
  discoveryApi: DiscoveryApi,
  fetchApi: FetchApi,
  isCancelled: () => boolean,
  setters: ReadmeStateSetters,
): void {
  const { setReadmeContent, setReadmeLoading, setScmIntegrationAuthError } =
    setters;

  fetchGitFileContentFromBackend(discoveryApi, fetchApi, {
    scmProvider: plan.scmProvider,
    scmHost: plan.scmHost,
    scmOrg: plan.scmOrg,
    scmRepo: plan.scmRepo,
    filePath: plan.filePath,
    gitRef: plan.gitRef,
  })
    .then(outcome => {
      if (isCancelled()) return;
      if (outcome.ok) {
        setReadmeContent(outcome.data);
        setScmIntegrationAuthError(false);
      } else if (outcome.reason === 'integration_auth') {
        setScmIntegrationAuthError(true);
      } else {
        setReadmeContent('');
        setScmIntegrationAuthError(false);
      }
    })
    .catch(() => {
      if (isCancelled()) return;
      setReadmeContent('');
      setScmIntegrationAuthError(false);
    })
    .finally(() => {
      if (!isCancelled()) setReadmeLoading(false);
    });
}

function startDirectReadmeFetch(
  entity: Entity,
  plan: DirectReadmePlan,
  isCancelled: () => boolean,
  setters: ReadmeStateSetters,
): void {
  const { setReadmeContent, setReadmeLoading, setScmIntegrationAuthError } =
    setters;

  setScmIntegrationAuthError(false);

  const sourceUrl = getSourceUrl(entity);
  if (sourceUrl) {
    const fetchUrl = buildRawReadmeFetchUrl(
      sourceUrl,
      plan.defaultBranch,
      plan.filePath,
    );
    if (fetchUrl) {
      fetch(fetchUrl)
        .then(response => (response.ok ? response.text() : ''))
        .then(text => {
          if (!isCancelled()) setReadmeContent(text);
        })
        .catch(() => {
          if (!isCancelled()) setReadmeContent('');
        })
        .finally(() => {
          if (!isCancelled()) setReadmeLoading(false);
        });
      return;
    }
    setReadmeContent('');
    setReadmeLoading(false);
    return;
  }
  setReadmeContent('');
  setReadmeLoading(false);
}

const RepositoryDetailsPageInner = () => {
  const classes = useCollectionsStyles();
  const navigate = useNavigate();
  const { repositoryName } = useParams<{ repositoryName: string }>();
  const catalogApi = useApi(catalogApiRef);
  const discoveryApi = useApi<DiscoveryApi>(discoveryApiRef);
  const fetchApi = useApi<FetchApi>(fetchApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const apiHolder = useApiHolder();

  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);
  const [readmeContent, setReadmeContent] = useState('');
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [scmIntegrationAuthError, setScmIntegrationAuthError] = useState(false);
  const GIT_REPO_BUILT_IN_TABS = 3; // Overview, CI Activity, Collections
  const selectNativeTab = useCallback(
    (index: number) => setTab(GIT_REPO_BUILT_IN_TABS + index),
    [],
  );
  const native = useNativeEntityPage(
    entity,
    CONTENT_TYPES.PLAYBOOK_REPOSITORY,
    selectNativeTab,
  );
  const legacyExtensionTabs = useExtensionTabs(
    EXTENSION_POINTS.GIT_REPO_DETAIL_TABS,
    entity ?? undefined,
    CONTENT_TYPES.PLAYBOOK_REPOSITORY,
  );
  const legacyExtensionCards = useExtensionCards(
    EXTENSION_POINTS.GIT_REPO_DETAIL_CARDS,
    entity ?? undefined,
    CONTENT_TYPES.PLAYBOOK_REPOSITORY,
  );
  const legacyExtensionActions = useExtensionActions(
    EXTENSION_POINTS.GIT_REPO_DETAIL_ACTIONS,
    entity ?? undefined,
    CONTENT_TYPES.PLAYBOOK_REPOSITORY,
  );
  const extensionTabs = native?.tabs ?? legacyExtensionTabs;
  const hasNativeContributions = Boolean(native);
  useEffect(() => {
    if (!hasNativeContributions) return;
    const id = searchParams.get('tab');
    if (!id) return;
    const index = extensionTabs.findIndex(item => item.id === id);
    setTab(index >= 0 ? GIT_REPO_BUILT_IN_TABS + index : 0);
  }, [searchParams, extensionTabs, hasNativeContributions]);
  const extensionCards = native?.cards ?? legacyExtensionCards;
  const extensionActions = native ? [] : legacyExtensionActions;
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(
    null,
  );

  const fetchEntity = useCallback(() => {
    if (!repositoryName) return;

    setLoading(true);
    catalogApi
      .getEntities({
        filter: [
          {
            'metadata.name': repositoryName,
            kind: 'Component',
            'spec.type': 'git-repository',
          },
        ],
      })
      .then(response => {
        const items = Array.isArray(response) ? response : response.items || [];
        const first = items.length > 0 ? items[0] : null;
        setEntity(first);
      })
      .catch(() => {
        setEntity(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [catalogApi, repositoryName]);

  useEffect(() => {
    fetchEntity();
  }, [fetchEntity]);

  useEffect(() => {
    setScmIntegrationAuthError(false);
  }, [repositoryName]);

  useEffect(() => {
    if (!entity) {
      return () => {};
    }

    // Wait until catalog row matches the URL; fetchEntity does not clear `entity` before the next response.
    if (repositoryName && entity.metadata?.name !== repositoryName) {
      return () => {};
    }

    let cancelled = false;
    const isCancelled = () => cancelled;

    const plan = resolveReadmeLoadPlan(entity);
    setReadmeLoading(true);

    const setters: ReadmeStateSetters = {
      setReadmeContent,
      setReadmeLoading,
      setScmIntegrationAuthError,
    };

    if (plan.kind === 'backend') {
      startBackendReadmeFetch(
        plan,
        discoveryApi,
        fetchApi,
        isCancelled,
        setters,
      );
    } else {
      startDirectReadmeFetch(entity, plan, isCancelled, setters);
    }

    return () => {
      cancelled = true;
      setReadmeLoading(false);
    };
  }, [entity, discoveryApi, fetchApi, repositoryName]);

  const handleNavigateToCatalog = useCallback(() => {
    navigate(`${rootLink()}/repositories/catalog`);
  }, [navigate, rootLink]);

  const handleViewSource = useCallback(() => {
    if (!entity) return;
    const url = getSourceUrl(entity);
    if (url) {
      globalThis.open(url, '_blank');
    }
  }, [entity]);

  const hasSourceUrl = useCallback(() => {
    return entity ? Boolean(getSourceUrl(entity)) : false;
  }, [entity]);

  const displayName =
    (entity?.spec as { repository_name?: string })?.repository_name ??
    entity?.metadata?.title ??
    repositoryName ??
    'Repository';

  if (loading) {
    return (
      <Box className={classes.detailsContainer}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (!entity) {
    return (
      <Box className={classes.detailsContainer}>
        <RepositoryBreadcrumbs
          repositoryName={repositoryName ?? 'Unknown'}
          onNavigateToCatalog={handleNavigateToCatalog}
        />
        <EmptyStateView
          title="Repository not found"
          description="The requested repository is not available in the catalog."
          icon={<SearchIcon fontSize="inherit" />}
        />
      </Box>
    );
  }

  if (scmIntegrationAuthError) {
    return (
      <Box className={classes.detailsContainer}>
        <RepositoryBreadcrumbs
          repositoryName={displayName}
          onNavigateToCatalog={handleNavigateToCatalog}
        />
        <ScmIntegrationAuthError resourceLabel="repository" />
      </Box>
    );
  }

  return (
    <Box className={classes.detailsContainer}>
      <RepositoryBreadcrumbs
        repositoryName={displayName}
        onNavigateToCatalog={handleNavigateToCatalog}
      />

      <Box className={classes.detailsHeader}>
        <Box>
          <Typography className={classes.detailsTitleText}>
            {displayName}
          </Typography>
          {entity.metadata?.description && (
            <Typography className={classes.detailsDescription}>
              {entity.metadata.description}
            </Typography>
          )}
        </Box>
        {hasSourceUrl() && (
          <Button
            variant="outlined"
            color="primary"
            endIcon={<OpenInNewIcon />}
            onClick={handleViewSource}
            className={classes.syncButton}
            style={{ whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 24 }}
          >
            View in source
          </Button>
        )}
        {native && (
          <NativeEntityActionMenu
            contributions={native}
            onSubjectRemoved={() => {
              apiHolder
                .get(gitRepositoriesCatalogApiRef)
                ?.invalidateCatalogCache();
              navigate(`${rootLink()}/repositories/catalog?refresh=true`);
            }}
          />
        )}
        {extensionActions.length > 0 && entity && (
          <>
            <Button
              variant="outlined"
              color="primary"
              endIcon={<ArrowDropDownIcon />}
              onClick={e => setActionsAnchorEl(e.currentTarget)}
              className={classes.syncButton}
              style={{ whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8 }}
            >
              Actions
            </Button>
            <ExtensionActionMenu
              anchorEl={actionsAnchorEl}
              contributions={extensionActions}
              entity={entity as Entity}
              onClose={() => setActionsAnchorEl(null)}
              onSuccess={result => {
                if (
                  typeof result === 'object' &&
                  result !== null &&
                  'subjectRemoved' in result &&
                  result.subjectRemoved === true
                ) {
                  apiHolder
                    .get(gitRepositoriesCatalogApiRef)
                    ?.invalidateCatalogCache();
                  navigate(`${rootLink()}/repositories/catalog?refresh=true`);
                }
              }}
            />
          </>
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => {
          setTab(v);
          if (native) {
            const params = new URLSearchParams(searchParams);
            const entry = extensionTabs[v - GIT_REPO_BUILT_IN_TABS];
            if (entry) params.set('tab', entry.id);
            else params.delete('tab');
            setSearchParams(params);
          }
        }}
        className={classes.detailsTabs}
      >
        <Tab label="Overview" />
        <Tab label="CI Activity" />
        <Tab label="Collections" />
        {extensionTabs.map(et => {
          const Icon = et.icon;
          return (
            <Tab
              key={et.id}
              label={et.label}
              icon={Icon ? <Icon fontSize="small" /> : undefined}
            />
          );
        })}
      </Tabs>

      {tab === 0 && (
        <Box className={classes.detailsContent}>
          <Box className={classes.detailsLeftColumn}>
            <RepositoryReadmeCard
              readmeContent={readmeContent}
              isLoading={readmeLoading}
            />
            {extensionCards
              .filter(c => c.slot === 'overview-left')
              .map(c => (
                <ExtensionCardContent
                  key={c.id}
                  contribution={c}
                  entity={entity as Entity}
                />
              ))}
          </Box>
          <Box className={classes.detailsRightColumn}>
            <RepositoryAboutCard
              entity={entity}
              onViewSource={handleViewSource}
              onNavigateToCollections={() => setTab(2)}
            />
            {extensionCards
              .filter(c => c.slot !== 'overview-left')
              .map(c => (
                <ExtensionCardContent
                  key={c.id}
                  contribution={c}
                  entity={entity as Entity}
                />
              ))}
          </Box>
        </Box>
      )}

      {tab === 1 && (
        <Box
          className={classes.detailsContent}
          style={{ width: '100%', flex: 1 }}
        >
          <RepositoriesCIActivityTab filterByEntity={entity} />
        </Box>
      )}

      {tab === 2 && (
        <Box
          className={classes.detailsContent}
          style={{ width: '100%', flex: 1 }}
        >
          <EntityListProvider>
            <CollectionsListPage filterByRepositoryEntity={entity} />
          </EntityListProvider>
        </Box>
      )}

      {extensionTabs.map((et, i) =>
        tab === GIT_REPO_BUILT_IN_TABS + i ? (
          <ExtensionTabContent key={et.id} contribution={et} entity={entity} />
        ) : null,
      )}
    </Box>
  );
};

export const RepositoryDetailsPage = () => {
  return (
    <RequirePermission permission={gitRepositoriesViewPermission}>
      <RepositoryDetailsPageInner />
    </RequirePermission>
  );
};
