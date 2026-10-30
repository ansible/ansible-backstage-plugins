import {
  useNativeEntityPage,
  NativeEntityActionMenu,
} from '@ansible/portal-extension-host/alpha';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Typography, Tab, Tabs, Menu } from '@material-ui/core';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import { Entity } from '@backstage/catalog-model';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import {
  useApi,
  useRouteRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { collectionsViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import { CollectionBreadcrumbs } from './CollectionBreadcrumbs';
import { CollectionAboutCard } from './CollectionAboutCard';
import { CollectionResourcesCard } from './CollectionResourcesCard';
import { collectionReadmeFetchUrl } from './collectionResourceUrls';
import { CollectionReadmeCard } from './CollectionReadmeCard';
import { RepositoryBadge } from './RepositoryBadge';
import { useCollectionsStyles } from './styles';
import { rootRouteRef } from '../../routes';
import {
  CollectionsEmptyState,
  fetchGitFileContentFromBackend,
  ScmIntegrationAuthError,
} from '../common';
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

const CollectionDetailsPageInner = () => {
  const classes = useCollectionsStyles();
  const navigate = useNavigate();
  const { collectionName } = useParams<{ collectionName: string }>();
  const catalogApi = useApi(catalogApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const rootLink = useRouteRef(rootRouteRef);

  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);
  const [readmeContent, setReadmeContent] = useState<string>('');
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [isHtmlReadme, setIsHtmlReadme] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastFailedSync, setLastFailedSync] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState(0);
  const [scmIntegrationAuthError, setScmIntegrationAuthError] = useState(false);
  const COLLECTION_BUILT_IN_TABS = 1; // Overview
  const selectNativeTab = useCallback(
    (index: number) => setTab(COLLECTION_BUILT_IN_TABS + index),
    [],
  );
  const native = useNativeEntityPage(
    entity,
    CONTENT_TYPES.COLLECTION,
    selectNativeTab,
  );
  const legacyExtensionTabs = useExtensionTabs(
    EXTENSION_POINTS.COLLECTION_DETAIL_TABS,
    entity ?? undefined,
    CONTENT_TYPES.COLLECTION,
  );
  const legacyExtensionCards = useExtensionCards(
    EXTENSION_POINTS.COLLECTION_DETAIL_CARDS,
    entity ?? undefined,
    CONTENT_TYPES.COLLECTION,
  );
  const legacyExtensionActions = useExtensionActions(
    EXTENSION_POINTS.COLLECTION_DETAIL_ACTIONS,
    entity ?? undefined,
    CONTENT_TYPES.COLLECTION,
  );
  const extensionTabs = native?.tabs ?? legacyExtensionTabs;
  const extensionCards = native?.cards ?? legacyExtensionCards;
  const extensionActions = native ? [] : legacyExtensionActions;
  const [actionsAnchorEl, setActionsAnchorEl] = useState<null | HTMLElement>(
    null,
  );

  const fetchEntity = useCallback(() => {
    if (!collectionName) return;

    setLoading(true);
    catalogApi
      .getEntities({
        filter: [
          {
            'metadata.name': collectionName,
            kind: 'Component',
            'spec.type': 'ansible-collection',
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
  }, [catalogApi, collectionName]);

  useEffect(() => {
    fetchEntity();
  }, [fetchEntity]);

  useEffect(() => {
    setScmIntegrationAuthError(false);
  }, [collectionName]);

  useEffect(() => {
    if (!entity) return;

    const sourceId =
      entity.metadata?.annotations?.['ansible.io/discovery-source-id'];
    if (!sourceId) return;

    const fetchSyncStatus = async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('catalog');
        const response = await fetchApi.fetch(
          `${baseUrl}/ansible/sync/status?ansible_contents=true`,
        );
        if (response.ok) {
          const data = await response.json();
          const providers = data.content?.providers || [];
          const matchingSource = providers.find(
            (s: { sourceId: string }) => s.sourceId === sourceId,
          );
          if (matchingSource) {
            setLastSync(matchingSource.lastSyncTime ?? null);
            setLastFailedSync(matchingSource.lastFailedSyncTime ?? null);
          }
        }
      } catch {
        // Ignore errors
      }
    };

    void fetchSyncStatus();
  }, [entity, discoveryApi, fetchApi]);

  const parseReadmeFilePath = useCallback((readmeUrl: string): string => {
    try {
      const url = new URL(readmeUrl);
      const pathParts = url.pathname.split('/');
      const blobIndex = pathParts.indexOf('blob');
      if (blobIndex !== -1 && blobIndex + 2 < pathParts.length) {
        return pathParts.slice(blobIndex + 2).join('/');
      }
    } catch {
      // Fail silently
      // URL parsing failed
    }
    return '';
  }, []);

  useEffect(() => {
    if (!entity) return;

    const spec = entity.spec || {};
    const annotations = entity.metadata?.annotations || {};

    const collectionSource = annotations['ansible.io/collection-source'];
    const htmlReadme =
      typeof spec.collection_readme_html === 'string'
        ? spec.collection_readme_html
        : null;

    if (collectionSource === 'pah' && htmlReadme) {
      setReadmeContent(htmlReadme);
      setIsHtmlReadme(true);
      setReadmeLoading(false);
      setScmIntegrationAuthError(false);
      return;
    }

    setIsHtmlReadme(false);
    const readmeUrl =
      typeof spec.collection_readme_url === 'string'
        ? spec.collection_readme_url
        : null;

    if (!readmeUrl) {
      setReadmeContent('');
      setScmIntegrationAuthError(false);
      return;
    }

    const scmProvider = annotations['ansible.io/scm-provider'];
    const scmHost = annotations['ansible.io/scm-host'];
    const scmOrg = annotations['ansible.io/scm-organization'];
    const scmRepo = annotations['ansible.io/scm-repository'];
    const gitRef = annotations['ansible.io/ref'];
    const filePath = parseReadmeFilePath(readmeUrl);

    const canUseBackend =
      scmProvider && scmHost && scmOrg && scmRepo && gitRef && filePath;

    setReadmeLoading(true);

    if (canUseBackend) {
      fetchGitFileContentFromBackend(discoveryApi, fetchApi, {
        scmProvider,
        scmHost,
        scmOrg,
        scmRepo,
        filePath,
        gitRef,
      })
        .then(outcome => {
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
          setReadmeContent('');
          setScmIntegrationAuthError(false);
        })
        .finally(() => setReadmeLoading(false));
      return;
    }

    setScmIntegrationAuthError(false);

    fetch(collectionReadmeFetchUrl(readmeUrl))
      .then(response => (response.ok ? response.text() : ''))
      .then(setReadmeContent)
      .catch(() => setReadmeContent(''))
      .finally(() => setReadmeLoading(false));
  }, [entity, parseReadmeFilePath, discoveryApi, fetchApi]);

  const handleNavigateToCatalog = useCallback(() => {
    navigate(`${rootLink()}/collections`);
  }, [navigate, rootLink]);

  const handleViewSource = useCallback(() => {
    const annotations = entity?.metadata?.annotations || {};
    const collectionSource = annotations['ansible.io/collection-source'];

    let url: string | undefined;

    if (collectionSource === 'pah') {
      url = annotations['backstage.io/source-url'];
    } else {
      const sourceLocation = annotations['backstage.io/source-location'];
      if (sourceLocation) {
        url = sourceLocation.replace(/^url:/, '');
      }
    }
    if (url) {
      globalThis.open(url, '_blank');
    }
  }, [entity]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchEntity();
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [fetchEntity]);

  const hasSourceUrl = useCallback(() => {
    const annotations = entity?.metadata?.annotations || {};
    const collectionSource = annotations['ansible.io/collection-source'];
    if (collectionSource === 'pah') {
      return Boolean(annotations['backstage.io/source-url']);
    }
    return Boolean(annotations['backstage.io/source-location']);
  }, [entity]);

  const spec = entity?.spec || {};
  const collectionFullName =
    typeof spec.collection_full_name === 'string'
      ? spec.collection_full_name
      : entity?.metadata?.title || collectionName || 'Collection';

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
        <CollectionBreadcrumbs
          collectionName={collectionName || 'Unknown'}
          onNavigateToCatalog={handleNavigateToCatalog}
        />
        <CollectionsEmptyState />
      </Box>
    );
  }

  if (scmIntegrationAuthError) {
    return (
      <Box className={classes.detailsContainer}>
        <CollectionBreadcrumbs
          collectionName={collectionFullName}
          onNavigateToCatalog={handleNavigateToCatalog}
        />
        <ScmIntegrationAuthError resourceLabel="collection" />
      </Box>
    );
  }

  return (
    <Box className={classes.detailsContainer}>
      <CollectionBreadcrumbs
        collectionName={collectionFullName}
        onNavigateToCatalog={handleNavigateToCatalog}
      />

      <Box className={classes.detailsHeader}>
        <Box>
          <Box className={classes.titleWithBadge}>
            <Typography className={classes.detailsTitleText}>
              {collectionFullName}
            </Typography>
            <RepositoryBadge entity={entity} />
          </Box>
          {entity.metadata.description && (
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
            View Source
          </Button>
        )}
        {native && <NativeEntityActionMenu contributions={native} />}
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
            <Menu
              anchorEl={actionsAnchorEl}
              open={Boolean(actionsAnchorEl)}
              onClose={() => setActionsAnchorEl(null)}
            >
              {extensionActions.map(ea => (
                <ExtensionActionMenuItem
                  key={ea.id}
                  contribution={ea}
                  entity={entity as Entity}
                  onMenuClose={() => setActionsAnchorEl(null)}
                />
              ))}
            </Menu>
          </>
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        className={classes.detailsTabs}
      >
        <Tab label="Overview" />
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
            <CollectionReadmeCard
              readmeContent={readmeContent}
              isLoading={readmeLoading}
              isHtml={isHtmlReadme}
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
            <CollectionAboutCard
              entity={entity}
              lastSync={lastSync}
              lastFailedSync={lastFailedSync}
              onViewSource={handleViewSource}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
            />
            <CollectionResourcesCard entity={entity} />
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

      {extensionTabs.map((et, i) =>
        tab === COLLECTION_BUILT_IN_TABS + i ? (
          <ExtensionTabContent key={et.id} contribution={et} entity={entity} />
        ) : null,
      )}
    </Box>
  );
};

export const CollectionDetailsPage = () => {
  return (
    <RequirePermission permission={collectionsViewPermission}>
      <CollectionDetailsPageInner />
    </RequirePermission>
  );
};
