import { useEffect, useState, useCallback, useRef } from 'react';
import { Progress, Table, TableColumn } from '@backstage/core-components';
import {
  Backdrop,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  IconButton,
  Input,
  Menu,
  MenuItem,
  Paper,
  Select,
  Tooltip,
  Typography,
} from '@material-ui/core';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import {
  CatalogFilterLayout,
  EntityKindFilter,
  EntityListProvider,
  EntityTagFilter,
  UserListPicker,
  catalogApiRef,
  useEntityList,
  useStarredEntities,
  UnregisterEntityDialog,
  FavoriteEntity,
} from '@backstage/plugin-catalog-react';
import MoreVert from '@material-ui/icons/MoreVert';
import OpenInNew from '@material-ui/icons/OpenInNew';
import { ANNOTATION_EDIT_URL, Entity } from '@backstage/catalog-model';
import { useApi } from '@backstage/core-plugin-api';
import { CreateCatalog } from './CreateCatalog';
import { EEBuildDialog } from './EEBuildDialog';
import { toEEDefinitionUrl, downloadEntityAsTarArchive } from './helpers';
import { useEEBuildFlow } from './useEEBuildFlow';
import { EntityLinkButton } from '../../common';

const DESCRIPTION_TRUNCATE_LENGTH = 30;

const useStyles = makeStyles(theme => ({
  flex: {
    display: 'flex',
  },
  ml_16: {
    marginLeft: '16px',
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    alignItems: 'center',
  },
  linkButtonRoot: {
    '&.MuiButton-root': {
      color: '#1976d2',
      textTransform: 'none',
      fontSize: '1rem',
      fontWeight: 500,
    },
  },
  actionButton: {
    cursor: 'pointer',
    padding: theme.spacing(0.5),
    position: 'relative',
    zIndex: 10,
    '&:hover': {
      opacity: 0.7,
    },
    '&:focus': {
      outline: 'none',
    },
  },
  entityLink: {
    cursor: 'pointer',
    color: theme.palette.primary.main,
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
    fontWeight: 'normal',
    textAlign: 'left',
    position: 'relative',
    zIndex: 10,
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  description: {
    color: theme.palette.text.secondary,
    fontSize: 16,
    lineHeight: 1.6,
    padding: '16px 0',
    width: '100%',
    marginBottom: '16px',
  },
  descriptionCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    maxWidth: 240, // ~30 characters visible
    minWidth: 0,
  },
  descriptionCellText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    flex: 1,
  },
  descriptionCellTextFull: {
    minWidth: 0,
    flex: 1,
  },
  paper: {
    padding: theme.spacing(1.5, 1.5),
    borderRadius: 3,
  },
  filter: {
    padding: theme.spacing(1.5, 1.5),
    borderRadius: 5,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: 'red',
  },
  actionsMenuPaper: {
    padding: theme.spacing(1, 0),
    minWidth: 180,
  },
}));

const ExecutionEnvironmentTypeFilter = () => {
  const { filters, updateFilters } = useEntityList();
  const { type } = filters;

  useEffect(() => {
    if (!type) {
      updateFilters(prev => ({
        ...prev,
        kind: new EntityKindFilter('Component', 'Component'),
        tags: new EntityTagFilter(['execution-environment']),
      }));
    }
  }, [type, updateFilters]);

  return null;
};

function sortByMetadataTitleAsc<T extends { metadata?: { name?: string } }>(
  data: T[],
): T[] {
  return [...data].sort((a, b) => {
    const titleA = a.metadata?.name ?? '';
    const titleB = b.metadata?.name ?? '';

    const numA = Number(titleA);
    const numB = Number(titleB);

    const isNumA = !Number.isNaN(numA);
    const isNumB = !Number.isNaN(numB);

    // both numeric → numeric sort
    if (isNumA && isNumB) {
      return numA - numB;
    }

    // numeric before string
    if (isNumA) return -1;
    if (isNumB) return 1;

    // both strings → string sort
    return titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
  });
}

