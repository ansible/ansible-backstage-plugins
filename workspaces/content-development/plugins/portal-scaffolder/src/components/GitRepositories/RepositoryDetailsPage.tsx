import {
  useNativeEntityPage,
  NativeEntityActionMenu,
} from '@ansible/portal-extension-host/alpha';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Menu as MuiMenu, MenuItem as MuiMenuItem } from '@material-ui/core';
import {
  Alert,
  Box,
  Button,
  Container,
  Flex,
  Header,
  Menu,
  MenuItem,
  MenuTrigger,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@backstage/ui';
import { EmptyStateView } from '@ansible/portal-plugin-sdk';
import SearchIcon from '@material-ui/icons/Search';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
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
import { gitRepositoriesViewPermission } from '@ansible/aap-common/permissions';
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
  ExtensionActionMenuItem,
} from '../../extensions/ExtensionRenderer';
import { RepositoryBreadcrumbs } from './RepositoryBreadcrumbs';
import { RepositoryAboutCard } from './RepositoryAboutCard';
import { RepositoryReadmeCard } from './RepositoryReadmeCard';
import { RepositoriesCIActivityTab } from './RepositoriesCIActivityTab';
import { RepositoryCollectionsTab } from './RepositoryCollectionsTab';
import { getSourceUrl } from '../CollectionsCatalog/utils';
import { rootRouteRef } from '../../routes';
import { buildRawReadmeFetchUrl } from './scmUtils';
import {
  fetchGitFileContentFromBackend,
  ScmIntegrationAuthError,
} from '../common';

