import React from 'react';
import { Button, makeStyles } from '@material-ui/core';
import { Content, Header, Page } from '@backstage/core-components';
import {
  CatalogFilterLayout,
  EntityKindPicker,
  EntityListProvider,
  EntityOwnerPicker,
  EntitySearchBar,
  EntityTagPicker,
  UserListPicker,
} from '@backstage/plugin-catalog-react';
import {
  TemplateCategoryPicker,
  TemplateGroups,
} from '@backstage/plugin-scaffolder-react/alpha';
import { WizardCard } from './TemplateCard';
import { useNavigate } from 'react-router';
import { useRouteRef } from '@backstage/core-plugin-api';
import { rootRouteRef } from '../../routes';

const headerStyles = makeStyles(theme => ({
  header_title_color: {
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
  },
  header_subtitle: {
    display: 'inline-block',
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
    opacity: 0.8,
    maxWidth: '75ch',
    marginTop: '8px',
    fontWeight: 500,
    lineHeight: 1.57,
  },
}));

export const HomeComponent = () => {
  const classes = headerStyles();
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
  return (
    <Page themeId="app">
      <Header
        pageTitleOverride="Ansible Portal - View Templates"
        title={<span className={classes.header_title_color}>Templates</span>}
        subtitle={
          <span className={classes.header_subtitle}>
            Browse through automation template. Upon launching a template, a new
            job will be created and executed in AAP.
          </span>
        }
        style={{ background: 'inherit' }}
      >
        <Button
          onClick={() => navigate(`${rootLink()}/catalog-import`)}
          variant="contained"
        >
          Add Template
        </Button>
      </Header>
      <Content>
        <EntityListProvider>
          <CatalogFilterLayout>
            <CatalogFilterLayout.Filters>
              <EntitySearchBar />
              <EntityKindPicker initialFilter="template" hidden />
              <UserListPicker
                initialFilter="all"
                availableFilters={['all', 'starred']}
              />
              <TemplateCategoryPicker />
              <EntityTagPicker />
              <EntityOwnerPicker />
            </CatalogFilterLayout.Filters>
            <CatalogFilterLayout.Content>
              <TemplateGroups
                groups={[
                  {
                    filter: () => true,
                  },
                ]}
                TemplateCardComponent={WizardCard}
              />
            </CatalogFilterLayout.Content>
          </CatalogFilterLayout>
        </EntityListProvider>
      </Content>
    </Page>
  );
};
