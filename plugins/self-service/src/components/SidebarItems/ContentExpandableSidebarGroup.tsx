import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  sidebarConfig,
  useSidebarOpenState,
} from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Collapse from '@material-ui/core/Collapse';
import { makeStyles } from '@material-ui/core/styles';
import CodeIcon from '@material-ui/icons/Code';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import clsx from 'clsx';
import { useLocation } from 'react-router-dom';

import { rootRouteRef } from '../../routes';
import {
  contentQualitySidebarPath,
  isContentQualitySidebarNav,
  repositoriesQualityPath,
} from './contentNav';

type ContentChildItem = {
  id: string;
  title: string;
  path: string;
  /** Child is active when current URL matches any of these prefixes. */
  activePrefixes?: string[];
};

const useStyles = makeStyles(
  theme => ({
    root: {
      color: theme.palette.navigation.color,
    },
    parentButton: {
      display: 'flex',
      flexFlow: 'row nowrap',
      alignItems: 'center',
      height: 48,
      width: '100%',
      margin: 0,
      padding: 0,
      textAlign: 'inherit',
      font: 'inherit',
      textTransform: 'none',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'inherit',
      '&:hover': {
        background:
          theme.palette.navigation.navItem?.hoverBackground ?? '#404040',
      },
    },
    parentOpen: {
      width: sidebarConfig.drawerWidthOpen,
      paddingLeft: theme.spacing(1),
    },
    parentClosed: {
      width: sidebarConfig.drawerWidthClosed,
      justifyContent: 'center',
    },
    iconContainer: {
      boxSizing: 'border-box',
      height: '100%',
      width: sidebarConfig.iconContainerWidth,
      marginRight: -theme.spacing(2),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 0,
      flexShrink: 0,
    },
    itemIcon: {
      display: 'inline-flex',
      fontSize: theme.typography.fontSize,
      lineHeight: 0,
      '& svg': {
        width: '1.5em',
        height: '1.5em',
        fontSize: 'inherit',
        flexShrink: 0,
      },
    },
    parentLabel: {
      fontWeight: 'bold',
      whiteSpace: 'nowrap',
      lineHeight: 'auto',
      flex: '3 1 auto',
      width: '110px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    chevron: {
      display: 'flex',
      alignItems: 'center',
      marginRight: theme.spacing(1),
      flexShrink: 0,
    },
    childList: {
      width: '100%',
      '& .MuiCollapse-wrapper': {
        width: '100%',
      },
      '& .MuiCollapse-wrapperInner': {
        width: '100%',
      },
    },
    childLink: {
      display: 'block',
      height: 40,
      width: '100%',
      minWidth: 0,
      lineHeight: '40px',
      paddingLeft: sidebarConfig.iconContainerWidth,
      paddingRight: theme.spacing(2),
      boxSizing: 'border-box',
      color: theme.palette.navigation.color,
      textDecoration: 'none',
      '&:hover': {
        background:
          theme.palette.navigation.navItem?.hoverBackground ?? '#404040',
        color: theme.palette.navigation.selectedColor,
      },
    },
    childActive: {
      background: theme.palette.background.paper,
      color: theme.palette.navigation.selectedColor,
      '&:hover': {
        background: theme.palette.background.paper,
        color: theme.palette.navigation.selectedColor,
      },
    },
    childLabel: {
      display: 'inline-block',
      fontSize: theme.typography.body2.fontSize,
      fontWeight: 400,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      verticalAlign: 'middle',
    },
  }),
  { name: 'ContentExpandableSidebarGroup' },
);

export const isPathActive = (currentPath: string, targetPath: string) => {
  if (currentPath === targetPath) {
    return true;
  }

  return currentPath.startsWith(`${targetPath}/`);
};

export const isChildActive = (
  currentPath: string,
  currentSearch: string,
  child: ContentChildItem,
  allChildren: ContentChildItem[],
) => {
  const qualityPath = allChildren.find(c => c.id === 'content-quality')?.path;
  if (
    qualityPath &&
    isPathActive(currentPath, qualityPath) &&
    isContentQualitySidebarNav(currentSearch)
  ) {
    return child.id === 'content-quality';
  }

  // Git Repositories owns repository routes unless Content Quality nav is explicit.
  const prefixMatch = allChildren.find(c =>
    c.activePrefixes?.some(prefix => isPathActive(currentPath, prefix)),
  );
  if (prefixMatch) {
    return child === prefixMatch;
  }

  return isPathActive(currentPath, child.path);
};

