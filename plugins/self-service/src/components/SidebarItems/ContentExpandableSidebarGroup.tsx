import { useCallback, useMemo, useState } from 'react';
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
import Typography from '@material-ui/core/Typography';
import CodeIcon from '@material-ui/icons/Code';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import clsx from 'clsx';
import { useLocation } from 'react-router-dom';

import { rootRouteRef } from '../../routes';

type ContentChildItem = {
  title: string;
  path: string;
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
      flex: '1 1 auto',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      textAlign: 'left',
    },
    chevron: {
      display: 'flex',
      alignItems: 'center',
      marginRight: theme.spacing(1),
      flexShrink: 0,
    },
    childList: {
      width: '100%',
    },
    childLink: {
      display: 'flex',
      alignItems: 'center',
      height: 40,
      width: '100%',
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
      background:
        theme.palette.navigation.navItem?.selectedBackground ??
        theme.palette.background.paper,
      color: theme.palette.text.primary,
      '&:hover': {
        background:
          theme.palette.navigation.navItem?.selectedBackground ??
          theme.palette.background.paper,
        color: theme.palette.text.primary,
      },
    },
    childLabel: {
      fontSize: theme.typography.body1.fontSize,
      fontWeight: theme.typography.fontWeightRegular,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
  }),
  { name: 'ContentExpandableSidebarGroup' },
);

const isPathActive = (currentPath: string, targetPath: string) => {
  if (currentPath === targetPath) {
    return true;
  }

  return currentPath.startsWith(`${targetPath}/`);
};

export const ContentExpandableSidebarGroup = () => {
  const classes = useStyles();
  const rootLink = useRouteRef(rootRouteRef);
  const location = useLocation();
  const { isOpen } = useSidebarOpenState();

  const children: ContentChildItem[] = useMemo(
    () => [
      {
        title: 'Git Repositories',
        path: `${rootLink()}/repositories/catalog`,
      },
      {
        title: 'Content quality',
        path: `${rootLink()}/repositories/quality`,
      },
    ],
    [rootLink],
  );

  const isChildRouteActive = children.some(child =>
    isPathActive(location.pathname, child.path),
  );

  const [expanded, setExpanded] = useState(true);

  const isExpanded = expanded || isChildRouteActive;

  const handleToggle = useCallback(() => {
    setExpanded(current => !current);
  }, []);

  return (
    <Box className={classes.root} data-testid="content-expandable-sidebar-group">
      <Button
        type="button"
        role="button"
        aria-expanded={isExpanded}
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
            <Typography
              variant="subtitle2"
              component="span"
              className={classes.parentLabel}
            >
              Content
            </Typography>
            <Box className={classes.chevron} aria-hidden>
              {isExpanded ? (
                <ExpandLessIcon fontSize="small" />
              ) : (
                <ExpandMoreIcon fontSize="small" />
              )}
            </Box>
          </>
        )}
      </Button>
      {isOpen && (
        <Collapse in={isExpanded} className={classes.childList}>
          {children.map(child => {
            const isActive = isPathActive(location.pathname, child.path);

            return (
              <Link
                key={child.path}
                to={child.path}
                underline="none"
                className={clsx(
                  classes.childLink,
                  isActive && classes.childActive,
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Typography
                  variant="body1"
                  component="span"
                  className={classes.childLabel}
                >
                  {child.title}
                </Typography>
              </Link>
            );
          })}
        </Collapse>
      )}
    </Box>
  );
};
