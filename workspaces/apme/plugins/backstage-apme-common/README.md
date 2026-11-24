## Repository identity, Dev Spaces and settings

APME owns the existing repository normalization and project lookup helpers.
Use `./catalogEntity` for entity-derived values and `./normalizeRepoUrl` for URL
normalization. Both use the same local `repositoryIdentity` implementation.
Use `./devSpaces` for repository, branch and remediation links, and
`./permissions` for the unchanged `ansible.settings.view` / `ansible.settings.edit`
resource permissions scoped to `ansible-settings` and capability `apme`.

These entry points are browser/backend safe. Frontend extension and cache APIs
come from the dedicated `portal-scaffolder-react` subpaths; backend SCM clients/token resolution come from
`portal-plugin-node`. No APME package imports or embeds `backstage-rhaap-common`.
The retired legacy config-reading Dev Spaces helper had no repository callers;
the content scaffolder's independent helper remains unchanged.
