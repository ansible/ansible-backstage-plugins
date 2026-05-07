/**
 * Renders MUI CssBaseline to apply the active RHDH theme's global styles:
 * Red Hat fonts (@font-face declarations) and dark-mode body color/background.
 *
 * Required because @backstage/theme >=0.7.2 removed automatic CssBaseline
 * rendering from UnifiedThemeProvider. Mounted via the application/listener
 * mount point so it is always active regardless of the current route.
 */
export { default as AppThemeFixer } from '@material-ui/core/CssBaseline';
