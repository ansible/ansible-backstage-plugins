import {
  Typography,
  makeStyles,
  Box,
  IconButton,
  Menu,
  MenuItem,
} from '@material-ui/core';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import {
  CatalogFilterLayout,
  EntityKindPicker,
  EntityListProvider,
  EntitySearchBar,
  UserListPicker,
  useEntityList,
  EntityTypeFilter,
  EntityTagFilter,
} from '@backstage/plugin-catalog-react';
import { TemplateGroups } from '@backstage/plugin-scaffolder-react/alpha';
import { WizardCard } from '../../Home/TemplateCard';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { rootRouteRef } from '../../../routes';
import { TagFilterPicker } from '../../utils/TagFilterPicker';

const useStyles = makeStyles(theme => ({
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  description: {
    color: theme.palette.text.secondary,
    fontSize: 16,
    lineHeight: 1.6,
    flex: 1,
  },
  layoutContainer: {
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
  },
}));

const EETagPicker = () => {
  const { backendEntities, filters, updateFilters } = useEntityList();
  const selectedTags = (filters.tags as EntityTagFilter)?.values ?? [];

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const entity of backendEntities) {
      const templateEntity = entity as TemplateEntityV1beta3;
      if (templateEntity.spec?.type?.includes('execution-environment')) {
        for (const tag of entity.metadata?.tags || []) {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [backendEntities]);

  const handleTagChange = (newValue: string[]) => {
    updateFilters({
      ...filters,
      tags: newValue.length > 0 ? new EntityTagFilter(newValue) : undefined,
    });
  };

  if (availableTags.length === 0) {
    return null;
  }

  return (
    <TagFilterPicker
      label="Tags"
      options={availableTags}
      value={selectedTags}
      onChange={handleTagChange}
    />
  );
};

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
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleAddTemplate = () => {
    handleMenuClose();
    navigate(`${rootLink()}/catalog-import`);
  };

  return (
    <div data-testid="create-content">
      <Box className={classes.headerRow}>
        <Typography variant="body1" className={classes.description}>
          Create an Execution Environment (EE) definition to ensure your
          playbooks run the same way, every time. Choose a recommended preset or
          start from scratch for full control. After saving your definition,
          follow our guide to create your EE image.
        </Typography>
        {allowed && (
          <>
            <IconButton
              data-testid="kebab-menu-button"
              aria-label="more options"
              aria-controls="ee-create-menu"
              aria-haspopup="true"
              onClick={handleMenuOpen}
            >
              <MoreVertIcon />
            </IconButton>
            <Menu
              id="ee-create-menu"
              anchorEl={menuAnchorEl}
              open={menuOpen}
              onClose={handleMenuClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              getContentAnchorEl={null}
              MenuListProps={{ autoFocusItem: false }}
            >
              <MenuItem
                data-testid="import-template-button"
                onClick={handleAddTemplate}
              >
                Import Template
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
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
              <EETagPicker />
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
