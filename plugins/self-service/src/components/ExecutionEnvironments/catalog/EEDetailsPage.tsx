import {
  Box,
  Tabs,
  Tab,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import BuildIcon from '@material-ui/icons/Build';
import EditIcon from '@material-ui/icons/Edit';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import DeleteIcon from '@material-ui/icons/Delete';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  catalogApiRef,
  UnregisterEntityDialog,
} from '@backstage/plugin-catalog-react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
  useRouteRef,
} from '@backstage/core-plugin-api';
import { ANNOTATION_EDIT_URL } from '@backstage/catalog-model';
import { Header } from './Header';
import { BreadcrumbsNavigation } from './BreadcrumbsNavigation';
import { LinksCard } from './LinksCard';
import { AboutCard } from './AboutCard';
import { ReadmeCard } from './ReadmeCard';
import { DefinedContentCard } from './DefinedContentCard';
import { ResourcesCard } from './ResourcesCard';
import { EntityNotFound } from './EntityNotFound';
import { toEEDefinitionUrl, downloadEntityAsTarArchive } from './helpers';
import { parseEEDefinition } from '../../../utils/eeDefinitionUtils';
import { rootRouteRef } from '../../../routes';

const useActionsMenuStyles = makeStyles(theme => ({
  actionsButton: {
    textTransform: 'none',
    fontWeight: 600,
  },
  deleteItem: {
    color: theme.palette.error.main,
  },
  menuPaper: {
    borderRadius: 12,
    boxShadow: '0px 8px 20px rgba(0,0,0,0.1)',
    minWidth: 200,
  },
}));

const usePageStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(3),
    [theme.breakpoints.down('sm')]: {
      padding: theme.spacing(2),
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
  },
  overviewGrid: {
    display: 'flex',
    gap: theme.spacing(3),
    flexDirection: 'row',
    [theme.breakpoints.down('md')]: {
      flexDirection: 'column',
    },
  },
  sidebar: {
    flex: 1,
    maxWidth: 320,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(3),
    [theme.breakpoints.down('md')]: {
      maxWidth: '100%',
    },
  },
  readmeWrapper: {
    flex: 1,
    minWidth: 0,
  },
}));

