import {
  Button,
  ButtonIcon,
  Checkbox,
  Flex,
  SearchField,
  Select,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import type { ReactElement } from 'react';
import { HelpIcon } from '../common/icons';
import StarIcon from '@material-ui/icons/Star';
import type { CollectionSourceFilter } from './collectionHelpers';
import styles from './CollectionsCatalogPage.module.css';

export interface CollectionsFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  scope: 'all' | 'starred';
  onScopeChange: (scope: 'all' | 'starred') => void;
  allCount: number | string;
  starredCount: number;
  starredAvailable: boolean;
  sourceTypeOptions: Array<{ id: CollectionSourceFilter; label: string }>;
  sourceTypeFilter: CollectionSourceFilter;
  sourceTypeFilterAvailable: boolean;
  onSourceTypeFilterChange: (value: CollectionSourceFilter) => void;
  tags: string[];
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
  tagsAvailable: boolean;
  latestOnly: boolean;
  onLatestOnlyChange: (value: boolean) => void;
}

/** Compact filter rail patterned after Tina's collections catalog. */
export function CollectionsFilters({
  search,
  onSearchChange,
  scope,
  onScopeChange,
  allCount,
  starredCount,
  starredAvailable,
  sourceTypeOptions,
  sourceTypeFilter,
  sourceTypeFilterAvailable,
  onSourceTypeFilterChange,
  tags,
  tagFilter,
  onTagFilterChange,
  tagsAvailable,
  latestOnly,
  onLatestOnlyChange,
}: CollectionsFiltersProps): ReactElement {
  const tagOptions = [
    { id: 'all', label: 'All tags' },
    ...tags.map(tag => ({ id: tag, label: tag })),
  ];
  const sourceTypeSelect = (
    <Select
      label="Source type"
      value={sourceTypeFilter}
      options={sourceTypeOptions}
      onChange={value =>
        onSourceTypeFilterChange(String(value) as CollectionSourceFilter)
      }
      isDisabled={!sourceTypeFilterAvailable}
    />
  );
  const tagSelect = (
    <Select
      label="Tags"
      value={tagFilter}
      options={tagOptions}
      onChange={value => onTagFilterChange(String(value))}
      isDisabled={!tagsAvailable || !tags.length}
    />
  );
  const personalScopeButton = (
    <Button
      className={styles.scopeOption}
      size="small"
      variant="secondary"
      aria-pressed={scope === 'starred'}
      isDisabled={!starredAvailable}
      aria-label={
        starredAvailable
          ? `Favorites, ${starredCount}`
          : 'Favorites, unavailable for current catalog results'
      }
      onPress={() => onScopeChange('starred')}
    >
      <Flex
        align="center"
        justify="between"
        className={styles.scopeOptionContent}
      >
        <Flex align="center" gap="2">
          <StarIcon fontSize="small" aria-hidden="true" />
          <span>Favorites</span>
        </Flex>
        <span className={styles.scopeCount}>
          {starredAvailable ? starredCount : '—'}
        </span>
      </Flex>
    </Button>
  );
  const companyScopeButton = (
    <Button
      className={styles.scopeOption}
      size="small"
      variant="secondary"
      aria-pressed={scope === 'all'}
      aria-label={`All, ${allCount}`}
      onPress={() => onScopeChange('all')}
    >
      <Flex
        align="center"
        justify="between"
        className={styles.scopeOptionContent}
      >
        <span>All</span>
        <span className={styles.scopeCount}>{allCount}</span>
      </Flex>
    </Button>
  );

  return (
    <Flex direction="column" gap="4" className={styles.filterRail}>
      <SearchField
        label="Search"
        placeholder="Search collections"
        value={search}
        onChange={onSearchChange}
      />

      <div
        className={styles.scopeControl}
        role="group"
        aria-label="Collection scope"
      >
        <div className={styles.scopeSection}>
          <Text
            as="h3"
            variant="body-small"
            weight="bold"
            className={styles.scopeHeading}
          >
            Personal
          </Text>
          {personalScopeButton}
        </div>
        <div className={styles.scopeSection}>
          <Text
            as="h3"
            variant="body-small"
            weight="bold"
            className={styles.scopeHeading}
          >
            Company
          </Text>
          {companyScopeButton}
        </div>
      </div>

      <div className={styles.facetWithHint}>
        {sourceTypeSelect}
        {!sourceTypeFilterAvailable && (
          <TooltipTrigger>
            <ButtonIcon
              variant="tertiary"
              icon={<HelpIcon />}
              aria-label="About source type filtering"
            />
            <Tooltip>
              No source type can be verified for the current collection results.
            </Tooltip>
          </TooltipTrigger>
        )}
      </div>

      <div className={styles.facetWithHint}>
        {tagSelect}
        {(!tagsAvailable || !tags.length) && (
          <TooltipTrigger>
            <ButtonIcon
              variant="tertiary"
              icon={<HelpIcon />}
              aria-label="About tag filtering"
            />
            <Tooltip>
              No catalog tags are available for the current collection results.
            </Tooltip>
          </TooltipTrigger>
        )}
      </div>

      <Checkbox isSelected={latestOnly} onChange={onLatestOnlyChange}>
        Show latest version only
      </Checkbox>
    </Flex>
  );
}
