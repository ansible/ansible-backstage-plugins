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
import { ContentHeader, InfoCard } from '@backstage/core-components';
import { CardContent, CardHeader, Grid, Typography, makeStyles, Card, CardActionArea, CardActions, Button, Box } from '@material-ui/core';
import { useAsync } from 'react-use';
import { CatalogFilterLayout, EntityKindPicker, EntityListProvider, EntitySearchBar, EntityTagPicker, UserListPicker, catalogApiRef } from '@backstage/plugin-catalog-react';
import { useApi } from '@backstage/core-plugin-api';
import { Content, Header, Page, Progress} from '@backstage/core-components';
import { Entity } from '@backstage/catalog-model';
import { ScaffolderPageContextMenu, TemplateCategoryPicker, TemplateGroups } from '@backstage/plugin-scaffolder-react/alpha';

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
  card: {
    maxWidth: 345,
    backgroundColor: '#1f1f1f', // Set the background color of the card to a dark gray
    color: 'white', // Set the text color to white
  },
  cardContent: {
    textAlign: 'left', // Align the card content to the left
  },
});

const EntityCreateIntroCard = () => {
  const classes = useStyles();
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <InfoCard title="Easy creation with templates">
          <Typography variant="body1" className={classes.text}>
            Create new components with a single, clear,<br />
            opinionated method to accomplish a specific task
          </Typography>
        </InfoCard>
      </Grid>
    </Grid>
  )
}

export const EntityCreateContentCards = () => {
  const classes = useStyles();
  const catalogApi = useApi(catalogApiRef);
  const { value: templates, loading, error } = useAsync(() => {
    return catalogApi.getEntities({ filter: { kind: 'Template' } });
  }, []);

  if (loading) {
    return <Progress />;
  }

  if (error || !templates) {
    return <Typography variant="h6">Failed to load templates</Typography>;
  }

  const ansibleTemplates = templates.items.filter(template =>
    template.metadata.tags?.includes('ansible'),
  );

  return (
<EntityListProvider>
  <Page themeId="home">
    <Content>
      <ContentHeader title="Available Templates" />

      <CatalogFilterLayout>
        <CatalogFilterLayout.Filters>
          <EntitySearchBar />
          <EntityKindPicker initialFilter="template" hidden />
          <UserListPicker
            initialFilter="all"
            availableFilters={['starred']}
          />
        </CatalogFilterLayout.Filters>
        <CatalogFilterLayout.Content>
          {ansibleTemplates.map((template, index) => (
        <TemplateGroups
        key={index}
        groups={[{
          filter: (entity: Entity) => entity.metadata.tags?.includes('ansible') || false
        }]}
        // TemplateCardComponent={undefined}
        // onTemplateSelected={(_template: Entity) => {}}
        // additionalLinksForEntity={(entity: Entity) => []}
        />
      ))}
        </CatalogFilterLayout.Content>
      </CatalogFilterLayout>
    </Content>
  </Page>
</EntityListProvider>
  );
};

export const EntityCreateContent = () => {
  return (
    <><EntityCreateIntroCard /><EntityCreateContentCards /></>
  );
};
