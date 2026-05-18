import { useEffect, useState, useCallback } from 'react';
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
  EntityTypeFilter,
  UserListPicker,
  catalogApiRef,
  useEntityList,
  useStarredEntities,
  UnregisterEntityDialog,
  FavoriteEntity,
} from '@backstage/plugin-catalog-react';
import MoreVert from '@material-ui/icons/MoreVert';
import OpenInNew from '@material-ui/icons/OpenInNew';
import NavigateBeforeIcon from '@material-ui/icons/NavigateBefore';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';
import { ANNOTATION_EDIT_URL, Entity } from '@backstage/catalog-model';
import { useApi } from '@backstage/core-plugin-api';
import { CreateCatalog } from './CreateCatalog';
import { EEBuildDialog } from './EEBuildDialog';
import {
  toEEDefinitionUrl,
  downloadEntityAsTarArchive,
  isEntityPublishedToGithub,
} from './helpers';
import { useEEBuildFlow } from './useEEBuildFlow';
import { EntityLinkButton } from '../../common';
import { usePaginatedEE } from './usePaginatedEE';
import { PAGE_SIZE } from './constants';

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
    maxWidth: 240,
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
  paginationContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing(3),
    padding: theme.spacing(1, 0),
  },
  paginationInfo: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
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
        type: new EntityTypeFilter(['execution-environment']),
      }));
    }
  }, [type, updateFilters]);

  return null;
};

export const EEListPage = ({
  onTabSwitch,
}: {
  onTabSwitch: (index: number) => void;
}) => {
  const classes = useStyles();
  const theme = useTheme();
  const catalogApi = useApi(catalogApiRef);
  const { isStarredEntity } = useStarredEntities();

  const {
    entities: paginatedEntities,
    loadedEntityCount,
    totalCount,
    initialLoading,
    loadingMore,
    error,
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    allOwners,
    allTags,
    ownerFilter,
    setOwnerFilter,
    tagFilter,
    setTagFilter,
    ownerNames,
    refresh,
  } = usePaginatedEE({ catalogApi });

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
  const { filters } = useEntityList();
  const {
    startBuildFlow,
    authBusy,
    dialogOpen,
    buildEntity,
    githubToken,
    closeDialog,
  } = useEEBuildFlow();

  const [displayedEntities, setDisplayedEntities] =
    useState<Entity[]>(paginatedEntities);

  useEffect(() => {
    if (filters.user?.value === 'starred') {
      setDisplayedEntities(paginatedEntities.filter(e => isStarredEntity(e)));
    } else {
      setDisplayedEntities(paginatedEntities);
    }
  }, [filters.user, paginatedEntities, isStarredEntity]);

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

  const handleUnregisterConfirm = useCallback(() => {
    setUnregisterDialogOpen(false);
    setEntityToUnregister(null);
    refresh();
  }, [refresh]);

  if (initialLoading) {
    return (
      <div>
        <Progress />
      </div>
    );
  }

  if (error) return <div>Error: {error}</div>;

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalCount);

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
          {(entity.metadata.tags ?? []).slice(0, 3).map((t: string) => (
            <Chip key={t} label={t} size="small" />
          ))}
          {(entity.metadata.tags?.length ?? 0) > 3 && (
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

  const hasEntities = loadedEntityCount > 0;

  return (
    <div style={{ flexDirection: 'column', width: '100%' }}>
      {hasEntities ? (
        <Typography variant="body1" className={classes.description}>
          Create an Execution Environment (EE) definition to ensure your
          playbooks run the same way, every time. Choose a recommended preset or
          start from scratch for full control. After saving your definition,
          follow our guide to create your EE image.
        </Typography>
      ) : null}
      {hasEntities ? (
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
              title={
                <>
                  {`Execution Environments definition files (${totalCount})`}
                  {loadingMore && (
                    <CircularProgress
                      size={16}
                      style={{ marginLeft: 8, verticalAlign: 'middle' }}
                    />
                  )}
                </>
              }
              options={{
                search: true,
                paging: false,
                rowStyle: { cursor: 'default' },
              }}
              columns={columns}
              data={displayedEntities}
            />
            {totalPages > 1 && (
              <Box className={classes.paginationContainer}>
                <Typography className={classes.paginationInfo}>
                  Showing {startIndex + 1}-{endIndex} of {totalCount}{' '}
                  execution environments
                </Typography>
                <Box className={classes.paginationControls}>
                  <IconButton
                    size="small"
                    disabled={!hasPrevPage}
                    onClick={prevPage}
                    aria-label="Previous page"
                  >
                    <NavigateBeforeIcon />
                  </IconButton>
                  <Typography variant="body2">
                    Page {currentPage} of {totalPages}
                  </Typography>
                  <IconButton
                    size="small"
                    disabled={!hasNextPage}
                    onClick={nextPage}
                    aria-label="Next page"
                  >
                    <NavigateNextIcon />
                  </IconButton>
                </Box>
              </Box>
            )}
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
                        ...(isEntityPublishedToGithub(actionsMenuEntity)
                          ? [
                              <MenuItem
                                key="build"
                                onClick={() => {
                                  const targetEntity = actionsMenuEntity;
                                  handleActionsMenuClose();
                                  if (targetEntity) {
                                    startBuildFlow(targetEntity).catch(
                                      () => undefined,
                                    );
                                  }
                                }}
                              >
                                Build
                              </MenuItem>,
                            ]
                          : []),
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
              githubToken={githubToken}
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