/** Scroll expanded group so child links are visible inside the sidebar scroller. */
export function scrollExpandedSidebarGroupIntoView(
  element: HTMLElement | null,
): () => void {
  if (!element || typeof element.scrollIntoView !== 'function') {
    return () => {};
  }

  const scroll = () => {
    element.scrollIntoView({
      block: 'end',
      inline: 'nearest',
      behavior: 'smooth',
    });
  };

  const frameId = requestAnimationFrame(scroll);
  // MUI Collapse needs a beat before children affect layout height.
  const timeoutId = window.setTimeout(scroll, 350);

  return () => {
    cancelAnimationFrame(frameId);
    window.clearTimeout(timeoutId);
  };
}

export const ContentExpandableSidebarGroup = () => {
  const classes = useStyles();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const rootLink = useRouteRef(rootRouteRef);
  const location = useLocation();
  const { isOpen } = useSidebarOpenState();

  const children: ContentChildItem[] = useMemo(
    () => [
      {
        id: 'git-repositories',
        title: 'Git Repositories',
        path: `${rootLink()}/repositories/catalog`,
        activePrefixes: [`${rootLink()}/repositories`],
      },
      {
        id: 'content-quality',
        title: 'Content Quality',
        path: repositoriesQualityPath(rootLink()),
      },
    ],
    [rootLink],
  );

  const [expanded, setExpanded] = useState(() =>
    children.some(child =>
      isChildActive(location.pathname, location.search, child, children),
    ),
  );

  useEffect(() => {
    if (
      children.some(child =>
        isChildActive(location.pathname, location.search, child, children),
      )
    ) {
      setExpanded(true);
    }
  }, [location.pathname, location.search, children]);

  useEffect(
    () => () => {
      scrollCleanupRef.current?.();
    },
    [],
  );

  const scrollExpandedIntoView = useCallback(() => {
    scrollCleanupRef.current?.();
    scrollCleanupRef.current = scrollExpandedSidebarGroupIntoView(
      rootRef.current,
    );
  }, []);

  const handleToggle = useCallback(() => {
    setExpanded(prev => {
      const next = !prev;
      if (next) {
        scrollExpandedIntoView();
      }
      return next;
    });
  }, [scrollExpandedIntoView]);

  return (
    <div ref={rootRef} className={classes.root} data-testid="content-expandable-sidebar-group">
      <Button
        type="button"
        role="button"
        aria-expanded={expanded}
        aria-label="Content"
        className={clsx(
          classes.parentButton,
          isOpen ? classes.parentOpen : classes.parentClosed,
        )}
        onClick={handleToggle}
        disableRipple
      >
        <Box className={classes.iconContainer}>
          <Box component="span" className={classes.itemIcon}>
            <CodeIcon fontSize="inherit" />
          </Box>
        </Box>
        {isOpen && (
          <>
            <span className={classes.parentLabel}>Content</span>
            <Box className={classes.chevron} aria-hidden>
              {expanded ? (
                <ExpandLessIcon fontSize="small" />
              ) : (
                <ExpandMoreIcon fontSize="small" />
              )}
            </Box>
          </>
        )}
      </Button>
      {isOpen && (
        <Collapse in={expanded} className={classes.childList}>
          {children.map(child => {
            const isActive = isChildActive(
              location.pathname,
              location.search,
              child,
              children,
            );

            const linkTarget =
              child.id === 'content-quality'
                ? contentQualitySidebarPath(rootLink())
                : child.path;

            return (
              <Link
                key={child.id}
                to={linkTarget}
                underline="none"
                className={clsx(
                  classes.childLink,
                  isActive && classes.childActive,
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={classes.childLabel}>{child.title}</span>
              </Link>
            );
          })}
        </Collapse>
      )}
    </div>
  );
};