const TAB_OVERVIEW = 'overview';
const TAB_CI_ACTIVITY = 'ci-activity';
const TAB_COLLECTIONS = 'collections';

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
  const [selectedTabKey, setSelectedTabKey] = useState(TAB_OVERVIEW);
  const [searchParams, setSearchParams] = useSearchParams();
  const [scmIntegrationAuthError, setScmIntegrationAuthError] = useState(false);
  const [legacyActionsAnchorEl, setLegacyActionsAnchorEl] =
    useState<null | HTMLElement>(null);
  const legacyActionsButtonRef = useRef<HTMLButtonElement>(null);

  const catalogHref = `${rootLink()}/repositories/catalog`;

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
  const extensionTabsRef = useRef(legacyExtensionTabs);
  const selectNativeTab = useCallback((index: number) => {
    const entry = extensionTabsRef.current[index];
    if (entry) setSelectedTabKey(entry.id);
  }, []);
  const native = useNativeEntityPage(
    entity,
    CONTENT_TYPES.PLAYBOOK_REPOSITORY,
    selectNativeTab,
  );
  const extensionTabs = native?.tabs ?? legacyExtensionTabs;
  extensionTabsRef.current = extensionTabs;
  const hasNativeContributions = Boolean(native);

  useEffect(() => {
    if (!hasNativeContributions) return;
    const id = searchParams.get('tab');
    if (!id) return;
    const match = extensionTabs.find(item => item.id === id);
    setSelectedTabKey(match ? id : TAB_OVERVIEW);
  }, [searchParams, extensionTabs, hasNativeContributions]);

  const extensionCards = native?.cards ?? legacyExtensionCards;
  const extensionActions = native ? [] : legacyExtensionActions;

  const collectionsTabLabel = useMemo(() => {
    const collectionCount =
      (entity?.spec as { repository_collection_count?: number })
        ?.repository_collection_count ?? 0;
    return collectionCount > 0
      ? `Collections (${collectionCount})`
      : 'Collections';
  }, [entity]);

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
    navigate(catalogHref);
  }, [navigate, catalogHref]);

  const handleViewSource = useCallback(() => {
    if (!entity) return;
    const url = getSourceUrl(entity);
    if (url) {
      globalThis.open(url, '_blank');
    }
  }, [entity]);

  const hasSourceUrl = Boolean(entity && getSourceUrl(entity));
  const showLegacyActionsMenu =
    !native && (hasSourceUrl || extensionActions.length > 0);
  const legacyExtensionActionsInMenu = extensionActions.length > 0;

  const handleTabChange = useCallback(
    (key: string | number | null) => {
      if (typeof key !== 'string') return;
      setSelectedTabKey(key);
      if (native) {
        const params = new URLSearchParams(searchParams);
        const isExtensionTab = extensionTabs.some(entry => entry.id === key);
        if (isExtensionTab) {
          params.set('tab', key);
        } else {
          params.delete('tab');
        }
        setSearchParams(params);
      }
    },
    [extensionTabs, native, searchParams, setSearchParams],
  );

  const handleSubjectRemoved = useCallback(() => {
    apiHolder.get(gitRepositoriesCatalogApiRef)?.invalidateCatalogCache();
    navigate(`${catalogHref}?refresh=true`);
  }, [apiHolder, catalogHref, navigate]);

  const displayName =
    (entity?.spec as { repository_name?: string })?.repository_name ??
    entity?.metadata?.title ??
    repositoryName ??
    'Repository';

  // DEV ONLY — remove before merge. Makes “am I on the new L4 BUI Details?” obvious.
  const showAap101659DevBanner = process.env.NODE_ENV === 'development';
  const aap101659DevBanner = showAap101659DevBanner ? (
    <Alert
      status="warning"
      title="AAP-101659 NEW — L4 BUI Details (branch aap-101659-git-repo-details-bui-l4)"
      description="You are on the new implementation. Shell + Overview + CI Activity + Collections tab bodies = BUI. Violations/Dependencies stay extension slots. Extension/native action menus may still use MUI host widgets."
    />
  ) : null;

  const pageShell = (children: ReactNode) => (
    <Container>
      <Flex direction="column" gap="3" p="4">
        {aap101659DevBanner}
        {children}
      </Flex>
    </Container>
  );

  const renderLegacyActionsMenu = () => {
    if (!showLegacyActionsMenu) return null;
    if (legacyExtensionActionsInMenu) {
      // portal-extension-host renders MUI MenuItem nodes for contributed actions.
      return (
        <>
          <Button
            ref={legacyActionsButtonRef}
            variant="primary"
            onPress={() =>
              setLegacyActionsAnchorEl(legacyActionsButtonRef.current)
            }
          >
            Actions
          </Button>
          <MuiMenu
            anchorEl={legacyActionsAnchorEl}
            open={Boolean(legacyActionsAnchorEl)}
            onClose={() => setLegacyActionsAnchorEl(null)}
            keepMounted
          >
            {hasSourceUrl && (
              <MuiMenuItem
                onClick={() => {
                  handleViewSource();
                  setLegacyActionsAnchorEl(null);
                }}
              >
                <OpenInNewIcon fontSize="small" style={{ marginRight: 8 }} />
                View in source
              </MuiMenuItem>
            )}
            {extensionActions.map(contribution => (
              <ExtensionActionMenuItem
                key={contribution.id}
                contribution={contribution}
                entity={entity as Entity}
                onMenuClose={() => setLegacyActionsAnchorEl(null)}
                onSuccess={result => {
                  if (
                    typeof result === 'object' &&
                    result !== null &&
                    'subjectRemoved' in result &&
                    result.subjectRemoved === true
                  ) {
                    handleSubjectRemoved();
                  }
                }}
              />
            ))}
          </MuiMenu>
        </>
      );
    }
    return (
      <MenuTrigger>
        <Button variant="primary">Actions</Button>
        <Menu>
          {hasSourceUrl && (
            <MenuItem onAction={handleViewSource}>View in source</MenuItem>
          )}
        </Menu>
      </MenuTrigger>
    );
  };

  const headerActions = (
    <Flex align="center" gap="2">
      {renderLegacyActionsMenu()}
      {native && (
        <NativeEntityActionMenu
          contributions={native}
          onSubjectRemoved={handleSubjectRemoved}
        />
      )}
    </Flex>
  );

  if (loading) {
    return pageShell(<Text role="status">Loading...</Text>);
  }

  if (!entity) {
    return pageShell(
      <>
        <RepositoryBreadcrumbs
          repositoryName={repositoryName ?? 'Unknown'}
          onNavigateToCatalog={handleNavigateToCatalog}
          catalogHref={catalogHref}
        />
        <EmptyStateView
          title="Repository not found"
          description="The requested repository is not available in the catalog."
          icon={<SearchIcon fontSize="inherit" />}
        />
      </>,
    );
  }

  if (scmIntegrationAuthError) {
    return pageShell(
      <>
        <RepositoryBreadcrumbs
          repositoryName={displayName}
          onNavigateToCatalog={handleNavigateToCatalog}
          catalogHref={catalogHref}
        />
        <ScmIntegrationAuthError resourceLabel="repository" />
      </>,
    );
  }

  return pageShell(
    <Flex direction="column" gap="4">
      <Header
        title={displayName}
        description={entity.metadata?.description}
        customActions={headerActions}
        breadcrumbs={[
          { label: 'Repositories', href: catalogHref },
          { label: displayName, href: '#' },
        ]}
      />

      <Tabs selectedKey={selectedTabKey} onSelectionChange={handleTabChange}>
        <TabList aria-label="Repository details">
          <Tab id={TAB_OVERVIEW}>Overview</Tab>
          {extensionTabs.map(et => {
            const Icon = et.icon;
            return (
              <Tab key={et.id} id={et.id}>
                <Flex align="center" gap="1">
                  {Icon ? <Icon fontSize="small" /> : null}
                  {et.label}
                </Flex>
              </Tab>
            );
          })}
          <Tab id={TAB_CI_ACTIVITY}>CI Activity</Tab>
          <Tab id={TAB_COLLECTIONS}>{collectionsTabLabel}</Tab>
        </TabList>

        <TabPanel id={TAB_OVERVIEW}>
          <Flex
            align="start"
            direction={{ initial: 'column', lg: 'row' }}
            gap="4"
            mt="4"
          >
            <Box grow={1} minWidth="0">
              <Flex direction="column" gap="4">
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
              </Flex>
            </Box>
            <Flex direction="column" gap="4" style={{ width: 340, flexShrink: 0 }}>
              {extensionCards
                .filter(c => c.slot !== 'overview-left')
                .map(c => (
                  <ExtensionCardContent
                    key={c.id}
                    contribution={c}
                    entity={entity as Entity}
                  />
                ))}
              <RepositoryAboutCard
                entity={entity}
                onViewSource={handleViewSource}
                onNavigateToCollections={() => setSelectedTabKey(TAB_COLLECTIONS)}
              />
            </Flex>
          </Flex>
        </TabPanel>

        {extensionTabs.map(et => (
          <TabPanel key={et.id} id={et.id}>
            <Box mt="4">
              <ExtensionTabContent contribution={et} entity={entity} />
            </Box>
          </TabPanel>
        ))}

        <TabPanel id={TAB_CI_ACTIVITY}>
          <Box mt="4">
            <RepositoriesCIActivityTab filterByEntity={entity} />
          </Box>
        </TabPanel>

        <TabPanel id={TAB_COLLECTIONS}>
          <Box mt="4">
            <EntityListProvider>
              <RepositoryCollectionsTab repositoryEntity={entity} />
            </EntityListProvider>
          </Box>
        </TabPanel>
      </Tabs>
    </Flex>,
  );
};

export const RepositoryDetailsPage = () => {
  return (
    <RequirePermission permission={gitRepositoriesViewPermission}>
      <RepositoryDetailsPageInner />
    </RequirePermission>
  );
};