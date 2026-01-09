import { Box, IconButton, Tabs, Tab } from '@material-ui/core';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import {
  catalogApiRef,
  InspectEntityDialog,
  UnregisterEntityDialog,
} from '@backstage/plugin-catalog-react';
import {
  discoveryApiRef,
  identityApiRef,
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
  const [entity, setEntity] = useState<any | null>(null);
  const [menuid, setMenuId] = useState<string>('');
  const [defaultReadme, setDefaultReadme] = useState<string>('');
  const discoveryApi = useApi(discoveryApiRef);
  const identityApi = useApi(identityApiRef);
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

  const buildReadmeUrlParams = useCallback(() => {
    const sourceLocation =
      entity?.metadata?.annotations?.['backstage.io/source-location'];
    const scm = entity?.metadata?.annotations?.['ansible.io/scm-provider'];
    if (!sourceLocation) return '';

    // Clean URL
    const cleanUrl = sourceLocation.replace(/^url:/, '').replace(/\/$/, '');
    const url = new URL(cleanUrl);

    // Parts of pathname
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return '';

    // Extract owner and repo
    const owner = parts[0];
    const repository = parts[1];

    let subdir = '';

    // ---------- GITHUB ----------
    // Example: /owner/repo/tree/branch/ee1/
    if (scm && scm.toLowerCase().includes('github')) {
      const treeIndex = parts.indexOf('tree');

      if (treeIndex !== -1) {
        // skip 'tree' and branch → subdir starts after that
        subdir = parts.slice(treeIndex + 2).join('/');
      } else {
        // fallback (unexpected GitHub case)
        subdir = parts.slice(2).join('/');
      }

      return `scm=${scm}&owner=${owner}&repository=${repository}&subdir=${subdir}`;
    }

    // ---------- GITLAB ----------
    // Example: /owner/repo/-/raw/branch/ee1/README.md
    if (scm && scm.toLowerCase().includes('gitlab')) {
      // subdir excludes the file name (README.md)
      subdir = parts[parts.length - 1];

      return `scm=${scm}&owner=${owner}&repository=${repository}&subdir=${subdir}`;
    }
    // fallback (if new SCM type is added later)
    return `scm=${scm}&owner=${owner}&repository=${repository}&subdir=${subdir}`;
  }, [entity]);

  useEffect(() => {
    const fetchDefaultReadme = async () => {
      if (entity && (!entity.spec || !entity?.spec?.readme)) {
        const rawUrl = `${await discoveryApi.getBaseUrl(
          'scaffolder',
        )}/get_ee_readme?${buildReadmeUrlParams()}`;
        if (!rawUrl) return;
        const { token } = await identityApi.getCredentials();
        fetch(rawUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          })
          .then(text => {
            setDefaultReadme(text);
          })
          .catch(() => {});
      }
    };
    fetchDefaultReadme();
  }, [entity, discoveryApi, buildReadmeUrlParams, identityApi]);

  const getTechdocsUrl = () => {
    return `/docs/${entity?.metadata?.namespace}/${entity?.kind}/${entity?.metadata?.name}`;
  };

  const handleViewTechdocs = () => {
    const url = getTechdocsUrl();
    if (url) window.open(url, '_blank');
    // else alert('TechDocs not available for this template');
  };

  const handleCopyUrl = () => {
    const currentUrl = window.location.href;
    navigator.clipboard.writeText(currentUrl);
  };

  const handleMenuClick = (id: string) => {
    if (id === '3') {
      handleCopyUrl();
      handleMenuClose();
      return;
    }
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

      {entity && (
        <InspectEntityDialog
          open={menuid === '2'}
          entity={entity}
          onClose={() => {
            setMenuId('');
          }}
          initialTab="overview"
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
          <EntityNotFound />
        )}
      </>
    </Box>
  );
};
