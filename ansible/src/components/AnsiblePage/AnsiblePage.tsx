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
import { Typography, Grid, Tab } from '@material-ui/core';
import {
  InfoCard,
  Header,
  Page,
  Content,
  ContentHeader,
  SupportButton,
  TabbedCard,
} from '@backstage/core-components';
import { EntityOverviewContent } from '../OverviewContent';
import { EntityCatalogContent } from '../CatalogContent';
import { EntityCreateContent } from '../CreateContent';
import { EntityLearnContent } from '../LearnContent';
import { EntityDiscoverContent } from '../DiscoverContent';

export const AnsiblePage = () => (
  <Page themeId="tool">
    <Header title="Ansible"/>
    <Content>
      <TabbedCard>
        <Tab label="Overview">
          <EntityOverviewContent />
        </Tab>
        <Tab label="Catalog">
          <EntityCatalogContent />
        </Tab>
        <Tab label="Create">
          <EntityCreateContent />
        </Tab>
        <Tab label="Discover">
          <EntityDiscoverContent />
        </Tab>
        <Tab label="Learn">
          <EntityLearnContent />
        </Tab>
      </TabbedCard>
    </Content>
  </Page>
);
