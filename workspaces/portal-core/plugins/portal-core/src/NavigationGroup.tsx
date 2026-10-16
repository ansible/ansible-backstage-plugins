import { useState } from 'react';
import { Button, Collapse, makeStyles } from '@material-ui/core';
import { SidebarItem, useSidebarOpenState } from '@backstage/core-components';
import type { ResolvedNavigationItem } from './navigationItems';

const useStyles = makeStyles(theme => ({
  button: {
    color: theme.palette.navigation?.color ?? theme.palette.text.primary,
    justifyContent: 'flex-start',
    textTransform: 'none',
    width: '100%',
    minHeight: 48,
    padding: theme.spacing(1, 2),
  },
  icon: { display: 'inline-flex', minWidth: 24 },
  openIcon: { marginRight: theme.spacing(2) },
  title: { flexGrow: 1, textAlign: 'left' },
  arrow: { marginLeft: theme.spacing(1) },
  children: { paddingLeft: theme.spacing(1) },
}));

/** Click/keyboard expansion, rather than a hover-only sidebar flyout. */
export function NavigationGroup({
  entry,
  activePath,
}: {
  entry: Extract<ResolvedNavigationItem, { children: unknown }>;
  activePath?: string;
}) {
  const classes = useStyles();
  const { isOpen } = useSidebarOpenState();
  const [expanded, setExpanded] = useState(
    entry.children.some(child => child.item.href === activePath),
  );
  const regionId = `portal-navigation-${encodeURIComponent(entry.id)}`;
  return (
    <>
      <Button
        className={classes.button}
        aria-label={entry.title}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded(value => !value)}
      >
        <span className={`${classes.icon} ${isOpen ? classes.openIcon : ''}`}>
          {entry.children[0].item.icon}
        </span>
        {isOpen && <span className={classes.title}>{entry.title}</span>}
        {isOpen && (
          <span className={classes.arrow} aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </Button>
      <Collapse in={expanded} unmountOnExit>
        <div className={classes.children} id={regionId}>
          {entry.children.map(child => (
            <SidebarItem
              key={child.id}
              text={child.title}
              to={child.item.href}
              icon={() => child.item.icon}
              end={child.item.href !== activePath}
            />
          ))}
        </div>
      </Collapse>
    </>
  );
}
