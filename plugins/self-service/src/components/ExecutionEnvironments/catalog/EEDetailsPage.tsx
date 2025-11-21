import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Tabs,
  Tab,
  MenuItem,
  Divider,
  Breadcrumbs,
  Link,
  Button,
  Popover,
  ListItemIcon,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import GetAppIcon from '@material-ui/icons/GetApp';
import CancelIcon from '@material-ui/icons/Cancel';
import BugReportIcon from '@material-ui/icons/BugReport';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import DescriptionOutlinedIcon from '@material-ui/icons/DescriptionOutlined';
import GitHubIcon from '@material-ui/icons/GitHub';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import EditIcon from '@material-ui/icons/Edit';
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
import { ANNOTATION_EDIT_URL } from '@backstage/catalog-model';
import { MarkdownContent } from '@backstage/core-components';

const useStyles = makeStyles(theme => ({
  breadcrumb: {
    marginBottom: theme.spacing(2),
  },
  menuPaper: {
    width: 300,
    borderRadius: 12,
    boxShadow: '0px 8px 20px rgba(0,0,0,0.1)',
    padding: '4px 0',
  },
  menuItem: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    padding: theme.spacing(1.5, 2.2),
  },
  linkText: {
    color: '#1976d2',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    '&:hover': {
      textDecoration: 'underline',
      transform: 'scale(1.03)',
    },
  },
  tagButton: {
    borderRadius: 8,
    borderColor: '#D3D3D3',
    textTransform: 'none',
  },
  scrollArea: {
    maxHeight: '58vh',
    overflowY: 'auto',
    paddingRight: 8,

    /* Optional prettier scrollbar */
    '&::-webkit-scrollbar': {
      width: '6px',
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#bfbfbf',
      borderRadius: '4px',
    },
  },
  markdownScroll: {
    maxHeight: '60vh',
    overflowY: 'auto',
    minHeight: 0,
    paddingRight: 8,

    '&::-webkit-scrollbar': {
      width: 8,
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#bfbfbf',
      borderRadius: 4,
    },
  },
}));

