import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Typography, Tab, Tabs } from '@material-ui/core';
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
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';

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
  EmptyState,
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

  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);
  const [readmeContent, setReadmeContent] = useState('');
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const [scmIntegrationAuthError, setScmIntegrationAuthError] = useState(false);

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
        <EmptyState />
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
          >
            View in source
          </Button>
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        className={classes.detailsTabs}
      >
        <Tab label="Overview" />
        <Tab label="CI Activity" />
        <Tab label="Collections" />
      </Tabs>

      {tab === 0 && (
        <Box className={classes.detailsContent}>
          <Box className={classes.detailsLeftColumn}>
            <RepositoryReadmeCard
              readmeContent={readmeContent}
              isLoading={readmeLoading}
            />
          </Box>
          <Box className={classes.detailsRightColumn}>
            <RepositoryAboutCard
              entity={entity}
              onViewSource={handleViewSource}
              onNavigateToCollections={() => setTab(2)}
            />
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
