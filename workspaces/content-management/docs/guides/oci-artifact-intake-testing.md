# Test OCI artifact intake

This research implementation reads execution environments, plus skill and
collection archives using the documented private fixture artifact types. It does
not automatically understand every OCI payload or establish certification.

## Verification snapshot: November 8, 2026

- Seven affected package suites passed: common 209, backend 137, catalog 71,
  EE adapter 9, skill adapter 16, collection adapter 9, frontend 17.
- The common suite retains five existing skips; the backend's local-Zot test is
  skipped without its opt-in environment variable.
- The final opt-in live-Zot test passed separately: 12 digest-qualified
  artifacts, comprising five EEs, two skills, three collection releases, and
  two generic OCI images. This is the selected sample, not the entire corpus.
- Scoped TypeScript checks, touched-file lint/formatting, and diff checks passed.
- Both backend dynamic exports passed after generating the required type
  declarations. Both generated entry modules loaded successfully, and their
  skill/collection adapters resolved inside the generated outputs rather than
  falling back to the source worktree.
- No full authenticated browser rehearsal, PostgreSQL runtime test, or
  process-restart qualification was performed in this review.

Run commands from the artifact-intake worktree, not another checkout:

```bash
cd .slim/worktrees/aap-94357-artifact-intake
```

The command above assumes the shell starts at the main repository root. If it is
already inside the worktree, do not change directories again.

## 1. Run the opt-in test against local Zot

Prerequisites:

- Node 22 or 24 and the repository's Yarn installation.
- Dependencies installed inside this worktree (`yarn install`).
- The existing development Zot registry reachable at `https://localhost:8445`.
- The Utopia fixtures already published. The test performs registry reads only;
  it does not build, push, delete, or retag content.

Check readiness, then run:

```bash
# Local self-signed development certificate only; do not use this exception
# against a remote registry.
curl --fail --silent --show-error --insecure https://localhost:8445/v2/

LIVE_ZOT=1 yarn workspace @ansible/plugin-automation-content-backend test \
  src/live-zot.verify.test.ts --watch=false --runInBand
```

This exercises real registry requests, adapter classification, archive metadata
reading, and database persistence in an isolated in-memory SQLite database.
It does not start or authenticate to the Portal web application. The test is
skipped during ordinary test runs unless `LIVE_ZOT=1` is set.

Expected coverage for the configured sample:

- EEs remain classified as `execution-environment`.
- Two skill artifacts yield their actual names and descriptions.
- Three collection artifacts yield FQCNs, versions, authors, and tags:
  `utopia.accounts` 1.0.0 and `utopia.network` 1.0.0/1.1.0.
- The older `demo/skills/cluster-triage` and `demo/collections/ansible-utils`
  demos remain `oci-image`: their manifests do not declare the recognized
  fixture `artifactType`.
- Digest-derived cosign signature tags are not indexed as standalone content.

The sample is not a full-corpus, multi-registry, production-database, browser,
or process-restart qualification test.

## 2. Run automated regressions without Zot

```bash
for package in \
  @ansible/automation-content-common \
  @ansible/plugin-automation-content-backend \
  @ansible/plugin-catalog-backend-module-automation-content \
  @ansible/content-type-execution-environment \
  @ansible/content-type-ansible-skill \
  @ansible/content-type-ansible-collection \
  @ansible/plugin-automation-content
do
  yarn workspace "$package" test --watch=false --runInBand || exit 1
done
```

The new regressions cover bounded archive processing, malformed metadata,
distinct plugin categories sharing an FQCN, typed item lookup, API response
rendering, and query-state navigation. Check test output for failures; a skipped
live-Zot suite without `LIVE_ZOT=1` is expected.

For a concise frontend report without the dependency's jsdom CSS console noise:

```bash
yarn workspace @ansible/plugin-automation-content test \
  --watch=false --runInBand --silent
```

The test runner still reports failed tests and aggregate counts. This only
suppresses application console output; it does not turn test failures into
successes.

## 3. Browse the results in Portal

### Start the correct checkout

Stop any development server already using ports 3000/7007 from its original
terminal before starting this worktree's server. Two checkouts do not share
source changes just because they connect to the same Zot registry.

