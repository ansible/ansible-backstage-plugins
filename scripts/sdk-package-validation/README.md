# SDK package validation

Run from the repository root after installing dependencies:

```bash
yarn validate:sdk-packages
```

The command emits declarations, builds and packs the ten candidates listed in
`packages.json`, validates their archive metadata and contents, and installs them
into a fresh temporary consumer outside the checkout. It never publishes packages.
Candidate manifests must retain `private: true` during this preparation stage.
The allowlist records validation candidates, not approval to publish them.

The consumer compiles a frontend contribution, backend contribution, host imports,
and the auth factories. It bundles the frontend entries, checks that packages and
bundle inputs resolve within the isolated consumer, verifies internal dependency
ranges, and exercises backend health reporting and backend feature imports.
Internal dependencies use local tarball resolutions because the packages are not
published yet. This does not test registry availability or publication order.

## Output

The command prints the temporary directory containing archives, per-step logs,
the standalone consumer, its generated lockfile, and a success report with artifact
hashes and the source revision. A local report also records tracked uncommitted
changes. Untracked source files can also affect builds, so release checks must run
from a clean, reviewed checkout.

Set `SDK_VALIDATION_DIR` to a fresh directory outside the repository to choose the
output location. Existing consumer directories are rejected to prevent stale
installs from masking a failure. Failed commands retain their logs for diagnosis.
Remove the temporary output when it is no longer needed.

## CI

`sdk-package-validation.yml` runs on relevant pull requests and manual dispatches
with Node 22 and 24. It has read-only repository permissions and does not request
publishing credentials. Archives, logs, the consumer lockfile, and the report are
retained as short-lived workflow artifacts. The workflow does not validate dynamic
plugin federation assets or deploy RHDH.

## Scope and limitations

- Archive checks cover entry points, declarations, conditional exports, config
  schemas, repository licenses, internal dependency scope, local dependency
  protocols, and unintended configuration or dependency files.
- These checks are not vulnerability scans, secret-content scans, a third-party
  license review, or security approval.
- External fixture dependencies are explicitly pinned. Their transitive graph is
  resolved independently on each run, with its generated lockfile retained for
  diagnosis. Update the fixture when changing the supported platform baseline.
  Review installation warnings, including the existing Material UI 4 peer warnings
  with React 18; a successful install does not settle compatibility policy.
- Consumer dependency install scripts are disabled. Native database builds are
  not exercised. TypeScript uses `skipLibCheck`, so this checks consumer use of
  declarations rather than all third-party declarations.
- Live discovery, shared API identity between dynamic plugins, authorization,
  operations execution, and OAuth login/logout need separate host validation.

Test the archive rejection rules without building packages:

```bash
node --test scripts/sdk-package-validation/validate-archive.test.mjs
```
