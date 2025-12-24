import {
  Typography,
  makeStyles,
  Box,
  Checkbox,
  TextField,
  IconButton,
  Menu,
  MenuItem,
} from '@material-ui/core';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import Autocomplete from '@material-ui/lab/Autocomplete';
import CheckBoxOutlineBlankIcon from '@material-ui/icons/CheckBoxOutlineBlank';
import CheckBoxIcon from '@material-ui/icons/CheckBox';
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

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

const EETagPicker = () => {
  const { backendEntities, filters, updateFilters } = useEntityList();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();

    for (const entity of backendEntities) {
      const templateEntity = entity as TemplateEntityV1beta3;
      if (templateEntity.spec?.type?.includes('execution-environment')) {
        const tags = entity.metadata?.tags || [];
        for (const tag of tags) {
          tagSet.add(tag);
        }
      }
    }

    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [backendEntities]);

  const handleTagChange = (_event: any, newValue: string[]) => {
    setSelectedTags(newValue);

    if (newValue.length > 0) {
      updateFilters({
        ...filters,
        tags: new EntityTagFilter(newValue),
      });
    } else {
      updateFilters({
        ...filters,
        tags: undefined,
      });
    }
  };

  if (availableTags.length === 0) {
    return null;
  }

  return (
    <Box pb={1} pt={1}>
      <Typography
        variant="subtitle2"
        component="label"
        style={{ fontWeight: 500 }}
      >
        Tags
      </Typography>
      <Autocomplete
        multiple
        options={availableTags}
        disableCloseOnSelect
        value={selectedTags}
        onChange={handleTagChange}
        getOptionLabel={option => option}
        renderOption={(option, { selected }) => (
          <>
            <Checkbox
              icon={icon}
              checkedIcon={checkedIcon}
              checked={selected}
              style={{ marginRight: 8 }}
            />
            {option}
          </>
        )}
        size="small"
        renderInput={params => (
          <TextField {...params} variant="outlined" placeholder="Tags" />
        )}
      />
    </Box>
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
