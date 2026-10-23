import { Component, type PropsWithChildren, type ReactNode } from 'react';
import {
  identityApiRef,
  configApiRef,
  errorApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from '../../api';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LogoutIcon from '@mui/icons-material/Logout';
import { performAapLogout } from '../../logout';

class SafeBoundary extends Component<
  PropsWithChildren<{}>,
  { hasError: boolean }
> {
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  constructor(props: PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  render(): ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const AAPLogoutButtonInner = () => {
  const identityApi = useApi(identityApiRef);
  const errorApi = useApi(errorApiRef);
  const rhAapAuthApi = useApi(rhAapAuthApiRef);
  const config = useApi(configApiRef);

  const handleLogout = () =>
    performAapLogout({
      auth: rhAapAuthApi,
      identity: identityApi,
      config,
      errors: errorApi,
    });

  return (
    <>
      <Divider />
      <MenuItem
        onClick={handleLogout}
        sx={{
          cursor: 'pointer',
          width: '100%',
          color: 'inherit',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            margin: '8px 0',
            color: 'inherit',
            width: '100%',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                marginRight: '0.5rem',
                flexShrink: 0,
                color: 'inherit',
              }}
            >
              <LogoutIcon fontSize="small" />
            </Box>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <Typography variant="body2" sx={{ color: 'inherit' }}>
                Sign out
              </Typography>
            </Box>
          </Box>
        </Box>
      </MenuItem>
    </>
  );
};

/**
 * Logout button for the RHDH global-header profile dropdown.
 *
 * Wrapped in an error boundary so a missing API (e.g. rhAapAuthApiRef
 * not yet registered in a dynamic-plugin context) cannot crash the
 * host ProfileDropdown / global header.
 */
export const AAPLogoutButton = () => (
  <SafeBoundary>
    <AAPLogoutButtonInner />
  </SafeBoundary>
);
