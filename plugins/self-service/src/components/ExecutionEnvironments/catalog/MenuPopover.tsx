import { MenuItem, Popover, Typography, ListItemIcon } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import CancelIcon from '@material-ui/icons/Cancel';
import BugReportIcon from '@material-ui/icons/BugReport';
import FileCopyIcon from '@material-ui/icons/FileCopy';

const useStyles = makeStyles(theme => ({
  menuPaper: {
    width: 300,
    borderRadius: 12,
    boxShadow: '0px 8px 20px rgba(0,0,0,0.1)',
    padding: '4px 0',
  },
  menuItem: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    padding: theme.spacing(1.5, 2.2),
  },
}));

interface MenuPopoverProps {
  anchorEl: null | HTMLElement;
  onClose: () => void;
  onMenuClick: (id: string) => void;
}

export const MenuPopover: React.FC<MenuPopoverProps> = ({
  anchorEl,
  onClose,
  onMenuClick,
}) => {
  const classes = useStyles();

  const menuItems = [
    {
      title: 'Unregister entity',
      id: '1',
      icon: <CancelIcon fontSize="small" />,
    },
    {
      title: 'Inspect entity',
      id: '2',
      icon: <BugReportIcon fontSize="small" />,
    },
    {
      title: 'Copy entity URL',
      id: '3',
      icon: <FileCopyIcon fontSize="small" />,
    },
  ];

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      classes={{ paper: classes.menuPaper }}
    >
      {menuItems.map(item => (
        <MenuItem
          onClick={() => {
            onMenuClick(item.id);
          }}
          key={item.id}
          className={classes.menuItem}
        >
          <Typography style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListItemIcon style={{ minWidth: 42 }}>{item.icon}</ListItemIcon>
            {item.title}
          </Typography>
        </MenuItem>
      ))}
    </Popover>
  );
};
