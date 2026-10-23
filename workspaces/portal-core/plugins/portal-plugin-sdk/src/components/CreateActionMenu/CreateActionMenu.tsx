import { useEffect, useId, useState } from 'react';
import { IconButton, Menu, MenuItem } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { useNavigate } from 'react-router-dom';
import type { ResolvedAppHeaderAction } from '@ansible/portal-extension-api/alpha';

/** One eligible destination is direct; multiple destinations use a host-owned menu. */
export function CreateActionMenu({
  actions,
  className,
}: Readonly<{
  actions: readonly ResolvedAppHeaderAction[];
  className?: string;
}>) {
  const navigate = useNavigate();
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const multiple = actions.length > 1;
  useEffect(() => {
    if (!multiple) setAnchor(null);
  }, [multiple]);
  if (!actions.length) return null;
  return (
    <>
      <IconButton
        color="inherit"
        className={className}
        title="Create..."
        aria-label="Create..."
        aria-haspopup={multiple ? 'menu' : undefined}
        aria-controls={multiple && anchor ? menuId : undefined}
        aria-expanded={multiple ? Boolean(anchor) : undefined}
        onClick={event => {
          if (multiple) setAnchor(event.currentTarget);
          else navigate(actions[0].path);
        }}
      >
        <AddIcon />
      </IconButton>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={multiple && Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        {actions.map(action => (
          <MenuItem
            key={action.id}
            onClick={() => {
              setAnchor(null);
              navigate(action.path);
            }}
          >
            {action.title}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
