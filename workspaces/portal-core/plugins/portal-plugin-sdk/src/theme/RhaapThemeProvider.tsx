import type { ReactNode } from 'react';
import { ThemeProvider } from '@material-ui/core/styles';
import { useTheme } from '@material-ui/core/styles';
import type { BackstageTheme } from '@backstage/theme';

interface RhaapThemeProviderProps {
  children: ReactNode;
}

/**
 * Wraps contributed components in an explicit MUI v4 `ThemeProvider` seeded
 * from the active Backstage theme. This creates a clean theme boundary for
 * contributed component trees and ensures theme context is guaranteed even
 * when `ExtensionRenderer` is mounted outside the normal Backstage theme tree.
 *
 * MUI v5 support will be added here when the upstream Backstage MUI v5
 * migration completes — a v5 `ThemeProvider` will be added alongside this one.
 */
export const RhaapThemeProvider = ({ children }: RhaapThemeProviderProps) => {
  const theme = useTheme<BackstageTheme>();
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};