export const EEDetailsPage: React.FC = () => {
  const actionsMenuClasses = useActionsMenuStyles();
  const pageClasses = usePageStyles();
  const { templateName } = useParams<{ templateName: string }>();
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
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
  const [fetchedDefinition, setFetchedDefinition] = useState<string | null>(
    null,
  );
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
    subdir: string;
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

    if (scm?.toLowerCase().includes('github')) {
      const treeIndex = parts.indexOf('tree');
      if (treeIndex !== -1 && parts.length > treeIndex + 1) {
        ref = parts[treeIndex + 1];
        subdir = parts.slice(treeIndex + 2).join('/');
      } else {
        subdir = parts.slice(2).join('/');
      }
    } else if (scm?.toLowerCase().includes('gitlab')) {
      const treeIndex = parts.indexOf('tree');
      if (treeIndex !== -1 && parts.length > treeIndex + 1) {
        ref = parts[treeIndex + 1];
        subdir = parts.slice(treeIndex + 2).join('/');
      } else {
        subdir = parts.at(-1) ?? '';
      }
    }

    const filePath = subdir ? `${subdir}/README.md` : 'README.md';

    return { scmProvider, host, owner, repo, subdir, filePath, ref };
  }, [entity]);

  useEffect(() => {
    const fetchDefaultReadme = async () => {
      if (!entity?.spec?.readme) {
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
            `${baseUrl}/ansible/git/file-content?${queryParams}`,
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

  useEffect(() => {
    const fetchEEDefinition = async () => {
      if (entity && !entity?.spec?.definition) {
        const params = parseSourceLocationParams();
        if (!params) return;

        const baseUrl = await discoveryApi.getBaseUrl('catalog');
        const queryParams = new URLSearchParams({
          scmProvider: params.scmProvider,
          host: params.host,
          owner: params.owner,
          repo: params.repo,
          filePath: params.subdir
            ? `${params.subdir}/${entity?.metadata?.name ?? 'execution-environment'}.yml`
            : `${entity?.metadata?.name ?? 'execution-environment'}.yml`,
          ref: params.ref,
        });

        try {
          const response = await fetchApi.fetch(
            `${baseUrl}/ansible/git/file-content?${queryParams}`,
          );
          if (response.ok) {
            const text = await response.text();
            setFetchedDefinition(text);
          }
        } catch {
          // Silently ignore errors
        }
      }
    };
    fetchEEDefinition();
  }, [entity, discoveryApi, parseSourceLocationParams, fetchApi]);

  useEffect(() => {
    if (entity?.spec?.definition) setFetchedDefinition(null);
  }, [entity?.spec?.definition]);

  const openSourceLocationUrl = useCallback(() => {
    const loc = entity?.metadata?.annotations?.['backstage.io/source-location'];
    if (!loc) return null;

    const url = toEEDefinitionUrl(
      loc.replace(/^url:/, '').trim(),
      entity?.metadata?.name ?? '',
    );
    if (url) window.open(url, '_blank');
    return url;
  }, [entity]);

  /** URL to edit the EE definition file (e.g. test-2.yaml), not catalog-info.yaml */
  const getDefinitionEditUrl = useCallback(() => {
    const editUrl = entity?.metadata?.annotations?.[ANNOTATION_EDIT_URL] as
      | string
      | undefined;
    if (!editUrl) return null;
    const eeName = entity?.metadata?.name;
    if (!eeName) {
      throw new Error('Missing metadata.name on entity');
    }
    const definitionFilename = `${eeName}.yaml`;
    const pathParts = editUrl.split('/');
    pathParts[pathParts.length - 1] = definitionFilename;
    return pathParts.join('/');
  }, [entity]);

  const handleEditDefinition = () => {
    const url = getDefinitionEditUrl();
    if (url) window.open(url, '_blank');
  };

  const handleBuild = () => {
    // TODO: Implement build
  };

  const parsedDefinition = useMemo(() => {
    const fromSpec = parseEEDefinition(entity?.spec?.definition);
    if (fromSpec) return fromSpec;
    return fetchedDefinition ? parseEEDefinition(fetchedDefinition) : null;
  }, [entity?.spec?.definition, fetchedDefinition]);

  const sourceLocationDisplayUrl = entity?.metadata?.annotations?.[
    'backstage.io/source-location'
  ]
    ? (
        entity.metadata.annotations['backstage.io/source-location'] as string
      ).replace(/^url:/, '')
    : null;

  const handleDownloadArchive = () => {
    downloadEntityAsTarArchive(entity);
  };

  const handleRefresh = () => {
    setIsRefreshing(!isRefreshing);
    setDefaultReadme('');
  };

  const handleUnregisterConfirm = () => {
    setMenuId('');
    navigate(`${rootLink()}/ee`, { replace: true });
  };

  const handleNavigateToCatalog = () => {
    navigate(`${rootLink()}/ee/`);
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
    <Box className={pageClasses.root}>
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
      <Box className={pageClasses.header}>
        <Header
          templateName={templateName?.toString() || ''}
          entity={entity || undefined}
        />
        {entity && (
          <>
            <Button
              variant="contained"
              color="primary"
              className={actionsMenuClasses.actionsButton}
              onClick={handleMenuOpen}
              endIcon={<ArrowDropDownIcon />}
            >
              Actions
            </Button>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              classes={{ paper: actionsMenuClasses.menuPaper }}
              getContentAnchorEl={null}
            >
              <MenuItem
                onClick={() => {
                  handleBuild();
                  handleMenuClose();
                }}
              >
                <ListItemIcon style={{ minWidth: 36 }}>
                  <BuildIcon fontSize="small" />
                </ListItemIcon>
                <Typography variant="body2">Build</Typography>
              </MenuItem>
              {!isDownloadExperience && [
                <MenuItem
                  key="edit-definition"
                  onClick={() => {
                    handleEditDefinition();
                    handleMenuClose();
                  }}
                >
                  <ListItemIcon style={{ minWidth: 36 }}>
                    <EditIcon fontSize="small" />
                  </ListItemIcon>
                  <Typography variant="body2">Edit definition</Typography>
                </MenuItem>,
                <MenuItem
                  key="view-in-source"
                  onClick={() => {
                    openSourceLocationUrl();
                    handleMenuClose();
                  }}
                >
                  <ListItemIcon style={{ minWidth: 36 }}>
                    <OpenInNewIcon fontSize="small" />
                  </ListItemIcon>
                  <Typography variant="body2">View in source</Typography>
                </MenuItem>,
              ]}
              <MenuItem
                onClick={() => {
                  setMenuId('1');
                  handleMenuClose();
                }}
                className={actionsMenuClasses.deleteItem}
              >
                <ListItemIcon
                  style={{ minWidth: 36 }}
                  className={actionsMenuClasses.deleteItem}
                >
                  <DeleteIcon fontSize="small" />
                </ListItemIcon>
                <Typography variant="body2">Delete</Typography>
              </MenuItem>
            </Menu>
          </>
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
              <Box className={pageClasses.overviewGrid}>
                {/* Left Column - README (stacks first on narrow) */}
                <Box className={pageClasses.readmeWrapper}>
                  <ReadmeCard
                    readmeContent={entity?.spec.readme || defaultReadme}
                  />
                </Box>

                {/* Right Column - About, Defined Content, Resources */}
                <Box className={pageClasses.sidebar}>
                  {/* Links Card */}
                  {isDownloadExperience && (
                    <LinksCard onDownloadArchive={handleDownloadArchive} />
                  )}

                  {/* About Card */}
                  <AboutCard
                    entity={entity}
                    ownerName={ownerName}
                    baseImageName={parsedDefinition?.baseImageName ?? null}
                    sourceLocationUrl={sourceLocationDisplayUrl}
                    isRefreshing={isRefreshing}
                    isDownloadExperience={isDownloadExperience}
                    onRefresh={handleRefresh}
                  />

                  {/* Defined Content Card */}
                  <DefinedContentCard parsedDefinition={parsedDefinition} />

                  <ResourcesCard />
                </Box>
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