Configure the usual Portal authentication and required environment variables
for this worktree. Git worktrees do not automatically copy a gitignored `.env`.
Keep credentials local; do not weaken shared authentication or commit secrets
to make this test work.

The worktree's local registry override should include:

```yaml
catalog:
  providers:
    automationContent:
      registries:
        - name: local-zot
          url: https://localhost:8445
          # Local development only. Prefer caFile with the local CA when available.
          insecure: true
          auth:
            type: anonymous
          repositories:
            - demo/utopia-ee
            - demo/utopia-bootstrap-ee
            - demo/basic-ee
            - demo/skills/utopia-backup-validation
            - demo/skills/utopia-cluster-triage
            - demo/collections/utopia-accounts
            - demo/collections/utopia-network
            - demo/skills/cluster-triage
            - demo/collections/ansible-utils
```

Use this as a local override, not a replacement for unrelated existing local
configuration. Then run:

```bash
yarn start
```

Use the application's normal sign-in flow. A 401 is an authentication/setup
failure, not evidence that OCI classification failed.

### Open the content page

The source app defaults to its new frontend system; this plugin's current local
mount uses the legacy source app. Keep `portalFrontend=legacy` in the URL:

```text
http://localhost:3000/automation-content?portalFrontend=legacy&type=skill
http://localhost:3000/automation-content?portalFrontend=legacy&type=collection
http://localhost:3000/automation-content?portalFrontend=legacy
```

Trigger the existing registry sync control if the list has not populated. Do not
rebuild or republish fixtures to fix an empty list before checking backend logs,
the configured repository list, authentication, and registry availability.

### Check these behaviors

1. **Skills:** open a row. Its description, version, and source should match the
   artifact's `metadata` response. Open the indexed skill and inspect its
   extracted frontmatter.
2. **Collections:** open accounts or network. Check FQCN, release version,
   authors, tags, and dependency metadata where supplied. Different network
   release digests must remain separate artifacts.
3. **EEs:** confirm skills and standalone collection archives do not appear in
   the EE-only list. Existing EE detail links should still work.
4. **Colliding plugin names:** when an EE contains callback and filter entries
   with the same FQCN, both must remain searchable. Selecting one must show that
   category's documentation, not arbitrarily the other category.
5. **Navigation:** switch tabs, open an artifact/item, use breadcrumbs, reload,
   and use browser Back. The frontend-mode selector must survive navigation;
   typed item selections use the page's `itemType` parameter.
6. **Incomplete data:** unknown or partial enumeration must not be presented as
   a confirmed empty artifact.

The archive reader enforces 16 MiB compressed/expanded layer limits, a 1 MiB
metadata-document limit, and conservative normalized-metadata size, depth, and
node limits. YAML aliases and nested compressed archives are rejected. A failed
read for the same immutable artifact can retain last-good items, explicitly
marked partial with cached/stale diagnostics. A new digest must not inherit the
old image's documentation.

Unknown `oci-image` artifacts are retained by the backend but deliberately lack
a standalone browser tab in this spike. Do not expect the older generic demos
to appear as skills or collections merely because of their repository names.

### Inspect network responses

In browser developer tools, check requests under `/api/automation-content`:

- `GET /content?type=skill` or `type=collection` returns correctly typed rows.
- Artifact detail exposes `metadata` and `enumeration`.
- `GET /content-items?in=<encoded-artifact-ref>` returns that artifact's items.
- `GET /content-items/<encoded-fqcn>?in=<encoded-artifact-ref>&type=<item-type>`
  selects an exact item category. Item detail fields are top-level, not nested
  under `detail`.

These endpoints require the normal Portal credentials. Do not disable backend
authentication to make an unauthenticated curl command succeed.

## 4. Check dynamic-plugin packaging

The source development app does not prove a dynamic plugin can deploy. When
testing the RHDH delivery path, run both exports:

```bash
yarn workspace @ansible/plugin-catalog-backend-module-automation-content export-dynamic
yarn workspace @ansible/plugin-automation-content-backend export-dynamic
```

