import type { ReactNode, CSSProperties } from 'react';
import { useTheme } from '@material-ui/core/styles';

/**
 * Derives CSS custom properties from the active MUI v4 theme.
 *
 * All values come from `theme.palette.*` — so they automatically reflect
 * whichever Backstage theme the user has selected (light, dark, high-contrast).
 *
 * Exported as a standalone hook so host components can also read the vars
 * without needing to render a `<ContributionWrapper>`.
 *
 * ## Available CSS custom properties
 *
 * | Property | Maps to |
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
 */
export function usePortalCssTokens(): CSSProperties {
  const { palette } = useTheme();
  return {
    '--portal-color-primary': palette.primary.main,
    '--portal-color-primary-light': palette.primary.light,
    '--portal-color-primary-dark': palette.primary.dark,
    '--portal-color-error': palette.error.main,
    '--portal-color-warning': palette.warning.main,
    '--portal-color-success': palette.success.main,
    '--portal-color-text-primary': palette.text.primary,
    '--portal-color-text-secondary': palette.text.secondary,
    '--portal-color-background': palette.background.default,
    '--portal-color-surface': palette.background.paper,
  } as CSSProperties;
}

/**
 * Wraps a contributed component with theme-derived CSS custom properties.
 *
 * The wrapper is `display: contents` — it does not generate a layout box and
 * does not affect flex/grid containers. CSS custom properties cascade through
 * `display: contents` elements, so all descendant nodes can reference the
 * vars without extra DOM depth.
 *
 * Use this around any contributed component tree so that plugin authors can
 * write theme-adaptive styles without importing MUI or Backstage theme APIs:
 *
 * ```tsx
 * // In a contributed tab component:
 * <div style={{ color: 'var(--portal-color-primary)' }}>
 *   <span style={{ color: 'var(--portal-color-text-secondary)' }}>...</span>
 * </div>
 * ```
 *
 * See `usePortalCssTokens` for the full list of available variables.
 */
export const ContributionWrapper = ({ children }: { children: ReactNode }) => {
  const cssTokens = usePortalCssTokens();
  return <div style={{ display: 'contents', ...cssTokens }}>{children}</div>;
};
