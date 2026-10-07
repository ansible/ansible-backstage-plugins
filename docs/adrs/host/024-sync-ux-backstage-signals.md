# ADR-024: Sync UX — Backstage Signals and Unified Pattern

**Audience:** `host` — see [ADR index](../index.md).

- **Status**: Accepted
- **Date**: 2026-07-31
- **Deciders**: Portal team

## Context

Multi-org support compounds sync complexity — more orgs mean longer syncs and higher risk of concurrent triggers from multiple admins. The portal has inconsistent sync patterns across views: templates use a "Sync now" header link, collections and git repos use a SyncDialog with tree selection. No view prevents concurrent syncs or shows real-time sync state across admin sessions.

## Decision

### Crawl-Walk-Run Strategy

**Crawl (current scope — ANSTRAT-912):** All-or-nothing sync. All configured organizations sync simultaneously. No granular per-org selection. Consistent UI pattern across templates, collections, and git repos.

### Future Phases (Out of Scope for ANSTRAT-912)

**Walk:** Per-org sync selection in a tree dialog. Admin chooses which orgs/content types to sync.

**Run:** Event-based sync via AAP webhooks. No manual trigger needed — catalog updates automatically on AAP resource changes.

### Unified Sync UI Pattern

All content views (templates, collections, git repos) adopt the same sync pattern:

- Sync button as secondary action, same line as primary action (e.g. "Add Template")
- Hover tooltip on sync button shows last sync timestamp
- Sync button disabled with spinning icon and "Syncing..." text during active sync
- Disabled state shared across all admin sessions in real-time

### Backstage Signals for Sync State

Use Backstage's native Signals plugin (WebSocket push) instead of REST polling for sync state management:

1. **Backend**: `SyncStateTracker` publishes to signal channel on sync start/complete/fail
2. **Frontend**: `useSignal()` hook subscribes to channel, updates UI state immediately
3. **Page load**: Single REST call (`fetchSyncStatus`) for initial state, signals handle everything after

**Why Signals over polling:**

- Real-time state push — no stale data window
- Cross-session — all admins see sync state simultaneously
- No polling infrastructure — eliminates `syncPollingService.ts` (615 lines)
- Native Backstage — supported in RHDH as dynamic plugin

**Required RHDH configuration:**

```yaml
- package: ./dynamic-plugins/dist/backstage-plugin-signals-backend-dynamic
  disabled: false
- package: ./dynamic-plugins/dist/backstage-plugin-signals
  disabled: false
  pluginConfig:
    dynamicPlugins:
      frontend:
        backstage.plugin-signals: {}
```

### Signal Channel Design

| Channel                   | Publisher          | Payload                                                                          | Consumer             |
| ------------------------- | ------------------ | -------------------------------------------------------------------------------- | -------------------- |
| `catalog:aap-sync-status` | `SyncStateTracker` | `{ provider, syncInProgress, lastSyncTime, lastSyncStatus, lastFailedSyncTime }` | Home.tsx sync button |

Future channels follow the same pattern for content sync, job status, and user resolution.

## Consequences

### Positive

- Consistent sync UX across all portal views
- Real-time sync state without polling overhead
- Prevents concurrent manual sync triggers across admin sessions
- Extensible — same pattern applies to job status, content sync, first-login resolution
- Native Backstage feature — no custom infrastructure

### Negative

- WebSocket connection requires authenticated session — initial connection fails before login (auto-recovers)
- Signals are ephemeral — no replay on reconnect; initial page load still needs REST fallback
- RHDH dynamic plugin `pluginConfig` must explicitly register signals frontend — easy to miss

### Neutral

- Backend sync mechanism unchanged — same scheduler, same AAP API calls
- Helm chart needs signals plugins enabled in dynamic-plugins config

## Related

- [ANSTRAT-912](https://redhat.atlassian.net/browse/ANSTRAT-912) — Portal multi-org support
- [AAP-84854](https://redhat.atlassian.net/browse/AAP-84854) — Sync button disable during active sync
- ADR-020 — Multi-org namespace isolation
- ADR-021 — Template type taxonomy
- Research: Backstage Signals adoption notes (not published in this repository)
- PoC branch: `feat/combined-sync-poc` (ansible-backstage-plugins)
- PoC deployed on a development OpenShift cluster (environment name omitted)