Both outputs must embed the local skill and collection adapter packages. Merely
leaving dependencies on unpublished `@ansible/content-type-ansible-*` npm
packages is not a successful packaging result. These commands generate build
artifacts and may need package type declarations built first; inspect their
exit status rather than assuming export succeeded.

## Team demo script

### State the claim

> One OCI registry can distribute several content types. Portal can select an
> appropriate reader, extract useful metadata, and expose it consistently without
> pretending every artifact is an execution environment.

The claim is a proof of the adapter approach, not support for every OCI format,
Lightspeed compatibility, certification, or production readiness.

### Show one registry, different artifact types

Use a terminal to inspect one real skill manifest:

```bash
curl --fail --silent --show-error --insecure \
  -H 'Accept: application/vnd.oci.image.manifest.v1+json' \
  https://localhost:8445/v2/demo/skills/utopia-backup-validation/manifests/1.0.0 \
  | jq '{artifactType, configMediaType: .config.mediaType,
         layers: [.layers[] | {mediaType, size}], annotations}'
```

The local TLS exception above is only for the self-signed development registry.
Point out the explicit skill artifact type, the real archive layer, and the
publisher annotations. The config is an OCI empty object, not a fake EE image
configuration. The private fixture media type is an experimental convention.

### Show useful reading, not just storage

1. Open the Skills tab and select `utopia-backup-validation`.
2. Show its digest and publisher metadata, then open its indexed skill item.
3. Explain that its name and description came from the package's root `SKILL.md`,
   not from guessing that a repository containing `/skills/` must be a skill.
4. Open Collection artifacts and inspect `utopia.accounts`. Show its FQCN,
   version, authors, and tags from the genuine Galaxy `MANIFEST.json`.
5. Compare the `utopia.network` 1.0.0 and 1.1.0 artifacts. Show distinct digests
   and artifact-scoped metadata; a tag is not the canonical identity.
6. Switch to EEs and confirm that the new content types are not mixed into its
   list. Where the fixture contains callback/filter entries with the same FQCN,
   open each category and inspect the request's `type` selector.
7. Reload a detail link. Its `portalFrontend=legacy`, selected artifact, and
   `itemType` should survive. This demonstrates a usable route, not just a
   screenshot of fixture data.

### Show an honest counterexample

Show the older `demo/skills/cluster-triage` artifact in the backend response or
the live-test report. It remains `oci-image` because it lacks the supported
artifact type, despite its repository name. It is not shown in the Skills tab.

Use the automated security/reliability regressions to demonstrate malformed
archives, oversized metadata, and transient failures. Do not push malicious
packages or stop a shared registry merely to stage the demo. Explain that those
failure paths are tested with controlled inputs, while the live-Zot test uses
actual published packages.

```bash
yarn workspace @ansible/automation-content-common test \
  src/adapters/ArchiveContentTypeAdapter.test.ts \
  src/adapters/metadataBudget.test.ts --watch=false --runInBand

yarn workspace @ansible/content-type-ansible-skill test \
  src/AnsibleSkillAdapter.test.ts --watch=false --runInBand
```

### Close with evidence and the next boundary

Run the live-Zot test from section 1 and show its result. Separately identify
whether dynamic export has passed; a source-app demo alone is not deployment
proof. Say explicitly that process-restart behavior and PostgreSQL have not
been demonstrated by an in-memory SQLite test.

The next architectural step is to agree stable content-type contracts and make
the catalog and content API share normalized inventory behavior. Adding a new
reader should be an extension, not a new registry client or a growing chain of
EE-specific conditionals. That end state is not fully established by this spike.

## Remaining boundaries

- Fixture media types are private research conventions, not standardized
  Ansible formats or proof of Lightspeed/framework compatibility.
- The archive reader supports one tar+gzip layer with root metadata files. It
  does not recursively inspect arbitrary EE layers or execute imported content.
- The Portal content API persists these inventories; the separate catalog
  provider does not yet share all of that enumeration behavior.
- `ContentObject.normalize()` is not yet the single served API contract.
- A passing local-Zot test is not proof of Quay, native ansible-galaxy OCI,
  agent-framework, offline-transfer, or production-scale compatibility.
