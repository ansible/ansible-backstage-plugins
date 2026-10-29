# ADR-024: Sync UX — Backstage Signals and Unified Pattern

**Audience:** `host` — see [ADR index](../index.md).

- **Status**: Accepted
- **Date**: 2026-07-31
- **Deciders**: Portal team

## Context

Multi-org support compounds sync complexity — more orgs mean longer syncs and higher risk of concurrent triggers from multiple admins. The portal has inconsistent sync patterns across views: templates use a "Sync now" header link, collections and git repos use a SyncDialog with tree selection. No view prevents concurrent syncs or shows real-time sync state across admin sessions.

## Decision

### Crawl-Walk-Run Strategy

**Crawl (current scope):** All-or-nothing sync. All configured organizations sync simultaneously. No granular per-org selection. Consistent UI pattern across templates, collections, and git repos.

### Future Phases (Out of Scope)

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
3. **Initial state and reconnect**: Fetch authoritative status (`fetchSyncStatus`) on page load and after every signal reconnection. Signals update the UI between these snapshots; they do not replace reconciliation.
4. **Ordering**: Establish the subscription before reading the initial snapshot, and reconcile buffered events with that snapshot using a server revision or another documented ordering mechanism. An older response must not overwrite newer sync state. The implementation must define and test the chosen mechanism.
5. **Concurrency admission**: The backend remains authoritative for accepting a sync trigger. UI disabled state and signal delivery do not prevent two clients from submitting concurrently. Define the admission/locking scope for the deployed scheduler, including multiple pods where supported.

**Why Signals over polling:**

- Prompt state updates while connected, with authoritative reconciliation after reconnect
- Cross-session — all admins see sync state simultaneously
- No polling infrastructure — eliminates `syncPollingService.ts` (615 lines)
- Native Backstage — supported in RHDH as dynamic plugin

**RHDH NFS deployment contract:**

Install compatible Signals backend and native frontend artifacts for the supported RHDH baseline. The frontend artifact must expose its native feature through `./alpha`; operators use `app.extensions` only for overrides of extensions actually provided by that artifact. Do not register Signals through `pluginConfig.dynamicPlugins.frontend`: that is legacy Scalprum wiring and conflicts with ADR-010/011's NFS contract.

Exact artifact paths and extension IDs depend on the selected RHDH bundle and export version. Verify them against that bundle before publishing deployment YAML; this ADR does not define a portable artifact-path or extension-ID snippet. The source app's native composition and the [NFS composition guide](../../next/portal-sdk-nfs-composition.md) describe the current Portal integration baseline.

### Signal Channel Design

| Channel                   | Publisher          | Payload                                                                          | Consumer             |
| ------------------------- | ------------------ | -------------------------------------------------------------------------------- | -------------------- |
| `catalog:aap-sync-status` | `SyncStateTracker` | `{ provider, syncInProgress, lastSyncTime, lastSyncStatus, lastFailedSyncTime }` | Home.tsx sync button |

Future channels follow the same pattern for content sync, job status, and user resolution.

## Consequences

### Positive

- Consistent sync UX across all portal views
- Real-time sync state without polling overhead
- Communicates active sync state across sessions; authoritative backend admission prevents concurrent manual sync triggers
- Extensible — same pattern applies to job status, content sync, first-login resolution
- Native Backstage feature — no custom infrastructure

### Negative

- WebSocket connection requires authenticated session — initial connection fails before login (auto-recovers)
- Signals are ephemeral — no replay on reconnect; initial load and reconnection require authoritative status reconciliation
- Native frontend and backend Signals artifacts must match the supported RHDH bundle; verify actual exports and overrides instead of copying legacy wiring

### Neutral

- Backend sync mechanism unchanged — same scheduler, same AAP API calls
- Helm chart needs signals plugins enabled in dynamic-plugins config

### Verification requirements

- Disconnect during an active sync, complete it while disconnected, then reconnect: the authoritative refresh must clear the stale `Syncing...` state without a page reload.
- Deliver a signal while the initial status request is in flight: the older response must not replace newer state.
- Submit concurrent sync requests from two sessions, and from separate pods where supported: backend admission must enforce the documented concurrency scope regardless of UI signal timing.

## Related

- ADR-020 — Multi-org namespace isolation
- ADR-021 — Template type taxonomy
- Research: Backstage Signals adoption notes (not published in this repository)
- PoC validated on a development cluster
