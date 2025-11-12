import { Typography, makeStyles, Button, Box } from '@material-ui/core';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
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
import { rootRouteRef } from '../../../routes';

const useStyles = makeStyles(theme => ({
  description: {
    color: theme.palette.text.secondary,
    fontSize: 16,
    lineHeight: 1.6,
    padding: '16px 0',
    width: '100%',
    marginBottom: '16px',
  },
  buttonContainer: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '16px',
  },
  layoutContainer: {
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
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
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
  const { allowed } = usePermission({
    permission: catalogEntityCreatePermission,
  });

  return (
    <div data-testid="create-content">
      <Typography variant="body1" className={classes.description}>
        Create an Execution Environment (EE) definition to ensure your playbooks
        run the same way, every time. Choose a recommended preset or start from
        scratch for full control. After saving your definition, follow our guide
        to create your EE image.
      </Typography>
      {allowed && (
        <Box className={classes.buttonContainer}>
          <Button
            data-testid="add-template-button"
            onClick={() => navigate(`${rootLink()}/catalog-import`)}
            variant="contained"
            style={{ minWidth: '150px', padding: '8px 24px' }}
          >
            Add Template
          </Button>
        </Box>
      )}
      <EntityListProvider>
        <ExecutionEnvironmentTypeFilter />
        <Box className={classes.layoutContainer}>
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
                          entity.spec?.type?.includes(
                            'execution-environment',
                          ) ?? false
                        );
                      },
                    },
                  ]}
                  TemplateCardComponent={WizardCard}
                />
              </div>
            </CatalogFilterLayout.Content>
          </CatalogFilterLayout>
        </Box>
      </EntityListProvider>
    </div>
  );
};
