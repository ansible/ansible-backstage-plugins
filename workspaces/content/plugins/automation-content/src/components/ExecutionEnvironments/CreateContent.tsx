import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import {
  EntityKindFilter,
  EntityListProvider,
  EntityTagFilter,
  EntityTextFilter,
  EntityTypeFilter,
  EntityUserFilter,
  useEntityList,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import { TemplateGroups } from '@backstage/plugin-scaffolder-react/alpha';
import type { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import {
  Box,
  Button,
  Flex,
  Grid,
  Menu,
  MenuItem,
  MenuTrigger,
  SearchField,
  Select,
} from '@backstage/ui';
import { WizardCard } from './create/WizardCard';
import { TagFilterPicker } from '../utils/TagFilterPicker';

function EETagPicker() {
  const { backendEntities, filters, updateFilters } = useEntityList();
  const selectedTags = (filters.tags as EntityTagFilter)?.values ?? [];
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const entity of backendEntities) {
      const templateEntity = entity as TemplateEntityV1beta3;
      if (templateEntity.spec?.type?.includes('execution-environment')) {
        for (const tag of entity.metadata?.tags || []) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [backendEntities]);
  if (!availableTags.length) return null;
  return (
    <TagFilterPicker
      label="Tags"
      options={availableTags}
      value={selectedTags}
      onChange={value =>
        updateFilters({
          ...filters,
          tags: value.length ? new EntityTagFilter(value) : undefined,
        })
      }
    />
  );
}

function ExecutionEnvironmentTypeFilter() {
  const { filters, updateFilters } = useEntityList();
  useEffect(() => {
    if (!filters.type)
      updateFilters({
        ...filters,
        kind: new EntityKindFilter('Template', 'Template'),
        type: new EntityTypeFilter(['execution-environment']),
      });
  }, [filters, updateFilters]);
  return null;
}

function TemplateFilters() {
  const { filters, updateFilters } = useEntityList();
  const { starredEntities } = useStarredEntities();
  return (
    <Flex direction="column" gap="3">
      <div data-testid="search-bar-container">
        <SearchField
          label="Search"
          value={filters.text?.value ?? ''}
          onChange={value =>
            updateFilters({
              text: value ? new EntityTextFilter(value) : undefined,
            })
          }
        />
      </div>
      <div data-testid="user-picker-container">
        <Select
          label="Favorites"
          value={filters.user?.value ?? 'all'}
          options={[
            { id: 'all', label: 'All' },
            { id: 'starred', label: 'Starred' },
          ]}
          onChange={value =>
            updateFilters({
              user:
                value === 'starred'
                  ? EntityUserFilter.starred(Array.from(starredEntities))
                  : EntityUserFilter.all(),
            })
          }
        />
      </div>
      <EETagPicker />
    </Flex>
  );
}

/** Port of the prototype EE template chooser, retaining catalog filter state. */
export function CreateContent(): ReactElement {
  const navigate = useNavigate();
  const { allowed } = usePermission({
    permission: catalogEntityCreatePermission,
  });
  return (
    <div data-testid="create-content">
      <Flex justify="end" mb="4">
        {allowed && (
          <MenuTrigger>
            <Button
              variant="tertiary"
              data-testid="kebab-menu-button"
              aria-label="more options"
            >
              ⋮
            </Button>
            <Menu>
              <MenuItem
                data-testid="import-template-button"
                onAction={() => navigate('/catalog-import')}
              >
                Import Template
              </MenuItem>
            </Menu>
          </MenuTrigger>
        )}
      </Flex>
      <EntityListProvider>
        <ExecutionEnvironmentTypeFilter />
        <Box p="4">
          <Grid.Root columns={{ initial: '1', lg: '12' }} gap="4">
            <Grid.Item colSpan={{ initial: '1', lg: '3' }}>
              <TemplateFilters />
            </Grid.Item>
            <Grid.Item colSpan={{ initial: '1', lg: '9' }}>
              <div data-testid="templates-container">
                <TemplateGroups
                  groups={[
                    {
                      filter: (entity: TemplateEntityV1beta3) =>
                        entity.spec?.type?.includes('execution-environment') ??
                        false,
                    },
                  ]}
                  TemplateCardComponent={WizardCard}
                />
              </div>
            </Grid.Item>
          </Grid.Root>
        </Box>
      </EntityListProvider>
    </div>
  );
}
