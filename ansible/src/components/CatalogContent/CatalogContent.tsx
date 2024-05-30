/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useEffect, useState } from 'react';
import { Progress } from '@backstage/core-components';
import {
  Divider,
  Grid,
  Typography,
  makeStyles,
  useTheme,
} from '@material-ui/core';
import {
  CatalogFilterLayout,
  EntityKindPicker,
  EntityListProvider,
  EntityTagFilter,
  EntityTypePicker,
  UserListPicker,
  catalogApiRef,
  useEntityList,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import { Table, TableColumn } from '@backstage/core-components';
import { Chip } from '@material-ui/core';
import Edit from '@material-ui/icons/Edit';
import { Link } from '@backstage/core-components';
import { Tooltip } from '@material-ui/core';
import { ANNOTATION_EDIT_URL, Entity } from '@backstage/catalog-model';
import { visuallyHidden } from '@mui/utils';
import { YellowStar } from '../OverviewContent/Favourites';
import StarBorder from '@material-ui/icons/StarBorder';
import { useApi } from '@backstage/core-plugin-api';
import { useEffectOnce } from 'react-use';

const useStyles = makeStyles(theme => ({
    flex: {
      display: 'flex',
    },
    ml_16: {
      marginLeft: theme.spacing(2),
    },
  })
);

export const AnsibleComponents = () => {
  const classes = useStyles();
  const theme = useTheme();
  const catalogApi = useApi(catalogApiRef);
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const [loading, setLoading] = useState<boolean>(true);
  const [showError, setShowError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [ansibleComponents, setAnsibleComponents] = useState<Entity[]>([]);

  const {filters, updateFilters} = useEntityList();

  const callApi = () => {
    catalogApi
      .getEntities({ filter: [{ kind: 'component', 'metadata.tags': 'ansible' }] })
      .then(entities => {
        setAllEntities(entities.items);
        setAnsibleComponents(entities.items.filter(item =>
          item.metadata.tags?.includes('ansible'),
        ));
        setLoading(false);
        setShowError(false);
      })
      .catch(error => {
        if (error) {
          setErrorMessage(error.message);
          setShowError(true);
        }
      });
  }

  useEffectOnce(() => {
    updateFilters({...filters, tags: new EntityTagFilter(['ansible'])});
    callApi();
  })

  useEffect(() => {
    if (filters.user?.value === 'starred')
      setAnsibleComponents(allEntities.filter(e => isStarredEntity(e)))
    else if (filters.user?.value === 'all')
      setAnsibleComponents(allEntities);
  }, [filters.user, allEntities, isStarredEntity])

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
      render: (entity: any) => (
        <Link to={`../../../catalog/default/component/${entity.metadata.name}`}>
          {entity.metadata.name}
        </Link>
      ),
    },
    { title: 'System', field: 'spec.system', id: 'system' },
    { title: 'Owner', field: 'spec.owner', id: 'owner' },
    { title: 'Type', field: 'spec.type', id: 'type' },
    { title: 'Lifecycle', field: 'spec.lifecycle', id: 'lifecycle' },
    {
      title: 'Tags',
      field: 'metadata.tags',
      id: 'tags',
      render: (entity: any) =>
        entity?.metadata?.tags?.map((tag: string, index: number) => (
          <Chip key={index} label={tag} />
        )),
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
          <div className={classes.flex}>
            <Tooltip title={starredTitle}>
              <div>
                <Typography style={visuallyHidden}>{starredTitle}</Typography>
                {isStarred ? (
                  <YellowStar onClick={() => toggleStarredEntity(entity)} />
                ) : (
                  <StarBorder onClick={() => toggleStarredEntity(entity)} />
                )}
              </div>
            </Tooltip>
            <Tooltip title="Edit">
              <div className={classes.ml_16}>
                <a href={editUrl} target="_blank">
                  <Typography style={visuallyHidden}>{title}</Typography>
                  <Edit fontSize="small" />
                </a>
              </div>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <CatalogFilterLayout>
      <CatalogFilterLayout.Filters>
        <Typography variant="h6" style={{ margin: theme.spacing(1) }}>
          Filters
        </Typography>
        <Divider />
        <EntityKindPicker initialFilter="component" hidden />
        <EntityTypePicker initialFilter="all" hidden />
        <UserListPicker availableFilters={['starred', 'all']} />
      </CatalogFilterLayout.Filters>
      <CatalogFilterLayout.Content>
        <Table
          title={`All components (${ansibleComponents?.length})`}
          options={{
            search: true,
          }}
          columns={columns}
          data={ansibleComponents || []}
        />
      </CatalogFilterLayout.Content>
    </CatalogFilterLayout>
  );
};

export const EntityCatalogContent = () => {
  const classes = useStyles();

  return (
    <Grid container spacing={2} justifyContent="space-between">
      <Grid item xs={12} className={classes.flex}>
        <EntityListProvider>
          <AnsibleComponents />
        </EntityListProvider>
      </Grid>
    </Grid>
  );
};
