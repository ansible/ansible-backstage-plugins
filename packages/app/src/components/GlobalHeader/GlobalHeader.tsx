import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  InputBase,
  Box,
  Menu,
  MenuItem,
} from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import AddIcon from '@material-ui/icons/Add';
import AccountCircle from '@material-ui/icons/AccountCircle';
import { makeStyles, alpha } from '@material-ui/core/styles';
import { Link, useNavigate } from 'react-router-dom';
import {
  useApi,
  identityApiRef,
  errorApiRef,
} from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from '@ansible/plugin-backstage-self-service';
import { useState } from 'react';

const useStyles = makeStyles(theme => ({
  appBar: {
    zIndex: theme.zIndex.drawer + 1,
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.grey[900]
        : theme.palette.primary.main,
    color:
      theme.palette.type === 'dark'
        ? theme.palette.common.white
        : theme.palette.primary.contrastText,
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  toolbar: {
    minHeight: 64,
  },
  title: {
    flexGrow: 0,
    marginRight: theme.spacing(2),
    color: 'inherit',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'none',
    },
  },
  search: {
    position: 'relative',
    borderRadius: theme.shape.borderRadius,
    backgroundColor:
      theme.palette.type === 'dark'
        ? alpha(theme.palette.common.white, 0.1)
        : alpha(theme.palette.common.white, 0.15),
    '&:hover': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? alpha(theme.palette.common.white, 0.15)
          : alpha(theme.palette.common.white, 0.25),
    },
    marginLeft: 0,
    width: '100%',
    [theme.breakpoints.up('sm')]: {
      marginLeft: theme.spacing(1),
      width: 'auto',
    },
  },
  searchIcon: {
    padding: theme.spacing(0, 2),
    height: '100%',
    position: 'absolute',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRoot: {
    color: 'inherit',
  },
  inputInput: {
    padding: theme.spacing(1, 1, 1, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4)}px)`,
    transition: theme.transitions.create('width'),
    width: '100%',
    color: 'inherit',
    [theme.breakpoints.up('sm')]: {
      width: '20ch',
      '&:focus': {
        width: '30ch',
      },
    },
  },
  spacer: {
    flexGrow: 1,
  },
  iconButton: {
    marginLeft: theme.spacing(1),
    color: 'inherit',
    '&:hover': {
      backgroundColor: alpha(theme.palette.common.white, 0.1),
    },
  },
  menu: {
    '& .MuiPaper-root': {
      backgroundColor: theme.palette.background.paper, // Use theme background
      color: theme.palette.text.primary, // Use theme text
      border: `1px solid ${theme.palette.divider}`, // Use theme divider
    },
  },
  menuItem: {
    color: theme.palette.text.primary, // Use theme text
    '&:hover': {
      backgroundColor: theme.palette.action.hover, // Use theme hover
    },
  },
}));

export const GlobalHeader = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const identityApi = useApi(identityApiRef);
  const errorApi = useApi(errorApiRef);
  const rhAapAuthApi = useApi(rhAapAuthApiRef);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchValue, setSearchValue] = useState('');

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleMenuClose();

    try {
      // Revoke AAP OAuth token via backend /api/auth/rhaap/logout
      await rhAapAuthApi.signOut();
    } catch {
      // Ignore if not logged into AAP
    }

    // Sign out from primary identity provider (e.g. GitHub / Gitlab)
    identityApi.signOut().catch(error => errorApi.post(error));
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchValue.trim()) {
      navigate(`/search?query=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  const handleCreateClick = () => {
    navigate('/self-service/catalog');
  };

  return (
    <AppBar position="sticky" className={classes.appBar}>
      <Toolbar className={classes.toolbar}>
        <Typography variant="h6" className={classes.title}>
          <Link to="/" className={classes.title}>
            Ansible RHDH
          </Link>
        </Typography>

        <Box
          component="form"
          onSubmit={handleSearchSubmit}
          className={classes.search}
        >
          <div className={classes.searchIcon}>
            <SearchIcon />
          </div>
          <InputBase
            placeholder="Search..."
            classes={{
              root: classes.inputRoot,
              input: classes.inputInput,
            }}
            inputProps={{ 'aria-label': 'search' }}
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
          />
        </Box>

        <div className={classes.spacer} />

        <IconButton
          className={classes.iconButton}
          onClick={handleCreateClick}
          title="Create..."
        >
          <AddIcon />
        </IconButton>

        <IconButton
          edge="end"
          onClick={handleProfileMenuOpen}
          className={classes.iconButton}
        >
          <AccountCircle />
        </IconButton>

        <Menu
          anchorEl={anchorEl}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          keepMounted
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          className={classes.menu}
        >
          <MenuItem
            component={Link}
            to="/settings"
            onClick={handleMenuClose}
            className={classes.menuItem}
          >
            Settings
          </MenuItem>
          <MenuItem onClick={handleLogout} className={classes.menuItem}>
            Logout
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};
