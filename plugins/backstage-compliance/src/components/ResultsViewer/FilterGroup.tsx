import { Chip, makeStyles } from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    flexWrap: 'nowrap',
  },
  groupChip: {
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '0.75rem',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  groupChipActive: {
    backgroundColor: theme.palette.action.selected,
  },
  chevron: {
    fontSize: 16,
    marginLeft: -4,
    transition: 'transform 150ms',
  },
  chevronOpen: {
    transform: 'rotate(180deg)',
  },
  childChip: {
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '0.75rem',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  childChipActive: {
    fontWeight: 600,
  },
}));

export interface FilterOption {
  key: string;
  label: string;
  color: string;
}

interface FilterGroupProps {
  label: string;
  options: FilterOption[];
  activeValue: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelect: (key: string) => void;
}

export const FilterGroup = ({
  label,
  options,
  activeValue,
  expanded,
  onToggleExpand,
  onSelect,
}: FilterGroupProps) => {
  const classes = useStyles();
  const activeCount = activeValue !== 'all' ? 1 : 0;
  const badgeLabel = activeCount > 0 ? `${label} (${activeCount})` : label;

  return (
    <div className={classes.root}>
      <Chip
        label={
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {badgeLabel}
            <ExpandMoreIcon
              className={`${classes.chevron} ${
                expanded ? classes.chevronOpen : ''
              }`}
            />
          </span>
        }
        size="small"
        variant={activeCount > 0 ? 'default' : 'outlined'}
        className={`${classes.groupChip} ${
          activeCount > 0 ? classes.groupChipActive : ''
        }`}
        onClick={onToggleExpand}
      />
      {expanded &&
        options.map(opt => {
          const isActive = activeValue === opt.key;
          return (
            <Chip
              key={opt.key}
              label={opt.label}
              size="small"
              className={`${classes.childChip} ${
                isActive ? classes.childChipActive : ''
              }`}
              variant={isActive ? 'default' : 'outlined'}
              style={
                isActive
                  ? { backgroundColor: opt.color, color: '#fff' }
                  : undefined
              }
              onClick={() => onSelect(isActive ? 'all' : opt.key)}
            />
          );
        })}
    </div>
  );
};
