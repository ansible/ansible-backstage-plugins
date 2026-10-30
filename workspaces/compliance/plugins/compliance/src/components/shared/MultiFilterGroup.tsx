import { Chip, makeStyles } from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import type { FilterOption } from '../ResultsViewer/FilterGroup';
import { SURFACE_COLORS } from './colors';

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

interface MultiFilterGroupProps {
  label: string;
  options: FilterOption[];
  activeValues: Set<string>;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: (key: string) => void;
}

export const MultiFilterGroup = ({
  label,
  options,
  activeValues,
  expanded,
  onToggleExpand,
  onToggle,
}: MultiFilterGroupProps) => {
  const classes = useStyles();
  const activeCount = activeValues.size;
  const badgeLabel = activeCount > 0 ? `${label} (${activeCount})` : label;

  return (
    <div className={classes.root}>
      <Chip
        label={
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {badgeLabel}
            <ExpandMoreIcon
              className={`${classes.chevron} ${expanded ? classes.chevronOpen : ''}`}
            />
          </span>
        }
        size="small"
        variant={activeCount > 0 ? 'default' : 'outlined'}
        className={`${classes.groupChip} ${activeCount > 0 ? classes.groupChipActive : ''}`}
        onClick={onToggleExpand}
      />
      {expanded &&
        options.map(opt => {
          const isActive = activeValues.has(opt.key);
          return (
            <Chip
              key={opt.key}
              label={opt.label}
              size="small"
              className={`${classes.childChip} ${isActive ? classes.childChipActive : ''}`}
              variant={isActive ? 'default' : 'outlined'}
              style={
                isActive
                  ? { backgroundColor: opt.color, color: SURFACE_COLORS.onDark }
                  : undefined
              }
              onClick={() => onToggle(opt.key)}
            />
          );
        })}
    </div>
  );
};
