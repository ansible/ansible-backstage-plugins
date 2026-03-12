import { Box, IconButton, Tabs, Tab } from '@material-ui/core';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import {
  catalogApiRef,
  UnregisterEntityDialog,
} from '@backstage/plugin-catalog-react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { Header } from './Header';
import { BreadcrumbsNavigation } from './BreadcrumbsNavigation';
import { MenuPopover } from './MenuPopover';
import { LinksCard } from './LinksCard';
import { AboutCard } from './AboutCard';
import { ReadmeCard } from './ReadmeCard';
import { EntityNotFound } from './EntityNotFound';
import { createTarArchive } from '../../utils/tarArchiveUtils';

export const EEDetailsPage: React.FC = () => {
  const { templateName } = useParams<{ templateName: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => setAnchorEl(null);
  const catalogApi = useApi(catalogApiRef);
  const [entity, setEntity] = useState<any | null>(false);
  const [menuid, setMenuId] = useState<string>('');
  const [defaultReadme, setDefaultReadme] = useState<string>('');
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ownerName, setOwnerName] = useState<string | null>(null);

  const getOwnerName = useCallback(async () => {
    if (!entity?.spec?.owner) return 'Unknown';
    const ownerEntity = await catalogApi.getEntityByRef(entity?.spec?.owner);
    // precedence: title >> name >> user reference >> unknown
    return (
      ownerEntity?.metadata?.title ??
      ownerEntity?.metadata?.name ??
      entity?.spec?.owner ??
      'Unknown'
    );
  }, [entity, catalogApi]);

  useEffect(() => {
    getOwnerName().then(name => setOwnerName(name));
  }, [getOwnerName]);

  const callApi = useCallback(() => {
    catalogApi
      .getEntities({
        filter: [
          {
            'metadata.name': templateName ?? '',
            kind: 'Component',
            'spec.type': 'execution-environment',
          },
        ],
      })
      .then(entities => {
        // entities might be an array or { items: [] }
        const items = Array.isArray(entities)
          ? entities
          : entities?.items || [];
        const first = items && items.length > 0 ? items[0] : null;
        setEntity(first);
      })
      .catch(() => {
        setEntity(null);
      });
  }, [catalogApi, templateName]);

  useEffect(() => {
    callApi();
  }, [callApi, isRefreshing]);

  const parseSourceLocationParams = useCallback((): {
    scmProvider: string;
    host: string;
    owner: string;
    repo: string;
    filePath: string;
    ref: string;
  } | null => {
    const sourceLocation =
      entity?.metadata?.annotations?.['backstage.io/source-location'];
    const scm = entity?.metadata?.annotations?.['ansible.io/scm-provider'];
    if (!sourceLocation || !scm) return null;

    const cleanUrl = sourceLocation.replace(/^url:/, '').replace(/\/$/, '');
    let url: URL;
    try {
      url = new URL(cleanUrl);
    } catch {
      return null;
    }

    const host = url.host;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];
    const scmProvider = scm.toLowerCase();

    let subdir = '';
    let ref = 'main';

    if (scmProvider === 'github') {
      const treeIndex = parts.indexOf('tree');
      if (treeIndex !== -1 && parts.length > treeIndex + 1) {
        ref = parts[treeIndex + 1];
        subdir = parts.slice(treeIndex + 2).join('/');
      } else {
        subdir = parts.slice(2).join('/');
      }
    } else if (scmProvider === 'gitlab') {
      const treeIndex = parts.indexOf('tree');
      if (treeIndex !== -1 && parts.length > treeIndex + 1) {
        ref = parts[treeIndex + 1];
        subdir = parts.slice(treeIndex + 2).join('/');
      } else {
        subdir = parts.at(-1) ?? '';
      }
    }

    const filePath = subdir ? `${subdir}/README.md` : 'README.md';

    return { scmProvider, host, owner, repo, filePath, ref };
  }, [entity]);

  useEffect(() => {
    const fetchDefaultReadme = async () => {
      if (entity && !entity?.spec?.readme) {
        const params = parseSourceLocationParams();
        if (!params) return;

        const baseUrl = await discoveryApi.getBaseUrl('catalog');
        const queryParams = new URLSearchParams({
          scmProvider: params.scmProvider,
          host: params.host,
          owner: params.owner,
          repo: params.repo,
          filePath: params.filePath,
          ref: params.ref,
        });

        try {
          const response = await fetchApi.fetch(
            `${baseUrl}/git_readme_content?${queryParams}`,
          );
          if (response.ok) {
            const text = await response.text();
            setDefaultReadme(text);
          }
        } catch {
          // Silently ignore errors
        }
      }
    };
    fetchDefaultReadme();
  }, [entity, discoveryApi, parseSourceLocationParams, fetchApi]);

  const getTechdocsUrl = () => {
    return `/docs/${entity?.metadata?.namespace}/${entity?.kind}/${entity?.metadata?.name}`;
  };

  const handleViewTechdocs = () => {
    const url = getTechdocsUrl();
    if (url) window.open(url, '_blank');
    // else alert('TechDocs not available for this template');
  };

  const handleMenuClick = (id: string) => {
    setMenuId(id);
    handleMenuClose();
  };

  const openSourceLocationUrl = useCallback(() => {
    const loc = entity?.metadata?.annotations?.['backstage.io/source-location'];
    if (!loc) return null;

    const url = loc.replace(/^url:/, '');
    window.open(url, '_blank');
    return url;
  }, [entity]);

  const handleDownloadArchive = () => {
    if (
      !entity?.spec?.definition ||
      !entity?.spec?.readme ||
      !entity?.spec?.ansible_cfg
    ) {
      // eslint-disable-next-line no-console
      console.error('Entity, definition, readme or ansible_cfg not available');
      return;
    }

    try {
      const eeFileName = `${
        entity.metadata.name || 'execution-environment'
      }.yaml`;
      const readmeFileName = `README-${
        entity.metadata.name || 'execution-environment'
      }.md`;
      const archiveName = `${
        entity.metadata.name || 'execution-environment'
      }.tar`;
      const ansibleCfgFileName = `ansible.cfg`;
      const templateFileName = `${
        entity.metadata.name || 'execution-environment'
      }-template.yaml`;

      const rawdata = [
        { name: eeFileName, content: entity.spec.definition },
        { name: readmeFileName, content: entity.spec.readme },
        { name: ansibleCfgFileName, content: entity.spec.ansible_cfg },
        { name: templateFileName, content: entity.spec.template },
      ];

      if (entity.spec.mcp_vars) {
        const mcpVarsFileName = `mcp-vars.yaml`;
        rawdata.push({
          name: mcpVarsFileName,
          content: entity.spec.mcp_vars,
        });
      }
      const tarData = createTarArchive(rawdata);

      const blob = new Blob([tarData as BlobPart], {
        type: 'application/x-tar',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = archiveName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download archive:', err); // eslint-disable-line no-console
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(!isRefreshing);
    setDefaultReadme('');
  };

  const handleUnregisterConfirm = () => {
    setMenuId('');
    navigate('/self-service/ee', { replace: true });
  };

  const handleNavigateToCatalog = () => {
    navigate('/self-service/ee/');
  };

  const isDownloadExperience =
    entity &&
    entity.metadata &&
    entity.metadata.annotations &&
    entity.metadata.annotations['ansible.io/download-experience']
      ?.toString()
      .toLowerCase()
      .trim() === 'true';

  return (
    <Box p={3}>
      {entity && (
        <UnregisterEntityDialog
          open={menuid === '1'}
          entity={entity}
          onConfirm={handleUnregisterConfirm}
          onClose={() => {
            setMenuId('');
          }}
        />
      )}

      {/* Breadcrumb */}
      <BreadcrumbsNavigation
        templateName={templateName || ''}
        onNavigateToCatalog={handleNavigateToCatalog}
      />

      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Header
          templateName={templateName?.toString() || ''}
          entity={entity || undefined}
        />
        {entity && (
          <IconButton onClick={handleMenuOpen}>
            <MoreVertIcon />
          </IconButton>
        )}

        {/* Menu Popover */}
        {entity && (
          <MenuPopover
            anchorEl={anchorEl}
            onClose={handleMenuClose}
            onMenuClick={handleMenuClick}
          />
        )}
      </Box>
      <>
        {' '}
        {entity ? (
          <>
            {/* Tabs */}
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              style={{ marginTop: 16, marginBottom: 24 }}
            >
              <Tab label="Overview" />
            </Tabs>

            {/* Overview */}
            {tab === 0 && (
              <Box display="flex" gridGap={24}>
                {/* Left Column */}
                <Box
                  flex={1}
                  maxWidth={320}
                  display="flex"
                  flexDirection="column"
                  gridGap={24}
                >
                  {/* Links Card */}
                  {isDownloadExperience && (
                    <LinksCard onDownloadArchive={handleDownloadArchive} />
                  )}

                  {/* About Card */}
                  <AboutCard
                    entity={entity}
                    ownerName={ownerName}
                    isRefreshing={isRefreshing}
                    isDownloadExperience={isDownloadExperience}
                    onRefresh={handleRefresh}
                    onViewTechdocs={handleViewTechdocs}
                    onOpenSourceLocation={openSourceLocationUrl}
                  />
                </Box>

                {/* Right Column */}
                <ReadmeCard
                  readmeContent={entity?.spec.readme || defaultReadme}
                />
              </Box>
            )}
          </>
        ) : (
          <> {entity !== false && <EntityNotFound />}</>
        )}
      </>
    </Box>
  );
};
