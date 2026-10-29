# Self-Service Extension SDK — Architecture & Implementation Plan

> **Historical planning reference:** The registry, Scalprum wiring and package
> proposals below preserve an earlier design; they are not native integration
> instructions. Use [SDK architecture](../next/portal-sdk-architecture.md) and the
> [plugin author guide](../next/portal-sdk-plugin-author-guide.md) for the current implementation.

> **Status:** Draft
> **Author:** AI-assisted design session
> **Scope:** Extract reusable components and create an extension SDK for the self-service plugin
> **Program:** Portal Plugin Factory — Plugin Development Guide and SDK

> **Positioning:** This document proposes an initial extension layer for the broader Automation Portal Plugin Factory
> SDK. It delivers the self-service plugin's extension surface:
> the `backstage-rhaap-react` component library and `backstage-rhaap-extension-api` contracts
> package. The full factory scope (portal-wide RBAC delegation, settings
> registration, capability metadata, scaffold CLI, contributor kit) is beyond this document's
> implementation boundary. The packages produced here establish the package naming, versioning,
> and contract patterns that the broader factory SDK will extend.

> **Canonical references for the broader architecture:**
>
> - [Ganesh's Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) — target state, workspace structure, plugin manifest model
> - [Brad's migration plan (PR #712)](https://github.com/ansible/ansible-backstage-plugins/pull/712) — 45 work packages under `docs/next/`
>
> **Alignment review:** Brad Thornton reviewed this plan against the full architecture and identified six conflicts. Each is documented in §12 with an agreed resolution. The implementation plan below remains valid — §12 records which specific design decisions need updating as the design moves toward a supported implementation.

---

## 1. Problem Statement

The self-service plugin (`@ansible/plugin-backstage-self-service`) is a monolithic frontend plugin that tightly couples:

- **Shared UI components** (PageHeaderSection, SyncDialog, EmptyState, notification system, cache utilities) that could be reused by other plugins
- **Hardcoded page compositions** (RepositoryDetailsPage, EEDetailsPage, CollectionDetailsPage) with static tab lists that external plugins cannot extend
- **API clients and types** (AnsibleApiClient, EEBuildApiClient, ApiRefs) that are only accessible by depending on the entire self-service plugin

Community developers and Red Hat internal teams (e.g., content discovery, APME) cannot:

1. Reuse shared components without depending on the full self-service plugin
2. Add tabs, cards, or actions to existing detail pages
3. Register new sections in the self-service navigation
4. Build visually consistent plugins using our design tokens

**Permissions context:** The self-service plugin's pages are gated by permissions defined in `backstage-rhaap-common/src/permissions.ts`:

- `ansible.execution-environments.view`
- `ansible.git-repositories.view`
- `ansible.collections.view`
- `ansible.templates.view`
- `ansible.history.view`

Extension contributors targeting pages behind these gates (e.g., `TEMPLATE_DETAIL_CARDS`) should be aware that the host page itself may be hidden from users lacking the corresponding permission. The SDK does not re-check permissions per contribution — that is the host page's responsibility.

---

## 2. Goals

1. **Exportable component library** — shared UI components available as an independent package
2. **Extension points** — well-defined slots where external plugins can contribute tabs, cards, and actions
3. **Zero-config registration for RHDH dynamic plugins** — side-effect imports auto-register contributions
4. **Declarative registration via `dynamic-plugins.yaml`** — config-driven overrides for labels, priority, enable/disable
5. **Framework-agnostic theming** — CSS custom properties dynamically derived from the active Backstage theme
6. **MUI v4 theme support** — automatic MUI v4 theme wrapping for contributed components (v5 support deferred to a future release when the upstream Backstage MUI v5 migration completes)
7. **Forward-compatible** — registry pattern can be backed by Backstage's new frontend system later

---

## 3. New Packages

### 3.1 `@ansible/backstage-rhaap-react` — UI Component Library

**Role:** `frontend-plugin-module` (no plugin ID — pure library)

Reusable, self-contained React components, hooks, and utilities extracted from the self-service plugin. No plugin coupling, no API dependencies beyond Backstage core.

**What moves here:**

| Export                                   | Source in self-service                             | Description                                      |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `PageHeaderSection`                      | `components/common/PageHeaderSection.tsx`          | Page header with sync button, tooltips, progress |
| `SyncDialog`                             | `components/common/SyncDialog.tsx`                 | Sync confirmation/progress dialog                |
| `SyncProgressPopover`                    | `components/common/SyncProgressPopover.tsx`        | Progress tooltip                                 |
| `EmptyState`                             | `components/common/EmptyState.tsx`                 | Empty state component                            |
| `EntityLinkButton`                       | `components/common/EntityLinkButton.tsx`           | Link to a catalog entity                         |
| `ScmIntegrationAuthError`                | `components/common/ScmIntegrationAuthError.tsx`    | SCM auth error display                           |
| `SkeletonLoader`                         | `components/Home/SkeletonLoader.tsx`               | Card skeleton loading state                      |
| `NotificationProvider`                   | `components/notifications/NotificationContext.tsx` | Toast notification context                       |
| `NotificationStack`                      | `components/notifications/NotificationStack.tsx`   | Notification display stack                       |
| `NotificationCard`                       | `components/notifications/NotificationCard.tsx`    | Individual notification card                     |
| `notificationStore`                      | `components/notifications/notificationStore.ts`    | Notification state store                         |
| `syncPollingService`                     | `components/notifications/syncPollingService.ts`   | Sync polling service                             |
| `PaginatedEntityCache`                   | `components/common/cache/PaginatedEntityCache.ts`  | Entity caching + pagination                      |
| `usePagination`                          | `components/common/cache/usePagination.ts`         | Pagination hook                                  |
| `useCacheSubscription`                   | `components/common/cache/useCacheSubscription.ts`  | Cache subscription hook                          |
| `useIsSuperuser`                         | `hooks/useIsSuperuser.ts`                          | Superuser check hook                             |
| `useSyncStatusPolling`                   | `hooks/useSyncStatusPolling.ts`                    | Polling hook                                     |
| `GitLabIcon`, `RedHatIcon`               | `components/common/icons.tsx`                      | Icon components                                  |
| `usePageHeaderStyles`                    | `components/common/styles.ts`                      | Page header style hook                           |
| `useSharedStyles`                        | `components/common/styles.ts`                      | Shared style hook                                |
| `useShellPageStyles`                     | `components/common/styles.ts`                      | Shell page style hook                            |
| `formatRelativeTime`                     | `utils/timeUtils.ts`                               | Relative time formatter                          |
| All types from `common/types.ts`         | `components/common/types.ts`                       | SyncStatus, SyncStatusMap, etc.                  |
| All constants from `common/constants.ts` | `components/common/constants.ts`                   | Sync category constants, intervals               |

> **Note — domain utilities stay in self-service:** > `parseMarkdownLinks` (returns JSX — requires React + MUI `Link`),
> `parseEEDefinition` (EE domain, depends on `js-yaml`),
> `fetchReadmeFromBackend`, and `fetchGitFileContentFromBackend`
> (use `fetchApiRef` / `DiscoveryApi` from `@backstage/core-plugin-api` — frontend
> data-fetching utilities, not backend code) remain in self-service. They are
> domain-specific to self-service pages and cannot move to `backstage-rhaap-common`
> (which is a backend-oriented package with no React dependency) or to this UI library
> (which should not carry domain parsers or backend fetch logic). If a second consumer
> emerges, they can be extracted to a `@ansible/backstage-rhaap-common-react` package
> following the Backstage `*-common` (isomorphic) / `*-react` (frontend) convention.

**Also includes (new):**

| Export                          | Description                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `RhaapThemeProvider`            | MUI v4 theme wrapper (reads from active Backstage theme)                                  |
| `rhaapTokens`                   | Static design token constants (spacing, typography, border-radius)                        |
| CSS custom properties injection | `--rhaap-*` tokens dynamically derived from the Backstage theme at render time (see §5.2) |

**Package structure:**

```text
plugins/backstage-rhaap-react/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── components/
│   │   ├── PageHeaderSection/
│   │   │   ├── PageHeaderSection.tsx
│   │   │   ├── PageHeaderSection.test.tsx
│   │   │   └── index.ts
│   │   ├── SyncDialog/
│   │   ├── SyncProgressPopover/
│   │   ├── EmptyState/
│   │   ├── EntityLinkButton/
│   │   ├── ScmIntegrationAuthError/
│   │   └── SkeletonLoader/
│   ├── notifications/
│   │   ├── NotificationContext.tsx
│   │   ├── NotificationStack.tsx
│   │   ├── NotificationCard.tsx
│   │   ├── notificationStore.ts
│   │   ├── syncPollingService.ts
│   │   └── index.ts
│   ├── cache/
│   │   ├── PaginatedEntityCache.ts
│   │   ├── usePagination.ts
│   │   ├── useCacheSubscription.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── hooks/
│   │   ├── useIsSuperuser.ts
│   │   ├── useSyncStatusPolling.ts
│   │   └── index.ts
│   ├── theme/
│   │   ├── RhaapThemeProvider.tsx
│   │   ├── tokens.ts
│   │   └── index.ts
│   ├── icons/
│   │   └── index.tsx
│   ├── styles/
│   │   └── index.ts
│   ├── utils/
│   │   ├── timeUtils.ts
│   │   └── index.ts
│   └── types.ts
```

**Dependencies:**

```json
{
  "peerDependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@material-ui/core": "^4.9.13",
    "@material-ui/icons": "^4.9.1",
    "@backstage/core-components": "^0.18.8",
    "@backstage/core-plugin-api": "^1.12.4",
    "@backstage/catalog-model": "^1.7.7",
    "@backstage/theme": "^0.7.2"
  }
}
```

### 3.2 `@ansible/backstage-rhaap-extension-api` — Extension Contracts (SDK)

**Role:** `frontend-plugin-module` (no plugin ID — pure contracts)

Defines extension points, the contribution registry, React hooks, and convenience helpers. This is what community developers depend on to extend the self-service pages.

**Core concepts:**

#### Contribution types

```typescript
// Types for what can be contributed
interface TabContribution {
  id: string;
  label: string;
  icon?: React.ComponentType<{ fontSize?: 'small' | 'default' | 'large' }>;
  /** Accepts lazy-loaded or synchronous components. The renderer wraps
   *  non-lazy components in Suspense only when needed. */
  component:
    | React.LazyExoticComponent<React.ComponentType<any>>
    | React.ComponentType<any>;
  filter?: (entity: Entity) => boolean;
  /** If set, the tab is hidden from users who lack this permission.
   *  Evaluated by ExtensionRenderer using @backstage/plugin-permission-react.
   *  Only Backstage BasicPermission is supported (no ResourcePermission). */
  permission?: BasicPermission;
  /** Lower value = further left. Built-in tabs use 0–20.
   *  Community tabs should use 21+ to appear after built-ins.
   *  Negative priorities are allowed but will render before built-in tabs.
   *  Equal priorities are ordered by insertion order (stable sort). */
  priority?: number;
}

interface CardContribution {
  id: string;
  slot: 'overview-left' | 'overview-right' | 'sidebar' | string;
  component:
    | React.LazyExoticComponent<React.ComponentType<any>>
    | React.ComponentType<any>;
  filter?: (entity: Entity) => boolean;
  /** If set, the card slot is hidden from users who lack this permission. */
  permission?: BasicPermission;
  priority?: number;
}

interface ActionContribution {
  id: string;
  label: string;
  icon?: React.ComponentType;
  /** Action handler receives the entity and a getApi() helper for accessing any
   *  Backstage API ref. Contributors import the API refs they need from their own
   *  dependencies (e.g., catalogApiRef from @backstage/plugin-catalog-react). */
  handler: (context: {
    entity: Entity;
    /** Resolves a Backstage API by ref. Equivalent to useApi() but callable
     *  outside a React component. Resolved at render time by ExtensionRenderer. */
    getApi: <T>(apiRef: ApiRef<T>) => T;
  }) => void | Promise<void>;
  filter?: (entity: Entity) => boolean;
  /** If set, the action button/menu item is hidden from users who lack this permission. */
  permission?: BasicPermission;
  variant?: 'button' | 'menu-item';
  priority?: number;
}
```

#### Extension point IDs

```typescript
const EXTENSION_POINTS = {
  // Git Repository detail page
  GIT_REPO_DETAIL_TABS: 'rhaap.git-repository.detail.tabs',
  GIT_REPO_DETAIL_CARDS: 'rhaap.git-repository.detail.cards',
  GIT_REPO_DETAIL_ACTIONS: 'rhaap.git-repository.detail.actions',
  GIT_REPO_LIST_TABS: 'rhaap.git-repository.list.tabs',

  // Execution Environments detail page
  EE_DETAIL_TABS: 'rhaap.execution-environment.detail.tabs',
  EE_DETAIL_CARDS: 'rhaap.execution-environment.detail.cards',
  EE_DETAIL_ACTIONS: 'rhaap.execution-environment.detail.actions',
  EE_LIST_TABS: 'rhaap.execution-environment.list.tabs',

  // Collections detail page
  COLLECTION_DETAIL_TABS: 'rhaap.collection.detail.tabs',
  COLLECTION_DETAIL_CARDS: 'rhaap.collection.detail.cards',
  COLLECTION_DETAIL_ACTIONS: 'rhaap.collection.detail.actions',

  // Templates
  TEMPLATE_DETAIL_CARDS: 'rhaap.template.detail.cards',
} as const;
```

> **Note:** `SELF_SERVICE_SECTIONS` (top-level navigation contributions) is deferred to
> navigation contributions. A navigation section has a fundamentally different shape (route, icon, label,
> permission check) than tabs/cards/actions and needs a dedicated
> `SectionContribution` type. See §8 navigation contributions for a design sketch and open questions.

#### Contribution registry

Module-level singleton that collects registrations. Supports:

- `registerTab(extensionPoint, contribution)` → returns unregister function
- `registerCard(extensionPoint, contribution)` → returns unregister function
- `registerAction(extensionPoint, contribution)` → returns unregister function
- `getTabs(extensionPoint, entity?)` → sorted, filtered contributions
- `getCards(extensionPoint, entity?)` → sorted, filtered contributions
- `getActions(extensionPoint, entity?)` → sorted, filtered contributions

**Filter safety:** `getTabs()`, `getCards()`, and `getActions()` wrap each contribution's `filter()` call in a `try/catch`. A filter that throws is treated as "don't show this contribution" and a `console.warn` is emitted with the contribution ID and error. This prevents a community plugin's buggy filter from crashing the host page inside `useMemo` (which would bypass the per-slot `ErrorBoundary`).

**Handler safety:** `ExtensionRenderer` wraps every `ActionContribution.handler()` invocation in a `try/catch` (including `await` for async handlers that return a rejected promise). On failure, the error is surfaced via `alertApi.post({ message: '...', severity: 'error' })` and logged with the contribution ID + error. The host page is unaffected. This completes the error-handling trifecta for all community-code execution paths:

| Path           | Mechanism                             | Location                              |
| -------------- | ------------------------------------- | ------------------------------------- |
| Render errors  | `ErrorBoundary` per slot              | `ExtensionRenderer` (§5.1)            |
| Filter errors  | `try/catch` in registry getters       | `ContributionRegistry` (§3.2)         |
| Handler errors | `try/catch` + `alertApi` notification | `ExtensionRenderer` action invocation |

- `subscribe(listener)` → returns unsubscribe function (for React re-renders)
- `disable(contributionId)` / `enable(contributionId)` → runtime enable/disable
- `reset()` → clears all registrations (for test isolation; see §10)

**Duplicate registration:** If `registerTab` (or `registerCard`, `registerAction`) is called with an `id` that is already registered at the same extension point, the new registration **replaces** the previous one and a console warning is emitted. This matches React Fast Refresh / HMR behavior where module scope re-executes on edit.

**Priority tiebreaker:** Contributions at the same `priority` value are ordered by insertion order (stable sort). This is deterministic because `Array.prototype.sort` is stable in all modern JS engines.

#### React hooks

- `useExtensionTabs(extensionPoint, entity?)` — returns sorted tabs, re-renders on registry changes
- `useExtensionCards(extensionPoint, entity?)` — returns sorted cards
- `useExtensionActions(extensionPoint, entity?)` — returns sorted actions

#### Convenience registration helpers

```typescript
registerGitRepoDetailTab(tab);
registerGitRepoDetailCard(card);
registerGitRepoDetailAction(action);
registerEEDetailTab(tab);
registerCollectionDetailTab(tab);
// ... one per extension point
```

**Package structure:**

```text
plugins/backstage-rhaap-extension-api/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types.ts                # TabContribution, CardContribution, etc.
│   ├── extensionPoints.ts      # EXTENSION_POINTS constants
│   ├── registry.ts             # ContributionRegistry class
│   ├── hooks/
│   │   ├── useExtensionTabs.ts
│   │   ├── useExtensionCards.ts
│   │   ├── useExtensionActions.ts
│   │   └── index.ts
│   └── helpers/
│       ├── git-repository.ts   # registerGitRepoDetailTab, etc.
│       ├── execution-environment.ts
│       ├── collection.ts
│       ├── template.ts         # registerTemplateDetailCard
│       └── index.ts
```

> **Note:** `ExtensionRenderer` and `DynamicExtensionDiscovery` are **not** in this
> package. They are host-side implementation concerns that depend on
> `@ansible/backstage-rhaap-react` (for `RhaapThemeProvider`, `SkeletonLoader`),
> `@backstage/theme`, and `@material-ui/core` — none of which are deps of this
> contracts package. They live in self-service (see §6.3).

**Dependencies:**

```json
{
  "peerDependencies": {
    "react": "^18.3.1",
    "@backstage/catalog-model": "^1.7.7",
    "@backstage/core-plugin-api": "^1.12.4",
    "@backstage/plugin-permission-common": "^0.8.4"
  }
}
```

> **Why these peers are needed:**
>
> - `@backstage/core-plugin-api` — `ApiRef<T>` type for the `getApi()` helper
> - `@backstage/plugin-permission-common` — `BasicPermission` type for the `permission` field on contribution types
>
> Permission _evaluation_ (`usePermission()`) happens in `ExtensionRenderer` inside
> self-service, which depends on `@backstage/plugin-permission-react`. The contracts
> package only needs the type (`BasicPermission`), not the evaluation hook.

---

## 4. Registration Mechanisms

### 4.1 Auto-registration (primary — works for all deployments)

Community plugins call registration functions from their package entry point. The call runs at module load time — before React renders.

> **Entry point note:** In this repo, only backend modules have `src/dynamic/index.ts` files.
> Frontend plugins use the standard `src/index.ts` entry. RHDH loads frontend dynamic
> plugin bundles via module federation from the package's main entry point, not a `/dynamic`
> sub-path. Community frontend plugins should register contributions from `src/index.ts`
> (or any module imported by it). The example below shows a side-effect registration
> that runs when the module loads.

```typescript
// @acme/plugin-security-scan/src/index.ts (or any file imported at load time)
import { lazy } from 'react';
import { registerGitRepoDetailTab } from '@ansible/backstage-rhaap-extension-api';

registerGitRepoDetailTab({
  id: 'acme.security-scan',
  label: 'Security Scan',
  component: lazy(() => import('../SecurityScanTab')),
  priority: 30,
});
```

RHDH loads the dynamic plugin's bundle → module executes → registration completes.

No `packages/` changes required. The deployer only needs to enable the plugin in `dynamic-plugins.yaml`:

```yaml
plugins:
  - package: '@acme/plugin-security-scan@1.2.0'
    disabled: false
```

### 4.2 Declarative via `dynamic-plugins.yaml` (secondary — config-driven control, RHDH only)

> **Note:** This mechanism uses Scalprum module federation and is only available in
> Red Hat Developer Hub (RHDH) deployments. In standard Backstage without Scalprum,
> `DynamicExtensionDiscovery` is a clean no-op (see §4.4).
>
> **Implementation note:** There are currently zero Scalprum API imports in this
> codebase. The entire `DynamicExtensionDiscovery` ↔ Scalprum integration is **net-new code**
> with no local examples to follow. The implementation should target
> [`@scalprum/react-core`](https://github.com/scalprum/scaffolding/tree/main/packages/react-core)
> and reference RHDH's
> [dynamic plugin documentation](https://docs.redhat.com/en/documentation/red_hat_developer_hub/)
> for the module federation scope naming convention.

For deployers who want to override labels, priority, or disable specific contributions without modifying plugin code:

```yaml
plugins:
  - package: '@acme/plugin-security-scan@1.2.0'
    disabled: false
    pluginConfig:
      rhaapExtensions:
        tabs:
          - extensionPoint: rhaap.git-repository.detail.tabs
            id: acme.security-scan
            importName: SecurityScanTab
            label: 'Security & Compliance' # override the default label
            priority: 5 # move it before CI Activity
        disabled:
          - acme.some-other-tab # disable a specific contribution
```

**Resolution mechanism:** `DynamicExtensionDiscovery` resolves `importName` to a React component via Scalprum's `useModule` hook (or equivalent `@scalprum/react-core` API). Each dynamic plugin is a federated module with a known scope (the plugin package name). The resolution is:

1. `@scalprum/react-core` retrieves the federated module for the plugin's scope
2. The named export matching `importName` is extracted (e.g., `SecurityScanTab`)
3. The component is wrapped in `lazy()` and registered with the `ContributionRegistry`
4. If resolution fails (module not found, export missing), a warning is logged via the Backstage `LoggerService` (if available in the extension host context) **and** via `console.error` as a fallback. The contribution is silently omitted — the host page continues to render without it

> **Observability note:** In production RHDH, browser `console.error` is invisible
> to platform operators. A misconfigured `importName` will result in a missing tab
> with no operator-visible signal. The RHDH dynamic plugin guide (§9) should document
> this as a debugging step: check the browser console when a declarative contribution
> does not appear. A future improvement could emit a Backstage notification via
> `alertApi` for failed resolutions (gated behind a `debug` config flag to avoid
> user-facing noise).

### 4.3 Registry singleton — shared module requirement

The `ContributionRegistry` is a **module-level singleton** — the shared bus between community plugins and the self-service host. This only works if all parties are talking to **the same instance** of `backstage-rhaap-extension-api`.

In RHDH, if self-service and a community plugin each bundle their own copy via `--embed-package`, you get two separate registries. Community plugin registrations never reach the self-service host.

**The fix** follows the standard Scalprum shared module pattern (same as how `react` is shared):

- **Self-service** lists `@ansible/backstage-rhaap-extension-api` in the RHDH shared scope — it provides the one shared instance
- **Community plugins** declare it as a `peerDependency` only — they do **not** embed it via `--embed-package`
- The RHDH deployer registers it once in `dynamic-plugins.yaml`:

```yaml
sharedPackages:
  - package: '@ansible/backstage-rhaap-extension-api'
    version: '^1.0.0'
```

**In standard Backstage** (no RHDH / no Scalprum): all plugins load in the same JS bundle so the module singleton is naturally shared — no `sharedPackages` configuration needed.

`@ansible/backstage-rhaap-react` (the component library) does **not** need to be shared — it has no singleton state. Each consumer can safely embed its own copy.

### 4.4 Async loading (handled by the registry)

RHDH dynamic plugins load asynchronously. A community plugin may finish loading after the self-service page has already rendered. The `useExtensionTabs` hook uses a subscription pattern that triggers React re-renders when late registrations arrive:

```typescript
function useExtensionTabs(extensionPoint, entity?) {
  const [revision, forceUpdate] = useReducer(x => x + 1, 0);
  useEffect(() => contributionRegistry.subscribe(forceUpdate), []);
  return useMemo(
    () => contributionRegistry.getTabs(extensionPoint, entity),
    [extensionPoint, entity, revision],
  );
}
```

### 4.4 Non-RHDH fallback

`DynamicExtensionDiscovery.tsx` detects the runtime environment by checking for the Scalprum API (`window.__scalprum__` or `@scalprum/react-core` availability). If Scalprum is absent (standard Backstage, no RHDH), the component is a clean no-op — it returns `null` and renders nothing. In this mode, only auto-registration (§4.1) is available.

---

## 5. Theme & Visual Consistency

### 5.1 MUI v4 theme wrapping with error isolation

Contributed components are rendered inside `RhaapThemeProvider` (MUI v4 only — see Goal 6 scope), `ErrorBoundary`, and `Suspense`:

```typescript
<PermissionGate permission={contribution.permission}>
  <RhaapThemeProvider>
    <ErrorBoundary
      fallback={<ContributionErrorFallback id={contribution.id} />}
    >
      <Suspense fallback={<SkeletonLoader />}>
        <ContributedComponent entity={entity} />
      </Suspense>
    </ErrorBoundary>
  </RhaapThemeProvider>
</PermissionGate>
```

`PermissionGate` is a thin wrapper around `@backstage/plugin-permission-react`'s `usePermission()` hook. If `contribution.permission` is undefined, the gate is a no-op (renders children directly). If the user lacks the permission, the slot renders nothing — same behavior as the built-in sidebar items.

Each contributed component slot is individually wrapped in an `ErrorBoundary`. If a community plugin's component throws during render, only that slot shows a fallback (e.g., "This tab failed to load") — the rest of the host page remains intact. This is implemented in `ExtensionRenderer`.

MUI-based contributions inherit colors, typography, and spacing from the host theme automatically.

> **API resolution ownership:** `ExtensionRenderer` (not `DynamicExtensionDiscovery`)
> resolves Backstage APIs. It calls `useApiHolder()` at render time to obtain an
> `ApiHolder`, then creates a `getApi` helper (`(apiRef) => apiHolder.get(apiRef)`)
> that is passed into `ActionContribution.handler` when an action is invoked.
> `useApiHolder()` (from `@backstage/core-plugin-api`) returns an object whose
> `.get(apiRef)` method can resolve any API ref — unlike `useApi()` which resolves
> a single specific ref at hook call time.
> This means `ExtensionRenderer` must be rendered inside a Backstage `ApiProvider` —
> which it is when rendered within the self-service plugin tree.
> Community developers writing test harnesses for their contributed actions must wrap
> the component under test in a `TestApiProvider` that supplies the API refs their
> handler calls `getApi()` with.
>
> **MUI v5 readiness:** When Backstage completes its upstream MUI v5 migration,
> `RhaapThemeProvider` will be extended to provide a v5 `ThemeProvider` alongside
> the v4 one. The `@mui/material` dependency will be added at that time.

### 5.2 CSS custom properties (framework-agnostic, theme-derived)

For non-MUI contributions (PatternFly, Chakra, plain CSS, etc.), the `ExtensionRenderer` container element injects CSS custom properties **dynamically derived from the active Backstage theme at render time** via `useTheme()`:

```typescript
// Inside ExtensionRenderer
const backstageTheme = useTheme<BackstageTheme>();

const cssVars = {
  '--rhaap-color-primary': backstageTheme.palette.primary.main,
  '--rhaap-color-error': backstageTheme.palette.error.main,
  '--rhaap-color-text': backstageTheme.palette.text.primary,
  '--rhaap-color-text-secondary': backstageTheme.palette.text.secondary,
  '--rhaap-color-background': backstageTheme.palette.background.default,
  '--rhaap-color-border': backstageTheme.palette.divider,
  '--rhaap-spacing-xs': `${backstageTheme.spacing(0.5)}px`,
  '--rhaap-spacing-sm': `${backstageTheme.spacing(1)}px`,
  '--rhaap-spacing-md': `${backstageTheme.spacing(2)}px`,
  '--rhaap-spacing-lg': `${backstageTheme.spacing(3)}px`,
  '--rhaap-spacing-xl': `${backstageTheme.spacing(4)}px`,
  '--rhaap-font-family': backstageTheme.typography.fontFamily,
  '--rhaap-font-size-body': backstageTheme.typography.body2.fontSize,
  '--rhaap-font-size-heading': backstageTheme.typography.h6.fontSize,
  '--rhaap-border-radius': `${backstageTheme.shape.borderRadius}px`,
} as React.CSSProperties;

<div className="rhaap-extension-container" style={cssVars}>
  {children}
</div>;
```

These properties automatically adapt to dark mode, custom Backstage themes, and any theme overrides the deployer has configured.

Community developers can use these from any framework:

```css
.my-tab {
  color: var(--rhaap-color-text);
  padding: var(--rhaap-spacing-md);
}
```

### 5.3 Static design token constants

For JS-based styling where dynamic theme access is not needed (e.g., fixed spacing values, icon sizes), the `rhaapTokens` object provides static fallback values:

```typescript
import { rhaapTokens } from '@ansible/backstage-rhaap-react';
// rhaapTokens.spacing.md === 16
// rhaapTokens.borderRadius === 8
```

> **Note:** These are static defaults and will **not** adapt to the active theme.
> Prefer CSS custom properties (§5.2) for theme-aware styling.

---

## 6. Self-Service Plugin Changes

### 6.1 Import migration

All self-service pages update their imports from local `../common/` paths to `@ansible/backstage-rhaap-react`. The old barrel (`components/common/index.ts`) becomes a re-export shim during migration.

### 6.2 Detail page refactoring

`RepositoryDetailsPage`, `CollectionDetailsPage`, and `EEDetailsPage` are refactored to:

1. Define built-in tabs as a local array
2. Merge with `useExtensionTabs()` results
3. Sort by priority
4. Render contributed components inside `ExtensionRenderer` (which provides `RhaapThemeProvider` + `ErrorBoundary` + `Suspense` + CSS custom properties)

### 6.3 Extension host initialization

`ExtensionRenderer` and `DynamicExtensionDiscovery` live in self-service under `src/extensions/`:

```text
plugins/self-service/src/extensions/
├── ExtensionRenderer.tsx        # Renders contributed tabs/cards with theme + error isolation
└── DynamicExtensionDiscovery.tsx # RHDH Scalprum discovery (no-op in standard Backstage)
```

**`ExtensionRenderer`** wraps each contributed component in `RhaapThemeProvider` → `ErrorBoundary` → `Suspense` → CSS custom properties (§5.1). It uses `useApiHolder()` from `@backstage/core-plugin-api` to create the `getApi` helper passed into `ActionContribution.handler` context. `useApiHolder()` returns an `ApiHolder` whose `.get(apiRef)` method resolves any API ref at call time — unlike `useApi()` which resolves a single specific ref.

**`DynamicExtensionDiscovery`** (rendered near the top of the self-service plugin tree) handles:

- Processing declarative configs from `dynamic-plugins.yaml`
- Resolving contributed components from Scalprum-loaded plugins (RHDH only; no-op in standard Backstage)
- Registering them with the `ContributionRegistry`

> **Why these live in self-service, not extension-api:** `ExtensionRenderer` depends on
> `@ansible/backstage-rhaap-react` (`RhaapThemeProvider`, `SkeletonLoader`),
> `@backstage/theme` (`BackstageTheme`), and `@material-ui/core` (`useTheme`).
> Adding these to extension-api's deps would defeat its purpose as a minimal contracts
> package. Community plugins never import `ExtensionRenderer` — they register
> contributions and the host renders them. If a second host page needs to render
> extensions in the future, `ExtensionRenderer` can be extracted to a shared package
> at that point.

---

## 7. Dependency Graph

```text
@ansible/backstage-rhaap-react
  ├── peerDeps: react, react-dom, @material-ui/core, @material-ui/icons,
  │             @backstage/core-components, @backstage/core-plugin-api,
  │             @backstage/catalog-model, @backstage/theme
  └── deps: (none — all framework deps are peers)

@ansible/backstage-rhaap-extension-api
  ├── peerDeps: react, @backstage/catalog-model, @backstage/core-plugin-api,
  │             @backstage/plugin-permission-common
  └── deps: (none — all deps are peers for type-only usage)

@ansible/backstage-rhaap-common
  └── (unchanged — backend-oriented: AAPClient, service refs, permissions, types)

@ansible/plugin-backstage-self-service
  ├── @ansible/backstage-rhaap-react
  ├── @ansible/backstage-rhaap-extension-api
  ├── @ansible/backstage-rhaap-common
  └── (retains: parseMarkdownLinks, parseEEDefinition, fetchReadmeFromBackend,
       fetchGitFileContentFromBackend — domain-specific, frontend-only utilities)

Community plugin (e.g. @acme/plugin-security-scan)
  ├── @ansible/backstage-rhaap-extension-api   (required — to register)
  └── @ansible/backstage-rhaap-react           (optional — to use shared UI)
```

---

## 8. Implementation Workstreams

### Create `backstage-rhaap-react` (component library)

**Pre-requisite:** Map internal dependency chains of extracted components. Verified import chains (from codebase):

- `PageHeaderSection` → `useIsSuperuser`, `usePageHeaderStyles`/`useSharedStyles`/`useProgressTooltipStyles`, `SyncProgressPopover`, `formatRelativeTime`, types
- `SyncProgressPopover` → `formatRelativeTime`, `useSharedStyles`, types
- `SyncDialog` → `useSharedStyles`, `useNotifications` (from NotificationContext), icons, constants, Backstage API types
- `NotificationContext` → `notificationStore`
- `NotificationStack` → `NotificationCard`
- `NotificationCard` → MUI + local types only (no notificationStore dependency)
- `useSyncStatusPolling` → `syncPollingService`

> **⚠ Extraction blocker for `syncPollingService`:** It imports
> `invalidateCollections` (from `CollectionsCatalog/collectionsInvalidation`) and
> `gitReposCache` (from `GitRepositories/gitReposCache`) — these are page-specific
> cache/state modules. `syncPollingService` cannot be extracted as-is. It must be
> refactored to accept cache-invalidation callbacks via dependency injection
> (e.g., a `registerInvalidator(category, fn)` pattern) before extraction.
> This refactor is a prerequisite for extracting the notification system.

**Extraction order:**

1. `types.ts`, `constants.ts` (no internal deps)
2. `formatRelativeTime` (no internal deps)
3. Icons, styles (`usePageHeaderStyles`, `useSharedStyles`, `useShellPageStyles`, `useProgressTooltipStyles`)
4. Hooks (`useIsSuperuser` — standalone; `useSyncStatusPolling` — blocked on `syncPollingService` refactor)
5. Simple UI components (`EmptyState`, `SkeletonLoader`, `EntityLinkButton`, `ScmIntegrationAuthError`)
6. `SyncProgressPopover` (depends on `formatRelativeTime`, styles, types)
7. `notificationStore` (depends on local types only)
8. `NotificationCard` → `NotificationStack` → `NotificationContext` (depends on `notificationStore`)
9. `syncPollingService` (after refactoring out page-specific imports)
10. `SyncDialog` (depends on styles, icons, `useNotifications`, constants)
11. `PageHeaderSection` (depends on `useIsSuperuser`, styles, `SyncProgressPopover`, `formatRelativeTime`)
12. Cache utilities (`PaginatedEntityCache`, `usePagination`, `useCacheSubscription`)
13. Theme (`RhaapThemeProvider`, `tokens.ts`)

**Tasks:**

- Create package scaffolding (package.json with peerDependencies, tsconfig.json, .eslintrc.js)
- Move components from `self-service/src/components/common/` with tests (in extraction order above)
- Move hooks from `self-service/src/hooks/`
- Move notifications from `self-service/src/components/notifications/`
- Move cache utilities from `self-service/src/components/common/cache/`
- Move `formatRelativeTime` from `self-service/src/utils/timeUtils.ts`
- Refactor `syncPollingService` to accept cache-invalidation callbacks (remove `invalidateCollections` and `gitReposCache` hard imports)
- Create `RhaapThemeProvider` (v4 only) and static design tokens
- Add re-export shims in self-service for backward compatibility
- Verify all self-service tests still pass

### Create `backstage-rhaap-extension-api` (extension contracts)

- Create package scaffolding
- Implement `ContributionRegistry` with full test coverage, including:
  - `reset()` method for test isolation
  - Duplicate-ID replacement with console warning
  - Stable sort at equal priority (insertion-order tiebreaker)
- Define all `TabContribution`, `CardContribution`, `ActionContribution` types
- Define all `EXTENSION_POINTS` constants
- Implement `useExtensionTabs`, `useExtensionCards`, `useExtensionActions` hooks
- Implement convenience registration helpers

### Wire self-service detail pages

- Refactor `RepositoryDetailsPage` to use `useExtensionTabs`
- Refactor `EEDetailsPage` to use `useExtensionTabs`
- Refactor `CollectionDetailsPage` to use `useExtensionTabs`
- Refactor `GitRepositoriesPage` list tabs to use `useExtensionTabs`
- Implement `ExtensionRenderer` component (in `self-service/src/extensions/`):
  - `ErrorBoundary` per contribution slot
  - Always wrap in `Suspense` (a `Suspense` boundary around a non-lazy component is a no-op — it renders immediately and the fallback never activates, so there is no need to detect lazy vs synchronous components)
  - `RhaapThemeProvider` (MUI v4)
  - CSS custom properties injection via `useTheme()`
  - `getApi` helper creation via `useApiHolder()` — passed into action handler context at call time
- Implement `DynamicExtensionDiscovery` for RHDH Scalprum discovery (with no-op fallback)
- Add CSS custom properties container wrapping
- Update all affected tests

### Content discovery extraction (future — separate plan)

> **First named external consumer:** APME (Automation Portal Management Experience)
> is the first external product team targeting the SDK for the Portal Plugin Factory. The content
> discovery extraction below serves as the first-party proof-of-SDK, validating the
> extension points before APME begins integration.

- Extract Git Repositories, Collections, EE catalog into `@ansible/plugin-backstage-content-discovery`
- Extract backend into `@ansible/backstage-plugin-catalog-backend-module-content-discovery`
- Register as first-party extension consumer (proof of SDK)
- Remove extracted components from self-service

### Navigation section contributions

> **Status:** Deferred. This is the hardest extension point because Backstage's
> routing system is designed for static, compile-time route registration. The design
> below is a sketch — not committed to implementation until a concrete consumer
> (e.g., content discovery extraction in content discovery extraction) validates the need.

**Problem:** A community plugin wants to add a top-level page (e.g., `/self-service/compliance`)
with its own sidebar link, permission gate, and routed component. The current SDK only supports
contributions _within_ existing pages (tabs, cards, actions).

**Why this is hard:** Backstage's `createRoutableExtension` requires a `RouteRef` at plugin
creation time. Community plugins can't inject `RouteRef`s into the self-service plugin
after it's been created. This means contributed routes cannot participate in Backstage's
cross-plugin route resolution (`useRouteRef()`).

**Contribution type (draft):**

```typescript
interface SectionContribution {
  id: string;
  label: string;
  icon: React.ComponentType;
  /** Relative path under /self-service/. E.g., 'compliance' → /self-service/compliance */
  path: string;
  component:
    | React.LazyExoticComponent<React.ComponentType<any>>
    | React.ComponentType<any>;
  /** If set, the sidebar item and route are hidden from users lacking this permission. */
  permission?: BasicPermission;
  priority?: number;
}
```

**Route injection:** `RouteView.tsx` would read contributed sections from the registry
and render additional `<Route>` elements dynamically, each wrapped in `<RequirePermission>`:

```typescript
const contributedSections = useExtensionSections();
// Inside <Routes>:
{
  contributedSections.map(section => (
    <Route
      key={section.id}
      path={section.path}
      element={
        section.permission ? (
          <RequirePermission permission={section.permission}>
            <ExtensionRenderer contribution={section} />
          </RequirePermission>
        ) : (
          <ExtensionRenderer contribution={section} />
        )
      }
    />
  ));
}
```

**Sidebar injection:** A `ContributedSidebarItems` component renders sidebar links
for each registered section, with permission gating:

```typescript
const ContributedSidebarItems = () => {
  const sections = useExtensionSections();
  return sections.map(section => (
    <ConditionallyRenderedSidebarItem
      key={section.id}
      to={`/self-service/${section.path}`}
      text={section.label}
      icon={section.icon}
      permission={section.permission}
    />
  ));
};
```

**Limitations:**

- Contributed routes use raw `react-router-dom` `<Route>` elements, not Backstage
  `RouteRef`s. This means other plugins cannot `useRouteRef()` to link to contributed
  pages. Contributors must use hardcoded paths (`/self-service/<path>`) for cross-links.
- Route paths must be unique across all contributions. Duplicate paths are rejected at
  registration time with a console error.
- Contributed pages are full-page components — they manage their own layout, data fetching,
  and sub-routes. The host provides only the sidebar frame, permission gate, and theme.

**Open questions:**

- Should contributed sections be able to define sub-routes (nested `<Route>` elements)?
- Should the sidebar support grouping/nesting contributed items under a parent?
- Will Backstage's new frontend system (`@backstage/frontend-plugin-api`) provide a
  better mechanism for dynamic route registration, making this pattern obsolete?

---

## 9. Documentation Deliverables

| Document                        | Location                                          | Content                                                                          |
| ------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Architecture doc (this file)    | `docs/architecture/self-service-extension-sdk.md` | Overall design, rationale, package layout                                        |
| Component library API reference | `plugins/backstage-rhaap-react/README.md`         | All exported components, props, examples                                         |
| Extension SDK guide             | `plugins/backstage-rhaap-extension-api/README.md` | How to register tabs/cards/actions, all extension points                         |
| Community developer quickstart  | `docs/sdk/quickstart.md`                          | End-to-end example: build a plugin that adds a tab                               |
| Design tokens reference         | `docs/sdk/design-tokens.md`                       | All CSS custom properties (dynamic) + JS tokens (static), theme guidance         |
| RHDH dynamic plugin guide       | `docs/sdk/rhdh-dynamic-plugins.md`                | Registration via `dynamic-plugins.yaml`, Scalprum resolution, declarative config |
| Migration guide (internal)      | `docs/sdk/migration-from-self-service.md`         | How to update self-service imports to use new packages                           |

---

## 10. Testing Strategy

- **Unit tests** for `ContributionRegistry` (register, unregister, filter, sort, subscribe, disable, **reset**, **duplicate-ID replacement**, **priority tiebreaker**, **filter try/catch — verify a throwing filter omits the contribution and warns**)
- **Hook tests** for `useExtensionTabs`, `useExtensionCards`, `useExtensionActions` (initial render, late registration, filtering)
- **Integration tests** for detail pages (verify contributed tabs render alongside built-in tabs)
- **Component tests** for `RhaapThemeProvider` (MUI v4 theme inheritance)
- **Component tests** for `ExtensionRenderer` (CSS custom properties injection, Suspense fallback, **ErrorBoundary isolation — verify a throwing contributed component does not crash the host page**, **handler error safety — verify a throwing/rejecting action handler surfaces an alert and does not crash the host page**)
- **All existing self-service tests must continue to pass** throughout migration
- **Test isolation:** All test suites that interact with the `ContributionRegistry` must call `registry.reset()` in `afterEach` to prevent state leakage between tests

---

## 11. Risks & Mitigations

| Risk                                                                     | Mitigation                                                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Circular dependency between new packages and self-service                | Strict dependency direction enforcement; re-export shims only in self-service                                                         |
| Breaking existing dynamic plugin artifacts                               | shared UI extraction uses re-exports; no public API changes                                                                           |
| Late-loading dynamic plugins cause UI flicker                            | `useExtensionTabs` subscription + graceful rendering (no layout shift)                                                                |
| Community plugins use incompatible React version                         | Peer dependency on `react ^18.3.1`; documented requirement                                                                            |
| CSS custom property names collide with other plugins                     | `--rhaap-` prefix is unique; documented naming convention                                                                             |
| **Community plugin throws during render**                                | **Each contribution slot wrapped in its own `ErrorBoundary`; fallback UI instead of page crash**                                      |
| **Registry state leaks between tests**                                   | **`reset()` method on registry; required in `afterEach` per testing strategy**                                                        |
| **Duplicate registration in HMR / dev mode**                             | **Second registration replaces first with console warning; deterministic behavior**                                                   |
| **Non-deterministic ordering at equal priority**                         | **Stable sort guarantees insertion-order tiebreaker; documented**                                                                     |
| **DynamicExtensionDiscovery fails in non-RHDH Backstage**                | **Scalprum detection; clean no-op when absent**                                                                                       |
| **Internal dependency chains break during shared UI extraction**         | **Dependency graph verified from actual imports; extraction order enforced; `syncPollingService` refactor noted as prerequisite**     |
| **Community plugin's filter callback throws inside useMemo**             | **Registry getters wrap `filter()` in try/catch; throwing filter omits contribution + logs warning**                                  |
| **Community plugin's action handler throws or returns rejected promise** | **`ExtensionRenderer` wraps handler invocation in try/catch + await; surfaces error via `alertApi`; host page unaffected**            |
| **Scalprum integration is net-new with no local examples**               | **Target `@scalprum/react-core` API documented; RHDH docs linked; higher implementation risk flagged for detail-page integration**    |
| **Registry singleton duplicated across dynamic plugins**                 | **`backstage-rhaap-extension-api` must be in RHDH `sharedPackages` scope; community plugins use peerDep only — no `--embed-package`** |
| **`syncPollingService` has page-specific hard imports**                  | **Must refactor to callback-based invalidation before extraction (documented in shared UI extraction pre-requisite)**                 |

---

## 12. Alignment with Full Architecture

Brad Thornton reviewed this plan against the full architecture (Ganesh's doc + PR #712) and identified six conflicts. Each has an agreed resolution. The implementation workstreams above remain the right sequence — the items below are corrections to specific design decisions within those workstreams.

### 12.1 Who owns the extension host?

**This plan:** `ExtensionRenderer` and `ContributionRegistry` live in self-service. Detail
pages act as hosts.

**Full architecture:** `portal-core` owns `portal-extension-host`. Self-service is a
_contributor_ to experiences, not a host. (Ganesh's doc §6.2)

**Resolution:** The earlier implementation's `ContributionRegistry` + `ExtensionRenderer` are the first implementation of `portal-extension-host`. Before production use, they move to a `portal-core` workspace and are published as `@ansible/portal-extension-host`. Self-service becomes a contributor, not a host. The detail-page integration work in §8 is still the right implementation step — it just lands in the right package at the end.

### 12.2 `handler()` vs `CapabilityLaunch`

**This plan:** `ActionContribution.handler({ entity, getApi })` can call any Backstage API.

**Full architecture:** Server-side effects go through `CapabilityLaunch` with constrained types only: `{ type: 'slot' | 'workflow' | 'operation'; operationId?; workflowId? }`. (Ganesh's doc §6.3, §9.2)

**Resolution:**

- Keep `handler()` **for pure UI/navigation only** (open a dialog, navigate, copy to clipboard). Document clearly: no network requests.
- Server-side effects (start a scan, trigger a build) must use `operationId` or `workflowId` — registered operations with schemas, permissions, and audit records.
- Update `ActionContribution` to add `launches?: CapabilityLaunch` alongside `handler`. The extension-contract implementation should ship both.

### 12.3 Frozen IDs vs experiences

**This plan:** `EXTENSION_POINTS` constants like `rhaap.collection.detail.tabs` are the primary public contract.

**Full architecture:** Host-owned _experiences_ (Quality, Authoring, Migration) that plugins contribute _capabilities_ into. Per-page IDs are implementation slots inside experiences, not the public API. (Ganesh's doc §6.2)

**Resolution:**

- The `rhaap.*.detail.tabs` IDs become **compatibility aliases** for current pages during the transition, not the primary contract.
- No new extension point IDs should follow the `rhaap.*` frozen-ID pattern.
- New capability registrations should target `experienceId` once `portal-core` defines experiences.
- The `EXTENSION_POINTS` constants in extension contracts are still the right step for the earlier implementation — just documented as aliases.

### 12.4 `filter?` vs `appliesToContentTypes`

**This plan:** `filter?: (entity: Entity) => boolean` is the content-type gate.

**Full architecture:** `appliesToContentTypes: string[]` is the primary, declarative gate. The host needs this statically — before React renders — to hide MCP tools and filter REST responses. (Ganesh's doc §6.3)

**Resolution:**

- Add `appliesToContentTypes?: string[]` to all contribution types in extension contracts.
- `filter` stays as an _additional_ UI-side predicate for narrow annotation-level cases.
- `appliesToContentTypes` is evaluated by the host before the component loads; `filter` runs at render time.

### 12.5 Single EE surface vs definition vs built image

**This plan:** `EE_DETAIL_TABS` / `EE_LIST_TABS` treat EE as one undifferentiated kind.

**Full architecture:** EE definition (the `execution-environment.yml`) and EE built image OCI artifact with digest, trust signals) are two different content types with different entry points. (Ganesh's doc §3.1)

**Resolution:**

- Two content type IDs from day one: `execution-environment-definition` and `execution-environment-image`.
- Shared UI extraction wires only the definition pages described in this plan.
- Update extension contracts to split `EE_DETAIL_TABS` into two constants with the correct type IDs.

### 12.6 Package naming

**This plan:** `@ansible/backstage-rhaap-react`, `@ansible/backstage-rhaap-extension-api`

**Full architecture:** `portal-extension-common`, `portal-extension-api`, `portal-extension-host`, `portal-plugin-sdk` — all in `workspaces/portal-core/`. Repository proposes renaming to `automation-portal-plugins`. (Ganesh's doc §2.2, §2.6)

**Resolution:** Rename before any external publishing. Since the earlier implementation is unpublished this
costs nothing now.

| Original package name               | Target name               |
| ----------------------------------- | ------------------------- |
| `backstage-rhaap-react`             | `portal-plugin-sdk`       |
| `backstage-rhaap-extension-api`     | `portal-extension-api`    |
| _(host, currently in self-service)_ | `portal-extension-host`   |
| _(contracts, currently inline)_     | `portal-extension-common` |

### 12.7 What the current self-service plugin actually is

Per Brad's analysis — the plugin today bundles four distinct concerns:

| Cluster                | What it does                                                    | Target home                                                        |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Portal chrome          | `SignInPage`, `AAPLogoutButton`, `AppThemeFixer`, `LandingPage` | `portal-core` / `aap`                                              |
| Content catalogs       | Collections, Git repos, EE catalog, sync                        | `workspaces/content/automation-content`                            |
| Create / run templates | Templates catalog, `CreateTask`, `RunTask`, task history        | `workspaces/portal-scaffolder/` (done)                             |
| Scaffolder fields      | 11 field extensions                                             | Stay in `self-service` or `scaffolder-backend-module-self-service` |

After content discovery extraction, the remaining plugin (templates + tasks + fields) should
be named `portal-scaffolder` (plugin ID `portal-scaffolder`, package
`@ansible/backstage-plugin-portal-scaffolder`). Keep `/self-service/*` as redirects.

---

## 13. Compatibility Policy

`@ansible/backstage-rhaap-extension-api` is a public SDK that external consumers depend on. The following semver guarantees apply once the package reaches `1.0.0`:

- **Extension point IDs** (`EXTENSION_POINTS` values) are stable across minor versions. An ID is never renamed or removed in a minor release.
- **Contribution types** (`TabContribution`, `CardContribution`, `ActionContribution`) are additive-only across minor versions. New optional fields may be added; existing fields are never removed or made required.
- **Registry API** (`registerTab`, `getTabs`, `subscribe`, `reset`, etc.) is backward-compatible across minor versions. New methods may be added; existing method signatures are never changed.
- **Breaking changes** (removing an extension point, changing a required field type, changing `getApi` signature) require a major version bump with a migration guide.

Pre-`1.0.0` releases follow `0.x.y` semver: minor bumps may include breaking changes, documented in the changelog.

> **Note:** Once packages are renamed to `portal-extension-api` / `portal-plugin-sdk` (§12.6),
> the semver guarantees above transfer to the new package names. The `backstage-rhaap-*`
> names become re-export shims and are considered deprecated from that point.
