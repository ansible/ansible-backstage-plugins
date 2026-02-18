import { useEffect, useState, useCallback, useRef } from 'react';
import { Progress } from '@backstage/core-components';
import {
  FormControl,
  Grid,
  Input,
  MenuItem,
  Paper,
  Select,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import {
  CatalogFilterLayout,
  EntityKindFilter,
  EntityListProvider,
  EntityTagFilter,
  UserListPicker,
  catalogApiRef,
  useEntityList,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import { Table, TableColumn } from '@backstage/core-components';
import { Chip, IconButton } from '@material-ui/core';
import Edit from '@material-ui/icons/Edit';
import { Tooltip } from '@material-ui/core';
import { ANNOTATION_EDIT_URL, Entity } from '@backstage/catalog-model';
import StarBorder from '@material-ui/icons/StarBorder';
import { useApi } from '@backstage/core-plugin-api';
import { useNavigate } from 'react-router-dom';
import { YellowStar } from './Favourites';
import { CreateCatalog } from './CreateCatalog';

const visuallyHidden: React.CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  top: 20,
  width: 1,
  whiteSpace: 'nowrap',
};

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

export const EEListPage = ({
  onTabSwitch,
}: {
  onTabSwitch: (index: number) => void;
}) => {
  const classes = useStyles();
  const catalogApi = useApi(catalogApiRef);
  const navigate = useNavigate();
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const [loading, setLoading] = useState<boolean>(true);
  const [showError, setShowError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [ansibleComponents, setAnsibleComponents] = useState<Entity[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<'All' | string>('All');
  const [tagFilter, setTagFilter] = useState<'All' | string>('All');
  const [allOwners, setAllOwners] = useState<string[]>(['All']);
  const [allTags, setAllTags] = useState<string[]>(['All']);
  const [filtered, setFiltered] = useState<boolean>(true);
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());
  const { filters, updateFilters } = useEntityList();

  const isMountedRef = useRef(true);

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
      } catch (error) {
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

  function sortByMetadataTitleAsc<T extends { metadata?: { name?: string } }>(
    data: T[],
  ): T[] {
    return [...data].sort((a, b) => {
      const titleA = a.metadata?.name ?? '';
      const titleB = b.metadata?.name ?? '';

      const numA = Number(titleA);
      const numB = Number(titleB);

      const isNumA = !isNaN(numA);
      const isNumB = !isNaN(numB);

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

        const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          navigate(linkPath);
        };

        return (
          <button
            type="button"
            onClick={handleClick}
            onMouseDown={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(linkPath);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(e);
              }
            }}
            className={classes.entityLink}
          >
            {entityName}
          </button>
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
    { title: 'Description', field: 'metadata.description', id: 'description' },
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
        const editUrl = entity.metadata.annotations?.[ANNOTATION_EDIT_URL];
        const title = 'Edit';
        const isStarred = isStarredEntity(entity);
        const starredTitle = isStarred
          ? 'Remove from favorites'
          : 'Add to favorites';

        return (
          <div
            className={classes.flex}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <Tooltip title={starredTitle}>
              <IconButton
                size="small"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleStarredEntity(entity);
                }}
                onMouseDown={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleStarredEntity(entity);
                }}
                onMouseUp={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={classes.actionButton}
                aria-label={starredTitle}
              >
                <Typography style={visuallyHidden}>{starredTitle}</Typography>
                {isStarred ? <YellowStar /> : <StarBorder />}
              </IconButton>
            </Tooltip>
            {!(
              entity &&
              entity.metadata &&
              entity.metadata.annotations &&
              entity.metadata.annotations['ansible.io/download-experience']
                ?.toString()
                .toLowerCase()
                .trim() === 'true'
            ) && (
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (editUrl) {
                      window.open(editUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  onMouseDown={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (editUrl) {
                      window.open(editUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  onMouseUp={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className={classes.actionButton}
                  aria-label={title}
                  disabled={!editUrl}
                >
                  <Typography style={visuallyHidden}>{title}</Typography>
                  <Edit fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
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
      <>
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
                    onChange={e => setOwnerFilter(e.target.value as any)}
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
                    onChange={e => setTagFilter(e.target.value as any)}
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
            </CatalogFilterLayout.Content>
          </CatalogFilterLayout>
        ) : (
          <CreateCatalog onTabSwitch={onTabSwitch} />
        )}
      </>
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
