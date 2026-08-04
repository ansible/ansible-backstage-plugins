import { useMemo } from 'react';
import type { FC } from 'react';
import { Chip, makeStyles } from '@material-ui/core';
import type { FilterOption } from '../ResultsViewer/FilterGroup';
import { MultiFilterGroup } from '../shared/MultiFilterGroup';
import { SURFACE_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
    flexWrap: 'wrap',
  },
  activeFilters: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    flexWrap: 'wrap',
    marginBottom: theme.spacing(1.5),
  },
  filterPill: {
    fontWeight: 500,
    fontSize: '0.75rem',
  },
}));

interface TrendFilterBarProps {
  profileOptions: FilterOption[];
  inventoryOptions: FilterOption[];
  selectedProfiles: Set<string>;
  selectedInventories: Set<string>;
  expandedGroup: string | null;
  onToggleGroup: (group: string) => void;
  onToggleProfile: (profileId: string) => void;
  onToggleInventory: (inventoryId: string) => void;
  onClearAll: () => void;
}

export const TrendFilterBar: FC<TrendFilterBarProps> = ({
  profileOptions,
  inventoryOptions,
  selectedProfiles,
  selectedInventories,
  expandedGroup,
  onToggleGroup,
  onToggleProfile,
  onToggleInventory,
  onClearAll,
}) => {
  const classes = useStyles();
  const hasActiveFilters =
    selectedProfiles.size > 0 || selectedInventories.size > 0;

  const profileColorMap = useMemo(
    () => new Map(profileOptions.map(o => [o.key, o.color])),
    [profileOptions],
  );
  const inventoryColorMap = useMemo(
    () => new Map(inventoryOptions.map(o => [o.key, o.color])),
    [inventoryOptions],
  );
  const profileLabelMap = useMemo(
    () => new Map(profileOptions.map(o => [o.key, o.label])),
    [profileOptions],
  );
  const inventoryLabelMap = useMemo(
    () => new Map(inventoryOptions.map(o => [o.key, o.label])),
    [inventoryOptions],
  );

  return (
    <>
      <div className={classes.controls}>
        <MultiFilterGroup
          label="Profiles"
          options={profileOptions}
          activeValues={selectedProfiles}
          expanded={expandedGroup === 'profiles'}
          onToggleExpand={() => onToggleGroup('profiles')}
          onToggle={onToggleProfile}
        />
        <MultiFilterGroup
          label="Inventories"
          options={inventoryOptions}
          activeValues={selectedInventories}
          expanded={expandedGroup === 'inventories'}
          onToggleExpand={() => onToggleGroup('inventories')}
          onToggle={onToggleInventory}
        />
      </div>
      {hasActiveFilters && (
        <div className={classes.activeFilters}>
          {[...selectedProfiles].map(pid => (
            <Chip
              key={`p-${pid}`}
              label={profileLabelMap.get(pid) ?? pid}
              size="small"
              className={classes.filterPill}
              style={{
                backgroundColor: profileColorMap.get(pid),
                color: SURFACE_COLORS.onDark,
              }}
              onDelete={() => onToggleProfile(pid)}
            />
          ))}
          {[...selectedInventories].map(iid => (
            <Chip
              key={`i-${iid}`}
              label={inventoryLabelMap.get(iid) ?? iid}
              size="small"
              className={classes.filterPill}
              style={{
                backgroundColor: inventoryColorMap.get(iid),
                color: SURFACE_COLORS.onDark,
              }}
              onDelete={() => onToggleInventory(iid)}
            />
          ))}
          <Chip
            label="Clear all"
            size="small"
            variant="outlined"
            className={classes.filterPill}
            onDelete={onClearAll}
            onClick={onClearAll}
          />
        </div>
      )}
    </>
  );
};
