import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Typography, Tab, Tabs } from '@material-ui/core';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { Entity } from '@backstage/catalog-model';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

import { CollectionBreadcrumbs } from './CollectionBreadcrumbs';
import { CollectionAboutCard } from './CollectionAboutCard';
import { CollectionResourcesCard } from './CollectionResourcesCard';
import { CollectionReadmeCard } from './CollectionReadmeCard';
import { RepositoryBadge } from './RepositoryBadge';
import { useCollectionsStyles } from './styles';
import { EmptyState } from './EmptyState';

export const CollectionDetailsPage = () => {
  const classes = useCollectionsStyles();
  const navigate = useNavigate();
  const { collectionName } = useParams<{ collectionName: string }>();
  const catalogApi = useApi(catalogApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);
  const [readmeContent, setReadmeContent] = useState<string>('');
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [isHtmlReadme, setIsHtmlReadme] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastFailedSync, setLastFailedSync] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState(0);

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

    fetchSyncStatus();
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

  const fetchReadmeFromBackend = useCallback(
    async (
      scmProvider: string,
      scmHost: string,
      scmOrg: string,
      scmRepo: string,
      filePath: string,
      gitRef: string,
    ): Promise<string> => {
      const baseUrl = await discoveryApi.getBaseUrl('catalog');
      const params = new URLSearchParams({
        scmProvider,
        host: scmHost,
        owner: scmOrg,
        repo: scmRepo,
        filePath,
        ref: gitRef,
      });

      const response = await fetchApi.fetch(
        `${baseUrl}/git_readme_content?${params}`,
      );
      if (response.ok) {
        return response.text();
      }
      return '';
    },
    [discoveryApi, fetchApi],
  );

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
      return;
    }

    setIsHtmlReadme(false);
    const readmeUrl =
      typeof spec.collection_readme_url === 'string'
        ? spec.collection_readme_url
        : null;

    if (!readmeUrl) {
      setReadmeContent('');
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
      fetchReadmeFromBackend(
        scmProvider,
        scmHost,
        scmOrg,
        scmRepo,
        filePath,
        gitRef,
      )
        .then(setReadmeContent)
        .catch(() => setReadmeContent(''))
        .finally(() => setReadmeLoading(false));
      return;
    }

    let fetchUrl = readmeUrl;
    if (
      readmeUrl.includes('github.com') &&
      !readmeUrl.includes('raw.githubusercontent.com')
    ) {
      fetchUrl = readmeUrl
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/');
    } else if (readmeUrl.includes('gitlab') && !readmeUrl.includes('/raw/')) {
      fetchUrl = readmeUrl.replace('/-/blob/', '/-/raw/');
    }

    fetch(fetchUrl)
      .then(response => (response.ok ? response.text() : ''))
      .then(setReadmeContent)
      .catch(() => setReadmeContent(''))
      .finally(() => setReadmeLoading(false));
  }, [entity, parseReadmeFilePath, fetchReadmeFromBackend]);

  const handleNavigateToCatalog = useCallback(() => {
    navigate('/self-service/collections');
  }, [navigate]);

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
        <EmptyState />
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
          >
            View Source
          </Button>
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        className={classes.detailsTabs}
      >
        <Tab label="Overview" />
      </Tabs>

      {tab === 0 && (
        <Box className={classes.detailsContent}>
          <Box className={classes.detailsLeftColumn}>
            <CollectionReadmeCard
              readmeContent={readmeContent}
              isLoading={readmeLoading}
              isHtml={isHtmlReadme}
            />
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
          </Box>
        </Box>
      )}
    </Box>
  );
};
