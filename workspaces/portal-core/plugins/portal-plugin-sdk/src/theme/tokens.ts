/**
 * Static design token constants for `@ansible/portal-plugin-sdk`.
 *
 * These are **static defaults** and do NOT adapt to the active Backstage theme.
 * Use them for fixed sizing values (spacing, border radii) where dynamic theme
 * adaptation is not needed.
 *
 * ---
 *
 * ## Theme-adaptive CSS custom properties
 *
 * `ExtensionRenderer` (in `@ansible/portal-extension-host`) injects the
 * following CSS custom properties on a `display: contents` wrapper around
 * every contributed component. They are derived from `useTheme()` at render
 * time and automatically reflect the active Backstage theme (light, dark,
 * high-contrast).
 *
 * Use these in contributed component styles instead of hardcoded colours or
 * MUI theme imports:
 *
 * ```tsx
 * // In any contributed tab or card component:
 * <div style={{ color: 'var(--portal-color-primary)' }}>
 *   <span style={{ color: 'var(--portal-color-text-secondary)' }}>…</span>
 * </div>
 * ```
 *
 * | CSS custom property | MUI theme source |
 * |---|---|
 * | `--portal-color-primary` | `palette.primary.main` |
 * | `--portal-color-primary-light` | `palette.primary.light` |
 * | `--portal-color-primary-dark` | `palette.primary.dark` |
 * | `--portal-color-error` | `palette.error.main` |
 * | `--portal-color-warning` | `palette.warning.main` |
 * | `--portal-color-success` | `palette.success.main` |
 * | `--portal-color-text-primary` | `palette.text.primary` |
 * | `--portal-color-text-secondary` | `palette.text.secondary` |
 * | `--portal-color-background` | `palette.background.default` |
 * | `--portal-color-surface` | `palette.background.paper` |
 *
 * These vars are also available outside `ExtensionRenderer` via the
 * `usePortalCssTokens()` hook exported from `@ansible/portal-extension-host`.
 */
export const rhaapTokens = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: 8,
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSizeBody: '0.875rem',
    fontSizeHeading: '1.25rem',
  },
  colors: {
    primary: '#1976d2',
    error: '#d32f2f',
    warning: '#f57c00',
    success: '#388e3c',
  },
} as const;

export type RhaapTokens = typeof rhaapTokens;
