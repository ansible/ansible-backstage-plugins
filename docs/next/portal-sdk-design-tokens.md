---
render_macros: false
---

# Portal SDK — Design Token Reference

> Write theme-adaptive styles without importing MUI or Backstage APIs.

## Overview

The Portal injects CSS custom properties (design tokens) onto a `display: contents` wrapper around every contributed component. These tokens reflect the active Backstage theme — they update automatically when the user switches between light, dark, and high-contrast themes.

Plugin authors should use these tokens for all colour values instead of hardcoding hex values or importing MUI's `useTheme()`.

## How tokens are injected

When the host renders a contributed tab or card, it wraps the component in a `ContributionWrapper`:

```tsx
// Simplified from portal-extension-host/src/ExtensionRenderer.tsx
<ContributionWrapper>
  <ErrorBoundary>
    <YourContributedComponent />
  </ErrorBoundary>
</ContributionWrapper>
```

`ContributionWrapper` renders a `div` with `display: contents` and sets all 10 CSS custom properties from `useTheme().palette`. Because `display: contents` generates no layout box, the wrapper is invisible to flex and grid containers — it does not affect your component's layout.

## Theme-adaptive tokens

These 10 tokens are available in every contributed component:

| CSS custom property             | MUI source                   | Description                        |
| ------------------------------- | ---------------------------- | ---------------------------------- |
| `--portal-color-primary`        | `palette.primary.main`       | Brand primary (Red Hat red)        |
| `--portal-color-primary-light`  | `palette.primary.light`      | Lightened primary for hover states |
| `--portal-color-primary-dark`   | `palette.primary.dark`       | Darkened primary for active states |
| `--portal-color-error`          | `palette.error.main`         | Error red                          |
| `--portal-color-warning`        | `palette.warning.main`       | Warning amber                      |
| `--portal-color-success`        | `palette.success.main`       | Success green                      |
| `--portal-color-text-primary`   | `palette.text.primary`       | Primary text — high contrast       |
| `--portal-color-text-secondary` | `palette.text.secondary`     | Secondary text — muted             |
| `--portal-color-background`     | `palette.background.default` | Page background                    |
| `--portal-color-surface`        | `palette.background.paper`   | Card / surface background          |

## Using tokens in components

```tsx
// No MUI import needed:
export function TrustSignalsCard() {
  return (
    <div
      style={{
        backgroundColor: 'var(--portal-color-surface)',
        border: '1px solid var(--portal-color-primary)',
        borderRadius: '4px',
        padding: '16px',
      }}
    >
      <h3 style={{ color: 'var(--portal-color-primary)', margin: 0 }}>
        Trust Score
      </h3>
      <p style={{ color: 'var(--portal-color-text-secondary)' }}>
        Supply chain verification status
      </p>
      <span style={{ color: 'var(--portal-color-success)' }}>✓ Verified</span>
    </div>
  );
}
```

## Using tokens in CSS-in-JS

If your plugin uses `makeStyles` (MUI v4), you can still reference the custom properties:

```ts
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles({
  card: {
    backgroundColor: 'var(--portal-color-surface)',
    borderLeft: '4px solid var(--portal-color-primary)',
  },
  title: {
    color: 'var(--portal-color-text-primary)',
  },
  subtitle: {
    color: 'var(--portal-color-text-secondary)',
    fontSize: '0.875rem',
  },
});
```

## Reading tokens programmatically

If you need the current token values in JavaScript (e.g. for a canvas or chart library), use `usePortalCssTokens` from `@ansible/portal-extension-host`:

```tsx
import { usePortalCssTokens } from '@ansible/portal-extension-host';

function MyChartComponent() {
  const tokens = usePortalCssTokens();
  // tokens['--portal-color-primary'] → '#ee0000' (example)

  return (
    <canvas
      ref={canvasRef}
      style={tokens} // spread onto any element to inherit tokens
    />
  );
}
```

> **Note:** `usePortalCssTokens` requires `@material-ui/core` as a dependency. It is available from `portal-extension-host`, which is a host package. Plugin authors who need the values in JavaScript should add `@ansible/portal-extension-host` as a dependency or use `getComputedStyle(element).getPropertyValue('--portal-color-primary')` on a rendered DOM node.

## Theme light / dark comparison

| Token                           | Light theme (example) | Dark theme (example)     |
| ------------------------------- | --------------------- | ------------------------ |
| `--portal-color-primary`        | `#ee0000`             | `#ff4d4d`                |
| `--portal-color-background`     | `#ffffff`             | `#1b1b1b`                |
| `--portal-color-surface`        | `#f5f5f5`             | `#2c2c2c`                |
| `--portal-color-text-primary`   | `rgba(0,0,0,0.87)`    | `rgba(255,255,255,0.87)` |
| `--portal-color-text-secondary` | `rgba(0,0,0,0.54)`    | `rgba(255,255,255,0.60)` |

Exact values depend on the Backstage theme configured in the host. The tokens always reflect the active theme — you do not need to implement your own dark mode toggle.

## Static tokens

For fixed sizing values (spacing, border radii) that do not need to adapt to the theme, `@ansible/portal-plugin-sdk` exports static constants:

```ts
import { PORTAL_TOKENS } from '@ansible/portal-plugin-sdk';

// Use in inline styles or makeStyles:
padding: PORTAL_TOKENS.spacing.card; // '12px'
padding: PORTAL_TOKENS.spacing.page; // '24px'
borderRadius: PORTAL_TOKENS.borderRadius.card; // '4px'
```

These are compile-time constants, not CSS custom properties, and do not change at runtime.

## Anti-patterns to avoid

❌ **Don't hardcode colours:**

```tsx
// Wrong — breaks dark mode
<div style={{ color: '#333333' }}>
```

❌ **Don't import MUI useTheme in contributed components:**

```tsx
// Wrong — creates a MUI singleton dependency in the plugin bundle
import { useTheme } from '@material-ui/core/styles';
const { palette } = useTheme();
```

❌ **Don't use Backstage's `UnifiedThemeProvider` or `createUnifiedTheme` in plugins:**
Backstage's unified theme is configured by the host app. Plugins should consume the host's theme via tokens, not re-configure it.

✅ **Do use CSS custom properties:**

```tsx
// Correct — theme-adaptive, no import needed
<div style={{ color: 'var(--portal-color-text-primary)' }}>
```

✅ **Do use static tokens for sizing:**

```tsx
import { PORTAL_TOKENS } from '@ansible/portal-plugin-sdk';
<div style={{ padding: PORTAL_TOKENS.spacing.card }}>
```

## Adding new tokens

If you need a colour that is not covered by the current 10 tokens, open a proposal in `docs/next/` rather than hardcoding values. Token additions are non-breaking (existing consumers are unaffected) and are reviewed for naming consistency before being added to `ContributionWrapper` and this reference.