export const EEDetailsPage: React.FC = () => {
  const { templateName } = useParams<{ templateName: string }>();
  const classes = useStyles();
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
  }, [callApi]);

  const buildReadmeUrlParams = useCallback(() => {
    const sourceLocation =
      entity?.metadata?.annotations?.['backstage.io/source-location'];
    const scm = entity?.metadata?.annotations?.['ansible.io/scm-provider'];
    if (!sourceLocation) return '';

    // Clean URL
    const cleanUrl = sourceLocation.replace(/^url:/, '').replace(/\/$/, '');
    const url = new URL(cleanUrl);
    const host = url.host;

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

      return `scm=${scm}&host=${host}&owner=${owner}&repository=${repository}&subdir=${subdir}`;
    }

    // ---------- GITLAB ----------
    // Example: /owner/repo/-/raw/branch/ee1/README.md
    if (scm && scm.toLowerCase().includes('gitlab')) {
      // subdir excludes the file name (README.md)
      subdir = parts[parts.length - 1];

      return `scm=${scm}&host=${host}&owner=${owner}&repository=${repository}&subdir=${subdir}`;
    }
    // fallback (if new SCM type is added later)
    return `host=${host}&owner=${owner}&repository=${repository}&subdir=${subdir}`;
  }, [entity]);

  useEffect(() => {
    const fetchDefaultReadme = async () => {
      if (
        entity &&
        (!entity.spec || (!entity?.spec?.readme && !defaultReadme))
      ) {
        const rawUrl = `${await discoveryApi.getBaseUrl(
          'scaffolder',
        )}/aap/get_ee_readme?${buildReadmeUrlParams()}`;
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
  }, [entity, discoveryApi, buildReadmeUrlParams, defaultReadme, identityApi]);

  const getTechdocsUrl = () => {
    // const ref = techdoc?.metadata?.annotations?.['backstage.io/techdocs-ref'];
    // if (ref) {
    //   if (ref.startsWith('url:')) return ref.replace(/^url:/, '');
    //   return `/docs/${techdoc.metadata.namespace}/${techdoc.metadata.name}`;
    // }
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

  const createTarArchive = (
    files: Array<{ name: string; content: string }>,
  ): Uint8Array => {
    const BLOCK_SIZE = 512;
    const tarData: number[] = [];

    const writeField = (
      buf: Uint8Array,
      offset: number,
      str: string,
      len: number,
    ) => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);
      const writeLen = Math.min(bytes.length, len - 1);
      for (let i = 0; i < writeLen; i++) {
        buf[offset + i] = bytes[i];
      }
      // Null-terminate
      buf[offset + writeLen] = 0;
    };

    const writeOctalField = (
      buf: Uint8Array,
      offset: number,
      num: number,
      len: number,
    ) => {
      const str = num.toString(8).padStart(len - 2, '0');
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);
      const writeLen = Math.min(bytes.length, len - 2);
      for (let i = 0; i < writeLen; i++) {
        buf[offset + i] = bytes[i];
      }
      buf[offset + writeLen] = 0x20; // space
      buf[offset + len - 1] = 0; // null
    };

    for (const file of files) {
      const content = new TextEncoder().encode(file.content);
      const header = new Uint8Array(BLOCK_SIZE);
      header.fill(0);

      // File name
      writeField(header, 0, file.name, 100);

      // File mode
      writeOctalField(header, 100, 0o644, 8);

      // UID
      writeOctalField(header, 108, 0, 8);

      // GID
      writeOctalField(header, 116, 0, 8);

      // File size
      writeOctalField(header, 124, content.length, 12);

      // Modification time
      writeOctalField(header, 136, Math.floor(Date.now() / 1000), 12);

      // Checksum field
      for (let i = 148; i < 156; i++) {
        header[i] = 0x20;
      }

      // Type flag
      header[156] = 0x30; // '0'

      // Magic (6 bytes) - "ustar\0"
      const magic = new TextEncoder().encode('ustar');
      for (let i = 0; i < 5; i++) {
        header[257 + i] = magic[i];
      }
      header[262] = 0; // null

      // Version (2 bytes) - "00"
      header[263] = 0x30; // '0'
      header[264] = 0x30; // '0'

      let checksum = 0;
      for (let i = 0; i < BLOCK_SIZE; i++) {
        checksum += header[i];
      }

      const checksumStr = checksum.toString(8).padStart(6, '0');
      const checksumBytes = new TextEncoder().encode(checksumStr);
      for (let i = 0; i < 6 && i < checksumBytes.length; i++) {
        header[148 + i] = checksumBytes[i];
      }
      header[154] = 0x20;
      header[155] = 0;

      tarData.push(...Array.from(header));
      tarData.push(...Array.from(content));

      const padding = (BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE;
      for (let i = 0; i < padding; i++) {
        tarData.push(0);
      }
    }

    for (let i = 0; i < BLOCK_SIZE * 2; i++) {
      tarData.push(0);
    }

    return new Uint8Array(tarData);
  };

  const handleDownloadArchive = () => {
    if (
      !entity?.spec?.definition ||
      !entity?.spec?.readme ||
      !entity?.spec?.mcp_vars ||
      !entity?.spec?.ansible_cfg
    ) {
      // eslint-disable-next-line no-console
      console.error(
        'Entity, definition, readme, mcp_vars, or ansible_cfg not available',
      );
      console.error('Entity, definition, or readme not available'); // eslint-disable-line no-console

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
      const mcpVarsFileName = `mcp-vars.yaml`;
      const ansibleCfgFileName = `ansible.cfg`;
      const templateFileName = `${
        entity.metadata.name || 'execution-environment'
      }-template.yaml`;

      const tarData = createTarArchive([
        { name: eeFileName, content: entity.spec.definition },
        { name: readmeFileName, content: entity.spec.readme },
        { name: mcpVarsFileName, content: entity.spec.mcp_vars },
        { name: ansibleCfgFileName, content: entity.spec.ansible_cfg },
        { name: templateFileName, content: entity.spec.template },
      ]);

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

  return (
    <Box p={3}>
      {entity && (
        <UnregisterEntityDialog
          open={menuid === '1'}
          entity={entity}
          onConfirm={() => {
            setMenuId('');
            navigate(-1);
          }}
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
      <Breadcrumbs className={classes.breadcrumb}>
        <Link color="inherit" href="#">
          Execution environment definition files
        </Link>
        <Link
          color="inherit"
          href="#"
          onClick={() => navigate('/self-service/ee/')}
        >
          Catalog
        </Link>
        <Typography color="textPrimary">{templateName}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box display="flex" alignItems="center">
          <Typography
            variant="h5"
            style={{ fontWeight: 700, fontSize: '1.5rem' }}
          >
            {templateName}
          </Typography>

          <IconButton size="small">
            <StarBorderIcon />
          </IconButton>
        </Box>
        <IconButton onClick={handleMenuOpen}>
          <MoreVertIcon />
        </IconButton>

        {/* Menu Popover */}
        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={handleMenuClose}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          classes={{ paper: classes.menuPaper }}
        >
          {/* Menu Options */}
          {[
            {
              title: 'Unregister entity',
              id: '1',
              icon: <CancelIcon fontSize="small" />,
            },
            {
              title: 'Inspect entity',
              id: '2',
              icon: <BugReportIcon fontSize="small" />,
            },
            {
              title: 'Copy entity URL',
              id: '3',
              icon: <FileCopyIcon fontSize="small" />,
            },
          ].map((item, i) => (
            <MenuItem
              onClick={() => {
                handleMenuClick(item.id);
              }}
              key={i}
              className={classes.menuItem}
            >
              <Typography
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <ListItemIcon style={{ minWidth: 42 }}>
                  {item.icon}
                </ListItemIcon>
                {item.title}
              </Typography>
            </MenuItem>
          ))}
        </Popover>
      </Box>

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
            {entity &&
              entity.metadata &&
              entity.metadata.annotations &&
              entity.metadata.annotations['ansible.io/download-experience']
                ?.toString()
                .toLowerCase()
                .trim() === 'true' && (
                <Card
                  variant="outlined"
                  style={{ borderRadius: 16, borderColor: '#D3D3D3' }}
                >
                  <CardContent>
                    <Typography
                      variant="h6"
                      style={{
                        fontWeight: 'bold',
                        fontSize: '1.5rem',
                        margin: '6px 0 13px 10px',
                      }}
                    >
                      Links
                    </Typography>
                    <Divider style={{ margin: '0 -16px 12px' }} />

                    {[
                      {
                        icon: <GetAppIcon />,
                        text: 'Download EE files',
                        onClick: handleDownloadArchive,
                      },
                    ].map((item, i) => {
                      return (
                        <Box
                          key={i}
                          display="flex"
                          alignItems="center"
                          gridGap={12}
                          onClick={item.onClick}
                          style={{
                            marginLeft: 10,
                            marginBottom: 10,
                            cursor: 'pointer',
                            color: '#1976d2',
                          }}
                        >
                          {item.icon}
                          <Typography
                            variant="body1"
                            className={classes.linkText}
                            style={{
                              color: '#1976d2',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {item.text}
                          </Typography>
                        </Box>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

            {/* About Card */}
            <Card
              variant="outlined"
              style={{ borderRadius: 16, borderColor: '#D3D3D3' }}
            >
              <CardContent>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography
                    variant="h6"
                    style={{
                      fontWeight: 'bold',
                      fontSize: '1.5rem',
                      marginLeft: 10,
                    }}
                  >
                    About
                  </Typography>
                  <Divider style={{ margin: '16px 0' }} />
                  {!(
                    entity &&
                    entity.metadata &&
                    entity.metadata.annotations &&
                    entity.metadata.annotations[
                      'ansible.io/download-experience'
                    ]
                      ?.toString()
                      .toLowerCase()
                      .trim() === 'true'
                  ) && (
                    <Box display="flex" alignItems="center">
                      <IconButton size="small">
                        <AutorenewIcon style={{ color: '#757575' }} />
                      </IconButton>
                      <IconButton size="small">
                        <>
                          <a
                            href={
                              entity?.metadata?.annotations?.[
                                ANNOTATION_EDIT_URL
                              ]
                            }
                            target="_blank"
                          >
                            <EditIcon style={{ color: '#1976d2' }} />
                          </a>
                        </>
                      </IconButton>
                    </Box>
                  )}
                </Box>
                {/* Top Actions (View Techdocs / Source) */}
                {!(
                  entity &&
                  entity.metadata &&
                  entity.metadata.annotations &&
                  entity.metadata.annotations['ansible.io/download-experience']
                    ?.toString()
                    .toLowerCase()
                    .trim() === 'true'
                ) && (
                  <Box
                    display="flex"
                    justifyContent="space-around"
                    alignItems="center"
                    textAlign="center"
                    mt={2}
                    mb={2}
                  >
                    <Box
                      onClick={handleViewTechdocs}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        minWidth: 120,
                      }}
                    >
                      <DescriptionOutlinedIcon
                        style={{ color: '#1976d2', fontSize: 30 }}
                      />
                      <Typography
                        variant="body2"
                        style={{
                          color: '#1976d2',
                          fontWeight: 600,
                          marginTop: 6,
                        }}
                      >
                        VIEW <br /> TECHDOCS
                      </Typography>
                    </Box>

                    <Box
                      onClick={openSourceLocationUrl}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        minWidth: 120,
                      }}
                    >
                      <GitHubIcon style={{ color: '#1976d2', fontSize: 30 }} />
                      <Typography
                        variant="body2"
                        style={{
                          color: '#1976d2',
                          fontWeight: 600,
                          marginTop: 6,
                        }}
                      >
                        VIEW <br /> SOURCE
                      </Typography>
                    </Box>
                  </Box>
                )}

                <Divider style={{ margin: '16px 0' }} />

                {/* Details */}
                <Box>
                  <Typography
                    variant="caption"
                    style={{ color: 'gray', fontWeight: 600 }}
                  >
                    DESCRIPTION
                  </Typography>
                  <Typography variant="body2">
                    {entity?.metadata?.description ??
                      entity?.metadata?.title ??
                      'No description available.'}
                  </Typography>
                </Box>
                <Box
                  display="flex"
                  flexDirection="column"
                  gridGap={4}
                  marginTop={2}
                >
                  <Box>
                    <Typography
                      variant="caption"
                      style={{ color: 'gray', fontWeight: 600 }}
                    >
                      OWNER
                    </Typography>
                    <Typography
                      variant="body2"
                      style={{ color: '#1976d2', cursor: 'pointer' }}
                    >
                      {entity?.spec?.owner ??
                        entity?.metadata?.namespace ??
                        'Unknown'}
                    </Typography>
                  </Box>
                  <Box marginTop={2}>
                    <Typography
                      variant="caption"
                      style={{ color: 'gray', fontWeight: 600 }}
                    >
                      TYPE
                    </Typography>
                    <Typography variant="body2" style={{ fontWeight: 600 }}>
                      {entity?.spec?.type ??
                        entity?.metadata?.namespace ??
                        'Unknown'}
                    </Typography>
                  </Box>
                </Box>

                <Box marginTop={2}>
                  <Typography
                    variant="caption"
                    style={{ color: 'gray', fontWeight: 600 }}
                  >
                    TAGS
                  </Typography>

                  <Box display="flex" gridGap={8} marginTop={1} flexWrap="wrap">
                    {Array.isArray(entity?.metadata?.tags) &&
                    entity.metadata?.tags?.length > 0 ? (
                      entity.metadata?.tags?.map((t: string) => (
                        <Button
                          variant="outlined"
                          size="small"
                          key={t}
                          className={classes.tagButton}
                          style={{
                            textTransform: 'none',
                            borderRadius: 8,
                            borderColor: '#D3D3D3',
                          }}
                        >
                          {t}
                        </Button>
                      ))
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        No tags
                      </Typography>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Right Column */}
          <Box flex={1} style={{ minHeight: 0 }}>
            <Card variant="outlined">
              <CardContent style={{ flex: 1, minHeight: 0 }}>
                <div className={classes.scrollArea}>
                  <MarkdownContent
                    className={classes.markdownScroll}
                    content={entity?.spec.readme || defaultReadme}
                  />
                </div>
              </CardContent>
            </Card>
          </Box>
        </Box>
      )}
    </Box>
  );
};