export const EEListPage = ({
  onTabSwitch,
}: {
  onTabSwitch: (index: number) => void;
}) => {
  const classes = useStyles();
  const theme = useTheme();
  const catalogApi = useApi(catalogApiRef);
  const { isStarredEntity } = useStarredEntities();
  const [loading, setLoading] = useState<boolean>(true);
  const [showError, setShowError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [ansibleComponents, setAnsibleComponents] = useState<Entity[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string>('All');
  const [tagFilter, setTagFilter] = useState<string>('All');
  const [allOwners, setAllOwners] = useState<string[]>(['All']);
  const [allTags, setAllTags] = useState<string[]>(['All']);
  const [filtered, setFiltered] = useState<boolean>(true);
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());
  const [actionsMenuAnchor, setActionsMenuAnchor] =
    useState<null | HTMLElement>(null);
  const [menuAnchorPosition, setMenuAnchorPosition] = useState<
    { top: number; left: number } | undefined
  >(undefined);
  const [actionsMenuEntity, setActionsMenuEntity] = useState<Entity | null>(
    null,
  );
  const [unregisterDialogOpen, setUnregisterDialogOpen] =
    useState<boolean>(false);
  const [entityToUnregister, setEntityToUnregister] = useState<Entity | null>(
    null,
  );
  const { filters, updateFilters } = useEntityList();
  const { startBuildFlow, authBusy, dialogOpen, buildEntity, closeDialog } =
    useEEBuildFlow();

  const isMountedRef = useRef(true);

  const handleActionsMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    entity: Entity,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    if (target) {
      const rect = target.getBoundingClientRect();
      setMenuAnchorPosition({ left: rect.left, top: rect.bottom });
    }
    setActionsMenuAnchor(target);
    setActionsMenuEntity(entity);
  };

  const handleActionsMenuClose = () => {
    setActionsMenuAnchor(null);
    setMenuAnchorPosition(undefined);
    setActionsMenuEntity(null);
  };

  const getOwnerName = useCallback(
    async (ownerRef: string | undefined): Promise<string> => {
      if (!ownerRef) return 'Unknown';
      try {
        const ownerEntity = await catalogApi.getEntityByRef(ownerRef);
        // precedence: title >> name >> user reference >> unknown
        return (
          ownerEntity?.metadata?.title ??
          ownerEntity?.metadata?.name ??
          ownerRef ??
          'Unknown'
        );
      } catch {
        // If API call fails, fallback to ownerRef
        return ownerRef ?? 'Unknown';
      }
    },
    [catalogApi],
  );

  const getUniqueOwnersAndTags = useCallback((entities: Entity[]) => {
    const owners = Array.from(
      new Set(
        entities
          .map(e => e.spec?.owner)
          .filter((owner): owner is string => Boolean(owner)),
      ),
    );

    const tags = Array.from(
      new Set(
        entities
          .flatMap(e => e.metadata?.tags || [])
          .filter((tag): tag is string => Boolean(tag)),
      ),
    );
    return { owners, tags };
  }, []);

  const fetchOwnerNames = useCallback(
    async (entities: Entity[]) => {
      const ownerRefs = Array.from(
        new Set(
          entities
            .map(e => e.spec?.owner)
            .filter((owner): owner is string => Boolean(owner)),
        ),
      );

      const namePromises = ownerRefs.map(async ownerRef => {
        const name = await getOwnerName(ownerRef);
        return [ownerRef, name] as [string, string];
      });

      const nameEntries = await Promise.all(namePromises);
      if (isMountedRef.current) {
        setOwnerNames(prev => {
          const updated = new Map(prev);
          nameEntries.forEach(([ref, name]) => updated.set(ref, name));
          return updated;
        });
      }
    },
    [getOwnerName],
  );

  const callApi = useCallback(() => {
    catalogApi
      .getEntities({
        filter: [{ kind: 'Component', 'spec.type': 'execution-environment' }],
      })
      .then(entities => {
        if (!isMountedRef.current) return;

        let items = Array.isArray(entities) ? entities : entities?.items || [];
        const sortedData = sortByMetadataTitleAsc(items);
        items = sortedData;
        setAllEntities(items);
        if (items && items.length > 0) {
          setFiltered(true);
          const { owners, tags } = getUniqueOwnersAndTags(items);
          setAllOwners(['All', ...owners]);
          setAllTags(['All', ...tags]);
        } else {
          setFiltered(false);
        }
        setAnsibleComponents(
          items.filter(item => item.metadata.tags?.includes('ansible')),
        );
        fetchOwnerNames(items);
        setLoading(false);
        setShowError(false);
      })

      .catch(error => {
        if (!isMountedRef.current) return;

        if (error) {
          setErrorMessage(error.message);
          setShowError(true);
          setLoading(false);
        }
      });
  }, [catalogApi, getUniqueOwnersAndTags, fetchOwnerNames]);

  const handleUnregisterConfirm = useCallback(() => {
    setUnregisterDialogOpen(false);
    setEntityToUnregister(null);
    callApi();
  }, [callApi]);

  useEffect(() => {
    const filterData = allEntities.filter(d => {
      const matchesOwner =
        ownerFilter === 'All' || d?.spec?.owner === ownerFilter;
      const matchesTag =
        tagFilter === 'All' || d?.metadata?.tags?.includes(tagFilter);
      return matchesOwner && matchesTag;
    });
    setFiltered(allEntities && allEntities.length > 0);
    setAnsibleComponents(filterData);
  }, [ownerFilter, tagFilter, allEntities]);

  useEffect(() => {
    isMountedRef.current = true;
    updateFilters({ ...filters, tags: new EntityTagFilter(['ansible']) });
    callApi();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (allEntities && filters.user?.value === 'starred')
      setAnsibleComponents(allEntities?.filter(e => isStarredEntity(e)));
    else if (filters.user?.value === 'all') setAnsibleComponents(allEntities);
  }, [filters.user, allEntities, isStarredEntity]);

  if (loading) {
    return (
      <div>
        <Progress />
      </div>
    );
  }

  if (showError)
    return <div>Error: {errorMessage ?? 'Unable to retrieve data'}</div>;
  const columns: TableColumn[] = [
    {
      title: 'Name',
      id: 'name',
      field: 'metadata.name',
      highlight: true,
      render: (entity: any) => {
        const entityName = entity.metadata.name;
        const linkPath = `/self-service/catalog/${entityName}`;
        return (
          <EntityLinkButton linkPath={linkPath} className={classes.entityLink}>
            {entityName}
          </EntityLinkButton>
        );
      },
    },
    {
      title: 'Owner',
      field: 'spec.owner',
      id: 'owner',
      render: (entity: any) => {
        const ownerRef = entity.spec?.owner as string | undefined;
        const ownerName = ownerRef
          ? ownerNames.get(ownerRef) || ownerRef
          : 'Unknown';
        return <div>{ownerName}</div>;
      },
    },
    {
      title: 'Description',
      field: 'metadata.description',
      id: 'description',
      render: (entity: any) => {
        const desc = entity?.metadata?.description ?? '';
        const displayText = desc || '—';
        const isLong = desc.length > DESCRIPTION_TRUNCATE_LENGTH;
        const cell = (
          <Tooltip
            title={isLong ? desc : ''}
            placement="bottom-start"
            leaveDelay={0}
            enterDelay={300}
          >
            <Box className={classes.descriptionCell}>
              <Typography
                className={
                  isLong
                    ? classes.descriptionCellText
                    : classes.descriptionCellTextFull
                }
                variant="body2"
              >
                {displayText}
              </Typography>
            </Box>
          </Tooltip>
        );
        return cell;
      },
    },
    {
      title: 'Tags',
      field: 'metadata.tags',
      id: 'tags',
      render: (entity: any) => (
        <div className={classes.tagsContainer}>
          {entity.metadata.tags.slice(0, 3).map((t: string) => (
            <Chip key={t} label={t} size="small" />
          ))}
          {entity.metadata.tags.length > 3 && (
            <Chip label={`+${entity.metadata.tags.length - 3}`} size="small" />
          )}
        </div>
      ),
      cellStyle: { padding: '16px 16px 0px 20px' },
    },
    {
      title: 'Actions',
      id: 'actions',
      render: (entity: any) => {
        const entityName = entity.metadata?.name;
        return (
          <div
            className={classes.flex}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <FavoriteEntity entity={entity} style={{ padding: 0 }} />
            <Tooltip title="Actions">
              <IconButton
                size="small"
                onClick={(e: React.MouseEvent<HTMLElement>) =>
                  handleActionsMenuOpen(e, entity)
                }
                onMouseDown={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={classes.actionButton}
                aria-label="Actions"
                aria-haspopup="true"
                aria-controls={
                  actionsMenuEntity?.metadata?.name === entityName
                    ? 'ee-actions-menu'
                    : undefined
                }
              >
                <MoreVert fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ flexDirection: 'column', width: '100%' }}>
      {filtered || (allEntities && allEntities.length > 0) ? (
        <Typography variant="body1" className={classes.description}>
          Create an Execution Environment (EE) definition to ensure your
          playbooks run the same way, every time. Choose a recommended preset or
          start from scratch for full control. After saving your definition,
          follow our guide to create your EE image.
        </Typography>
      ) : null}
      {filtered || (allEntities && allEntities.length > 0) ? (
        <CatalogFilterLayout>
          <ExecutionEnvironmentTypeFilter />
          <CatalogFilterLayout.Filters>
            <UserListPicker availableFilters={['starred', 'all']} />
            <Typography>Owner</Typography>

            <Paper className={classes.paper}>
              <FormControl fullWidth>
                <Select
                  value={ownerFilter}
                  onChange={e => setOwnerFilter(e.target.value as string)}
                  displayEmpty
                  input={<Input disableUnderline />}
                >
                  {allOwners.map(o => (
                    <MenuItem key={o} value={o}>
                      {o}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Paper>

            <Typography style={{ marginTop: 10 }}>Tags</Typography>
            <Paper className={classes.paper}>
              <FormControl fullWidth variant="outlined">
                <Select
                  value={tagFilter}
                  onChange={e => setTagFilter(e.target.value as string)}
                  input={<Input disableUnderline />}
                  MenuProps={{
                    getContentAnchorEl: null,
                    anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                  }}
                >
                  {allTags.map(t => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Paper>
          </CatalogFilterLayout.Filters>
          <CatalogFilterLayout.Content>
            <Table
              title={`Execution Environments definition files (${ansibleComponents?.length})`}
              options={{
                search: true,
                rowStyle: { cursor: 'default' },
              }}
              columns={columns}
              data={ansibleComponents || []}
            />
            <Menu
              id="ee-actions-menu"
              anchorEl={actionsMenuAnchor}
              anchorReference="anchorPosition"
              anchorPosition={
                menuAnchorPosition
                  ? {
                      top: menuAnchorPosition.top,
                      left: menuAnchorPosition.left,
                    }
                  : undefined
              }
              keepMounted
              open={Boolean(actionsMenuAnchor)}
              onClose={handleActionsMenuClose}
              anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              PaperProps={{ className: classes.actionsMenuPaper }}
            >
              {actionsMenuEntity &&
                (() => {
                  const isDownloadExperience =
                    actionsMenuEntity?.metadata?.annotations?.[
                      'ansible.io/download-experience'
                    ]
                      ?.toString()
                      .toLowerCase()
                      .trim() === 'true';
                  return isDownloadExperience
                    ? [
                        <MenuItem
                          key="download"
                          onClick={() => {
                            handleActionsMenuClose();
                            const entityRef = `${actionsMenuEntity.kind}:${actionsMenuEntity.metadata?.namespace || 'default'}/${actionsMenuEntity.metadata?.name}`;
                            catalogApi
                              .getEntityByRef(entityRef)
                              .then((entity: Entity | undefined) => {
                                if (entity) {
                                  downloadEntityAsTarArchive(entity);
                                }
                              });
                          }}
                        >
                          Download
                        </MenuItem>,
                        <MenuItem
                          key="delete"
                          onClick={() => {
                            setEntityToUnregister(actionsMenuEntity);
                            handleActionsMenuClose();
                            setUnregisterDialogOpen(true);
                          }}
                          style={{ color: theme.palette.error.main }}
                        >
                          Delete
                        </MenuItem>,
                      ]
                    : [
                        <MenuItem
                          key="build"
                          onClick={() => {
                            const targetEntity = actionsMenuEntity;
                            handleActionsMenuClose();
                            if (targetEntity) {
                              void startBuildFlow(targetEntity);
                            }
                          }}
                        >
                          Build
                        </MenuItem>,
                        <MenuItem
                          key="edit"
                          onClick={() => {
                            const editUrl =
                              actionsMenuEntity?.metadata?.annotations?.[
                                ANNOTATION_EDIT_URL
                              ];
                            const sourceLocation =
                              actionsMenuEntity?.metadata?.annotations?.[
                                'backstage.io/source-location'
                              ];
                            const rawUrl =
                              editUrl ||
                              (typeof sourceLocation === 'string'
                                ? sourceLocation.replace(/^url:/i, '').trim()
                                : undefined);
                            const urlToOpen = toEEDefinitionUrl(
                              rawUrl ?? '',
                              actionsMenuEntity?.metadata?.name ?? '',
                            );
                            if (urlToOpen) {
                              window.open(
                                urlToOpen,
                                '_blank',
                                'noopener,noreferrer',
                              );
                            }
                            handleActionsMenuClose();
                          }}
                        >
                          Edit definition
                        </MenuItem>,
                        <MenuItem
                          key="view"
                          onClick={() => {
                            const viewUrl =
                              actionsMenuEntity?.metadata?.annotations?.[
                                'backstage.io/view-url'
                              ];
                            const editUrl =
                              actionsMenuEntity?.metadata?.annotations?.[
                                ANNOTATION_EDIT_URL
                              ];
                            const sourceLocation =
                              actionsMenuEntity?.metadata?.annotations?.[
                                'backstage.io/source-location'
                              ];
                            const sourceUrl =
                              typeof sourceLocation === 'string'
                                ? sourceLocation.replace(/^url:/i, '').trim()
                                : undefined;
                            const rawUrl = viewUrl || sourceUrl || editUrl;
                            const urlToOpen = toEEDefinitionUrl(
                              rawUrl ?? '',
                              actionsMenuEntity?.metadata?.name ?? '',
                            );
                            if (urlToOpen) {
                              window.open(
                                urlToOpen,
                                '_blank',
                                'noopener,noreferrer',
                              );
                            }
                            handleActionsMenuClose();
                          }}
                        >
                          <Box
                            display="flex"
                            alignItems="center"
                            justifyContent="space-between"
                            width="100%"
                            style={{ gap: 8 }}
                          >
                            <span>View in source</span>
                            <OpenInNew fontSize="small" />
                          </Box>
                        </MenuItem>,
                        <MenuItem
                          key="delete"
                          onClick={() => {
                            setEntityToUnregister(actionsMenuEntity);
                            handleActionsMenuClose();
                            setUnregisterDialogOpen(true);
                          }}
                          style={{ color: theme.palette.error.main }}
                        >
                          Delete
                        </MenuItem>,
                      ];
                })()}
            </Menu>
            {entityToUnregister && (
              <UnregisterEntityDialog
                open={unregisterDialogOpen}
                entity={entityToUnregister}
                onConfirm={handleUnregisterConfirm}
                onClose={() => {
                  setUnregisterDialogOpen(false);
                  setEntityToUnregister(null);
                }}
              />
            )}
            <Backdrop open={authBusy} style={{ zIndex: 1400, color: '#fff' }}>
              <CircularProgress color="inherit" />
            </Backdrop>
            <EEBuildDialog
              open={dialogOpen}
              entity={buildEntity}
              onClose={closeDialog}
            />
          </CatalogFilterLayout.Content>
        </CatalogFilterLayout>
      ) : (
        <CreateCatalog onTabSwitch={onTabSwitch} />
      )}
    </div>
  );
};

export const EntityCatalogContent = ({
  onTabSwitch,
}: {
  onTabSwitch: (index: number) => void;
}) => {
  const classes = useStyles();

  return (
    <Grid container spacing={2} justifyContent="space-between">
      <Grid item xs={12} className={classes.flex}>
        <EntityListProvider>
          <EEListPage onTabSwitch={onTabSwitch} />
        </EntityListProvider>
      </Grid>
    </Grid>
  );
};
