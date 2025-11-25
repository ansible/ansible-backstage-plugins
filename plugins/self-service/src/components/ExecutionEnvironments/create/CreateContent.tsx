import { Typography, makeStyles } from '@material-ui/core';
import { useEffect } from 'react';
import {
  CatalogFilterLayout,
  EntityKindPicker,
  EntityListProvider,
  EntitySearchBar,
  EntityTagPicker,
  UserListPicker,
  useEntityList,
  EntityTypeFilter,
} from '@backstage/plugin-catalog-react';
import { TemplateGroups } from '@backstage/plugin-scaffolder-react/alpha';
import { WizardCard } from '../../Home/TemplateCard';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';

const useStyles = makeStyles(theme => ({
  description: {
    color: theme.palette.text.secondary,
    fontSize: 16,
    lineHeight: 1.6,
    padding: '16px 0',
    width: '100%',
    marginBottom: '16px',
  },
}));

const ExecutionEnvironmentTypeFilter = () => {
  const { filters, updateFilters } = useEntityList();

  useEffect(() => {
    if (!filters.type) {
      updateFilters({
        ...filters,
        type: new EntityTypeFilter(['execution-environment']),
      });
    }
  }, [filters, updateFilters]);

  return null;
};

export const CreateContent = () => {
  const classes = useStyles();

  return (
    <div data-testid="create-content">
      <Typography variant="body1" className={classes.description}>
        Create an Execution Environment (EE) definition to ensure your playbooks
        run the same way, every time. Choose a recommended preset or start from
        scratch for full control. After saving your definition, follow our guide
        to create your EE image.
      </Typography>
      <EntityListProvider>
        <ExecutionEnvironmentTypeFilter />
        <CatalogFilterLayout>
          <CatalogFilterLayout.Filters>
            <div data-testid="search-bar-container">
              <EntitySearchBar />
            </div>
            <EntityKindPicker initialFilter="template" hidden />
            <div data-testid="user-picker-container">
              <UserListPicker
                initialFilter="all"
                availableFilters={['all', 'starred']}
              />
            </div>
            <EntityTagPicker />
          </CatalogFilterLayout.Filters>
          <CatalogFilterLayout.Content>
            <div data-testid="templates-container">
              <TemplateGroups
                groups={[
                  {
                    filter: (entity: TemplateEntityV1beta3) => {
                      // Filter for templates with execution-environment type
                      return (
                        entity.spec?.type?.includes('execution-environment') ??
                        false
                      );
                    },
                  },
                ]}
                TemplateCardComponent={WizardCard}
              />
            </div>
          </CatalogFilterLayout.Content>
        </CatalogFilterLayout>
      </EntityListProvider>
    </div>
  );
};
