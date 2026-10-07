# ADR-011: Portal Plugin Configuration Namespace

**Audience:** `common` — see [ADR index](../index.md).

**Status**: Accepted
**Date**: 2026-07-01
**Deciders**: Portal team
**Scope**: Backstage plugins created using the Portal Plugin Factory framework — runtime `app-config` keys for portal capabilities delivered by factory Backstage plugins.

## Context

The **Portal Plugin Factory framework** enables product teams to contribute **Backstage plugins** in `ansible-backstage-plugins`. Those artifacts implement **portal capabilities** — cohesive user-facing features (for example content-quality signals on Git Repositories) that may span a frontend plugin, `*-common` contracts, and an optional backend module.

Runtime configuration is keyed by **capability**, not by individual plugin artifact. Each capability needs settings such as feature toggles, service URLs, TLS options, and dev-only flags. Without a namespace convention, contributing teams invent ad-hoc config paths — some use top-level keys (`quality.enabled`), some nest under `ansible.*` (`ansible.feedback.enabled`, `ansible.devSpaces.baseUrl`), and some follow RHDH manifest conventions (`ansible.plugin-backstage-quality` in `pluginConfig.dynamicPlugins.frontend`).

The Portal Plugin Factory Review acceptance criteria require namespace compliance. A single convention lets the portal admin UI (ADR-003), the config schema validation, and the scaffolding template all rely on a predictable config shape.

ADR-010 requires a master `enabled` toggle with zero-footprint semantics for each **portal capability** — not a separate toggle per Backstage plugin package. Disabling `ansible.<pluginId>.enabled` must remove every surface and backend route that capability contributes. That toggle must live at a predictable path so enabled hooks, config readers, and the admin settings UI all follow one pattern.

RHDH dynamic plugin loading uses a separate manifest namespace (`ansible.plugin-<package>` in `pluginConfig.dynamicPlugins.frontend`, supplied via portal `dynamic-plugins.yaml`) for route/tab/sidebar registration. Runtime config and deployment wiring must not be conflated.

## Alternatives Considered

| Alternative                                                               | Why rejected                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Top-level plugin slug (`quality.enabled`, `compliance.enabled`)           | No shared prefix; collides with Backstage core keys; admin UI cannot enumerate plugin config                          |
| Manifest package name as key (`ansible.plugin-backstage-quality.enabled`) | Verbose; duplicates RHDH manifest keys; poor admin UX; not intuitive for contributing teams                           |
| Per-plugin arbitrary paths                                                | Each team invents its own shape; Plugin Factory cannot teach one pattern; scaffolding template cannot generate config |

## Decision

**All portal capability runtime configuration lives under `ansible.<pluginId>.*`.** `<pluginId>` names the **portal capability** registered at Propose phase — the combined feature users and operators enable — even when multiple Backstage plugin artifacts implement it. This applies to factory Backstage plugin capabilities and base RHAAP plugin capabilities. It does **not** replace RHDH dynamic-plugin manifest keys (`pluginConfig.dynamicPlugins.frontend.<package-name>`) — those control load-time route/tab registration per artifact (ADR-010 rule 4).

### Namespace rules

1. **`<pluginId>`** — short stable slug for the **portal capability** (lowercase, no `@ansible/` prefix, no `plugin-` prefix). Registered during Portal Plugin Factory Phase 1 (Propose). One capability, one config block — regardless of how many frontend/backend artifacts implement it. Examples: `quality`, `feedback`, `devSpaces`, `compliance`, `workflows`.
2. **Master toggle** — `ansible.<pluginId>.enabled` (boolean). Default `false` when block absent. Turns the **entire capability** off per ADR-010 zero-footprint behavior (all host slots, tabs, routes, and backend modules for that capability).
3. **Capability-specific keys** — sibling keys under the same block (`baseUrl`, `checkSSL`, `mockMode`, sync schedules, etc.).
4. **Config reader** — the capability's `*-common` package exposes `get<Capability>Config(config: Config)` reading `ansible.<pluginId>`. All artifacts for that capability use this reader — never scatter string literals. The Portal Plugin Factory scaffolding template generates it once per capability.
5. **Config schema** — declared in the capability's primary `config.d.ts`. Portal Plugin Factory Review validates the schema exists and matches this namespace.
6. **Frontend enabled hook** — `use<Capability>Enabled()` reads `configApi.getOptionalBoolean('ansible.<pluginId>.enabled') ?? false`. All UI entry points for the capability consult this hook.
7. **Legacy migration** — existing top-level plugin slug keys may be read as fallback during transition with a deprecation comment pointing to this ADR. New plugins must use `ansible.<pluginId>.*` from day one.
8. **RHDH manifest keys** — `dynamicPlugins.frontend.ansible.plugin-<package>` in each plugin's `pluginConfig` (merged via portal `dynamic-plugins.yaml` into generated `app-config.dynamic-plugins.yaml`) controls route/tab/sidebar registration in RHDH. This is deployment wiring, not the runtime `enabled` toggle. Both may be required on RHDH; upstream dev app uses runtime config + static imports from `packages/app`.

### Standard key reference

| Key        | Required                           | Purpose                                           |
| ---------- | ---------------------------------- | ------------------------------------------------- |
| `enabled`  | Yes                                | Master capability toggle (ADR-010 zero footprint) |
| `baseUrl`  | When plugin calls external service | Service endpoint                                  |
| `checkSSL` | Optional                           | TLS verification (default true in prod)           |
| `mockMode` | Optional, dev only                 | Fixture data without external service             |

### Example (multiple plugins)

```yaml
ansible:
  quality:
    enabled: true
    baseUrl: http://localhost:8080
    checkSSL: false
  compliance:
    enabled: true
    baseUrl: http://compliance-svc:9090
  feedback:
    enabled: true
```

### Plugin Factory integration

- **Scaffolding template** generates `config.d.ts` with `ansible.<pluginId>` schema and `get<Capability>Config()` reader per capability
- **Acceptance criteria** include: config namespace compliance, capability-level `enabled` toggle, zero-footprint verification across all artifacts for that capability
- **Admin UI** (ADR-003) can enumerate capability config by scanning `ansible.*` keys

### Verification

| Test                                          | Expected                                                   |
| --------------------------------------------- | ---------------------------------------------------------- |
| `ansible.<pluginId>.enabled: false` + restart | ADR-010 zero footprint for that capability (all artifacts) |
| Block absent                                  | Config reader returns `enabled: false` defaults            |
| Admin sets key in DB (ADR-001)                | Same path; GUI/API use `ansible.<pluginId>.*`              |
| New capability via scaffolding template       | Generated code uses `ansible.<pluginId>.*`                 |

## Consequences

**Positive:** One pattern for all contributing teams. Scaffolding template, acceptance criteria, and admin UI all rely on predictable paths. Plugin Factory can validate namespace compliance automatically.

**Negative:** Legacy top-level keys need a migration period. Contributing teams must register the capability `pluginId` during proposal phase.

## Related

- Portal Plugin Factory framework
- ADR-001 (storage/precedence), ADR-002 (infra vs app boundary)
- ADR-003 (portal admin UI)
- ADR-005 (deployment / dynamic plugins)
- ADR-010 (composability — capability-level `enabled` drives zero footprint)
- ADR-013 (preview plugin enablement defaults)
