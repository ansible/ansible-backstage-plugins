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

`sdk-package-validation.yml` runs on relevant pull requests, pushes to `main`,
and manual dispatches with Node 22 and 24. Shared build steps live in
`sdk-package-validation-run.yml`. Checkout does not persist Git credentials.

PR runs and manual runs on other branches have read-only repository permissions.
They generate SBOMs and upload diagnostics, but do not receive signing credentials
or upload candidate archives. Pushes and manual runs on `main` additionally receive
OIDC and attestation permissions. Those trusted runs sign provenance with GitHub's
Sigstore-backed `actions/attest` before uploading archives, SBOMs, the report, and
the signature bundle. A failed scan or attestation prevents candidate upload.
No npm publishing credentials are required and no packages are published.

Each archive gets an SPDX 2.3 SBOM from pinned Syft `1.57.1`, scanning its safely
unpacked contents with the JavaScript package cataloger enabled. Archive hashes
must still match the validation report. The SBOM must identify the expected npm
package and version, not just the scanned directory. `sboms/index.json` maps each
archive digest to its SBOM digest. Provenance covers every archive, SBOM, index,
and report as signed subjects, recording the GitHub build origin.

After downloading a trusted run's candidates, verify an archive against the
included bundle using the GitHub CLI:

```bash
gh attestation verify artifacts/portal-extension-api.tgz \
  --bundle attestations/provenance.sigstore.json \
  --repo ansible/ansible-backstage-plugins \
  --signer-workflow ansible/ansible-backstage-plugins/.github/workflows/sdk-package-validation-run.yml \
  --cert-identity https://github.com/ansible/ansible-backstage-plugins/.github/workflows/sdk-package-validation-run.yml@refs/heads/main
```

For local SBOM checks, install the pinned Syft version, then use the directory
printed by the completed validation command:

```bash
SDK_VALIDATION_DIR=/path/to/validation-output \
  node scripts/sdk-package-validation/sbom.mjs
```

These SBOMs inventory the delivered archive contents. They do not claim to include
all external dependencies that a consumer may subsequently install. The consumer
lockfile remains separate evidence, and dependency/security review is still
required. The workflow does not validate dynamic federation assets or deploy RHDH.

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
node --test scripts/sdk-package-validation/validate-archive.test.mjs scripts/sdk-package-validation/sbom.test.mjs
```
