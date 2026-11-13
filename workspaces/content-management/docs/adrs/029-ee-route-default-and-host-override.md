# ADR-029: Default EE route with a host override

- **Status**: Proposed
- **Date**: 2026-11-12
- **Deciders**: Content Management and Portal owners
- **Scope**: The address of the Execution Environments page in the Backstage New Frontend System.
- **Related decision**: If accepted, this ADR supersedes only the mount-path rule in [ADR-005](005-dedicated-repository-and-mount-path.md).

## Context

ADR-005 assigned the mount path to host configuration through RHDH's legacy
dynamic route configuration. Its goal was to let the portal team move the page
without a plugin release.

The New Frontend System gives the same control to the portal team through a
page extension's path override. The EE page extension already supplies
`/content/ee` as its default. The portal sidebar targets the page extension by
ID, so the entry can follow the address chosen by the host. Other portal pages,
including Collections, also declare default addresses in code.

## Alternatives considered

| Alternative                                    | Trade-off                                                                                                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Require every host to specify the path         | Preserves ADR-005's configuration-only rule. Every installation must supply a path, even when it uses the standard address.                                                                  |
| Declare a default and let the host override it | Gives installations a predictable address out of the box. The host can move the page through configuration. The plugin owns the default and must consider existing links before changing it. |

## Proposed decision

1. The EE page extension supplies `/content/ee` as its default address.
2. The host can override the path through the page extension configuration.
   Moving the page on a particular host requires a configuration change.
3. The portal sidebar targets the page extension ID
   `page:automation-content/ee`. Links that resolve the EE page route use the
   effective address.

## Consequences

- Existing installations that use the default keep `/content/ee`. A host that
  overrides the address owns any redirects needed for its existing bookmarks.
- A host upgrade should verify that the sidebar opens the page and that route
  references resolve correctly when a host override is supplied.
- On acceptance, add a note and link in ADR-005 and update the ADR index to show
  that ADR-029 supersedes its mount-path rule. The scope of this proposal is
  limited to the EE route.
