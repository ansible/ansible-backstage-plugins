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

import React from 'react';
import { InfoCard } from '@backstage/core-components';
import { Grid, Typography, makeStyles } from '@material-ui/core';
import { useAsync } from 'react-use';
import { catalogApiRef, getEntitySourceLocation } from '@backstage/plugin-catalog-react';
import { useApi } from '@backstage/core-plugin-api';
import { Table, TableColumn } from '@backstage/core-components';
import { Chip } from '@material-ui/core';
// eslint-disable-next-line no-restricted-imports
import { Edit } from '@material-ui/icons';
import { Link } from '@backstage/core-components';
import { IconButton, Tooltip } from '@material-ui/core';
import {
  scmIntegrationsApiRef,
} from '@backstage/integration-react';
// eslint-disable-next-line no-restricted-imports
import { Visibility } from '@material-ui/icons';


const useStyles = makeStyles({
  container: {
    backgroundColor: 'default',
    padding: '20px',
  },
  text: {
    color: 'white',
    marginTop: '5px',
    fontSize: '15px', // Increase the font size as needed
  },
  divider: {
    margin: '20px 0',
    backgroundColor: 'white', // Make the divider white so it stands out on the light blue background
  },
});


 const EntityCreateCard = () => {
  const classes = useStyles();
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <InfoCard title="Find your stuff">
          <Typography variant="body1" className={classes.text}>
            Here is a list of all the components you created in the Developer Hub, Ansible plugin. <br />
            Any Anisble content will automatically be tagged with 'ansible'.
          </Typography>
        </InfoCard>
      </Grid>
    </Grid>
  )
}

export const AnsibleComponents = () => {
  const catalogApi = useApi(catalogApiRef);
  const { value: entities, loading, error } = useAsync(() => {
    return catalogApi.getEntities();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  const ansibleEntities = entities?.items.filter(entity =>
    entity.metadata.tags &&
    entity.metadata.tags.includes('ansible') &&
    entity.kind.toLocaleLowerCase('en-US') === 'component'
  );

  const columns: TableColumn[] = [
    { title: 'Name', field: 'metadata.name', highlight: true },
    { title: 'System', field: 'spec.system' },
    { title: 'Owner', field: 'spec.owner' },
    { title: 'Type', field: 'spec.type' },
    { title: 'Lifecycle', field: 'spec.lifecycle' },
    {
      title: 'Tags',
      field: 'metadata.tags',
      render: (entity: any) => entity.metadata.tags.map((tag: string) => <Chip key={tag} label={tag} />),
      cellStyle: { padding: '0px 16px 0px 20px' },
    },
    {
      title: 'Actions',
      render: (entity: any) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const scmIntegrationsApi = useApi(scmIntegrationsApiRef);
        const entitySourceLocation = getEntitySourceLocation(
          entity,
          scmIntegrationsApi,
        );
        const repoUrl = entitySourceLocation?.locationTargetUrl.replace(/\/$/, "");
        const viewUrl = `${repoUrl}/catalog-info.yaml`;
        const editUrl = viewUrl.replace('/tree/', '/edit/');

        return (
          <div>
            <Tooltip title="View">
              <IconButton component={Link} to={viewUrl} target="_blank">
                <Visibility />
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit">
              <IconButton component={Link} to={editUrl} target="_blank">
                <Edit />
              </IconButton>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <Table
      title={`All components (${ansibleEntities?.length})`}
      options={{ search: true }}
      columns={columns}
      data={ansibleEntities || []}
    />
  );
};

export const EntityCatalogContent = () => {
  return (
    <><EntityCreateCard /><AnsibleComponents /></>
  );
};
