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

import React, { useEffect } from 'react';
import { ContentHeader } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';
import {
  CatalogFilterLayout,
  EntityKindFilter,
  EntityKindPicker,
  EntityListProvider,
  EntitySearchBar,
  EntityTagFilter,
  UserListPicker,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import { Content, Page, Progress } from '@backstage/core-components';
import { Entity } from '@backstage/catalog-model';
import { TemplateGroups } from '@backstage/plugin-scaffolder-react/alpha';
import { useNavigate } from 'react-router';

const useStyles = makeStyles(theme => ({
  container: {
    // backgroundColor: 'default',
    padding: '20px',
  },
  text: {
    marginTop: '5px',
    fontSize: '15px', // Increase the font size as needed
  },
  card: {
    maxWidth: 345,
    backgroundColor:
      theme.palette.type === 'light' ? '#1f1f1f' : 'currentColor', // Set the background color of the card to a dark gray
  },
  cardContent: {
    textAlign: 'left', // Align the card content to the left
  },
  flex: {
    display: 'flex',
  },
  img_create: {
    width: '50px',
    height: '50px',
    margin: '5px',
  },
  fw_700: {
    fontWeight: 700,
  },
  fontSize14: {
    fontSize: '14px',
  },
  pt_05: {
    paddingTop: '0.5rem',
  },
}));

export const EntityCreateContentCards = () => {
  const navigate = useNavigate();

  const { loading, error, filters, updateFilters } = useEntityList();

  useEffect(() => {
    if (!filters.tags) {
      updateFilters({
        ...filters,
        tags: new EntityTagFilter(['ansible']),
      });
    }
  }, [filters, updateFilters]);

  if (loading) {
    return (
      <div>
        <Progress />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <Page themeId="home">
      <Content>
        <ContentHeader title="Available Templates" />

        <CatalogFilterLayout>
          <CatalogFilterLayout.Filters>
            <EntitySearchBar />
            <EntityKindPicker initialFilter="template" hidden />
            <UserListPicker availableFilters={['starred', 'all']} />
          </CatalogFilterLayout.Filters>
          <CatalogFilterLayout.Content>
            <TemplateGroups
              groups={[
                {
                  filter: (entity: Entity) =>
                    entity.metadata.tags
                      ? entity.metadata.tags.includes('ansible')
                      : false,
                },
              ]}
              onTemplateSelected={(entity: Entity) =>
                navigate(
                  `../../../create/templates/default/${entity.metadata.name}`,
                )
              }
            />
          </CatalogFilterLayout.Content>
        </CatalogFilterLayout>
      </Content>
    </Page>
  );
};

export const EntityCreateContent = () => {
  return (
    <>
      <EntityListProvider>
        <EntityCreateContentCards />
      </EntityListProvider>
    </>
  );
};
