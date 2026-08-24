# US-016 — Abbenay AI providers on Quality settings

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Admin / power user |
| **Surface** | Git Repositories → **Quality settings** → AI providers card |
| **Depends on** | APME ADR-070 Gateway Abbenay admin allowlist; [US-004](US-004-admin-quality-settings.md) tab shell |
| **Craig journey** | [J6](user-journeys.md) |

## Story

> As an admin, I want to add, edit, and remove Abbenay AI providers from the
> Portal Quality settings in a native dialog (not an embedded dashboard), so
> teams can enable models for AI-assisted remediation without leaving the
> Portal or editing Abbenay YAML by hand.

## Acceptance criteria

- [x] Quality settings shows an **AI providers** card below ansible-core /
      AI gate toggle (US-004 / AAP-88783).
- [x] Status chip reflects `getAiStatus` (connected / model count).
- [x] List shows provider id, engine, model count (no secrets).
- [x] Portal-managed providers are editable; deploy-time ConfigMap-only
      providers appear under **System providers** (lock + Source: ConfigMap,
      no Edit/Delete). UI-managed wins on id collision.
- [x] **Add provider** / **Edit** open a Material-UI Dialog with two steps:
      (1) provider setup — id (add only), engine select, optional base URL,
      write-only API key; (2) models — enable model ids.
- [x] Save calls `POST …/provider/{id}/configure` via catalog → Gateway.
- [x] Remove confirms then `DELETE …/provider/{id}`.
- [x] Configure/delete failures surface a clear error (including persistence
      failures tracked in [apme#498](https://github.com/ansible/apme/issues/498)).
- [x] No Abbenay webview, chat links, or “Open Abbenay dashboard”.

## How to verify (local)

1. Portal + APME with Abbenay enabled (`automation-portal-local` / external APME).
2. Open **Git Repositories → Quality settings**.
3. **Add provider** → fill engine + key + models → **Save** — list refreshes.
4. **Edit** / **Remove** behave as above; reload keeps state when Gateway
   persistence works (see #498 if Save fails after success-looking response).

```bash
yarn workspace @ansible/plugin-backstage-apme test \
  --watchAll=false \
  ApmeQualitySettingsTab ApmeAiProviders

yarn workspace @ansible/backstage-plugin-catalog-backend-module-apme test \
  --watchAll=false \
  router
```

## Notes

- Unit tests passed; portal smoke optional when Abbenay enabled.
- Path: FE `ApmeApi` → catalog `/apme/ai/*` → Gateway ADR-070 → Abbenay HTTP
  `127.0.0.1:8787`.
- Engine Select is populated **live** from `GET /apme/ai/engines` (catalog)
  → `GET /api/v1/ai/engines` (Gateway → Abbenay). The static
  `APME_AI_ENGINE_OPTIONS` constant has been removed. Unknown engines already
  on a provider (edit mode) still appear in the select. `mock` engine is
  filtered out. Engine descriptors include `requiresKey`, `defaultBaseUrl`, and
  `defaultEnvVar` to provide helpful hints in the dialog.
- `ansible.apme.enableAi` is the default AI gate; Quality settings can override
  it via the portal settings store (US-004 / AAP-88783).
- Deploy-time ConfigMap providers remain supported as read-only **System
  providers** alongside portal-managed providers.
- Inference / model picker for scans still uses Primary `GET /ai/models`.
- UX inspired by Abbenay VS Code flow
  ([abbenay#95](https://github.com/redhat-developer/abbenay/pull/95));
  Portal chrome is native MUI only.
