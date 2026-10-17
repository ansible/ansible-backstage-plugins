# ADR-005: Dedicated Repository and Config-Mounted Route

**Status**: Accepted
**Date**: 2026-09-14
**Deciders**: Content management team
**Scope**: Where this plugin set lives, and how it is mounted in Automation Portal.

## Context

Content management could have been prototyped inside `ansible-backstage-plugins`, which
already hosts the portal's plugins and provides the patterns this set follows — the DI
service-ref shape, the `fromConfig()` provider factory, the per-plugin `config.d.ts`
convention, the root toolchain.

Prototyping there is the lower-friction start and has a known ending: the boundary this
design depends on (ADR-001) is easy to state and easy to erode, and an extraction step
later is paid at exactly the moment the code is largest and most entangled. Meanwhile the
mount path is the other place coupling hides — a frontend plugin that knows its own URL
cannot be moved without a code change, and "mounted at `/automation-content`" quietly
becomes a fact about the source rather than a deployment choice.

## Alternatives Considered

| Alternative                                                    | Why rejected                                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Build inside `ansible-backstage-plugins`, extract later        | Clean boundaries are cheap on day one and expensive later. The extraction is a cost that grows, paid at the worst time. |
| Depend on `ansible-backstage-plugins` packages for shared code | Creates the coupling the repository split exists to avoid, and makes this set unbuildable without that repo.            |
| Declare the route path in the plugin's own route ref           | Bakes a deployment decision into source. Moving the page becomes a release rather than a configuration edit.            |

## Decision

**This plugin set lives in its own repository, and its mount path is configuration.**

1. Patterns are **copied** from `ansible-backstage-plugins`, not depended on. Nothing is
   imported from it. The only shared artifact is `@ansible/content-model`, which neither
   repository owns.
2. The frontend declares a route ref **with no path**. The concrete mount point comes from
   RHDH `dynamicRoutes` configuration, so moving the page from `/automation-content` to
   anywhere else is a config edit and never a code change.
3. Plugins ship downstream as RHDH dynamic plugins (OCI tarballs), mounted through the
   portal's `dynamic-plugins.yaml` — the same mechanism used in production, exercised
   locally through `automation-portal-local`.
4. The set coexists with `self-service` and the rest of the portal rather than replacing
   anything: the existing `EEEntityProvider` in `ansible-backstage-plugins` is a 52-line
   stub, so nothing real is displaced.

## Consequences

- The boundary is structural from the first commit; violating it requires adding a
  dependency, which is visible in review.
- Two repositories means two release trains and a shared contract package to version
  deliberately.
- Local development needs both repositories checked out — see
  [`docs/guides/development-environment.md`](../../docs/guides/development-environment.md).
