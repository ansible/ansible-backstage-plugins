# AAP-101659: opt-in stock entity-page proof

This draft tests whether Portal can contribute repository content into the stock
Backstage Catalog entity page instead of owning another complete details page.
It is an engineering spike, not a replacement approved for release.

## What changes

- Backstage continues to own `/catalog/:namespace/:kind/:name`, its entity
  loading, header, favourite control, tabs and overview layout.
- Four disabled-by-default contributions add the existing Portal README card,
  repository About card, repository-scoped CI Activity and Collections content.
- Each contribution is filtered to `Component` entities with type
  `git-repository`. Domain content retains `gitRepositoriesViewPermission`.
- `/self-service/repositories/:repositoryName` is unchanged. A comparison button
  opens that existing page for the same repository.

This branch is based on upstream main, not Rakesh's PR branch. His PR #2 remains
available separately at <https://github.com/rockygeekz/ansible-backstage-plugins/pull/2>.
No auth-provider, runtime-container, dependency-version or production-default
configuration changes are included.

## Test in the repository's local Backstage app

1. Check out this PR branch in a separate checkout if your own branch has work
   in progress. Run `./install-deps` when dependencies are not installed.
2. Keep your own gitignored `app-config.local.yaml` and credentials. Under its
   existing `app.extensions` array, append the entries below. Do not replace
   other extension overrides already required by your app.

   ```yaml
   app:
     extensions:
       - entity-card:portal-scaffolder/repository-proof-readme: true
       - entity-card:portal-scaffolder/repository-proof-info: true
       - entity-content:portal-scaffolder/repository-proof-ci: true
       - entity-content:portal-scaffolder/repository-proof-collections: true
   ```

3. Use the default native frontend. `portal.development.profile` must be `full`
   or `scaffolder`, not `core`. Do not use `?portalFrontend=legacy`: that shell
   does not consume these native extension definitions.
4. Run `yarn start` and open <http://localhost:3000>. Sign in with your normal
   configured identity. A provider connection in Settings alone is not proof
   that the app has an authenticated Backstage identity.
5. Open an actual repository entity at
   `/catalog/<namespace>/component/<entity-metadata-name>`. Use the catalog
   entity name, not its display title or the GitHub owner/repo string. The
   repository must already exist in the catalog; this PR does not seed data.
6. Compare Overview with the existing Portal page using the comparison button.
   Open CI Activity and Collections, refresh their URLs and use browser history.
   README, runs and collections must belong to that repository. Verify a second
   repository, an empty result, a failed source request, and a user without the
   repository permission.
7. Remove the four overrides to disable the proof. The original Portal route
   remains the normal destination throughout this experiment.

## Deliberate limitations and decision points

- APME tabs/cards/actions and legacy Portal contributions are **not bridged**.
  They continue to belong to the existing page. This proof cannot establish
  full replacement feasibility until that integration is demonstrated.
- The stock header and ellipsis actions menu differ from the wireframe's
  breadcrumb and labelled Actions button. This PR adds no custom header/menu
  override. Stock About and the repository-specific About card can both appear;
  agreement on their final field selection and ordering is pending.
- Existing Portal domain components may use MUI and existing styling. Reusing a
  stock host is distinct from converting all of its contributed content to BUI.
- The README mount reuses the authenticated SCM backend helper and raw-URL
  fallback strategy. It does not refactor the current page's existing loader;
  consolidation is a follow-up if this mount is adopted.
- No screenshot parity, production acceptance, successful local browser run or
  RHDH runtime acceptance is claimed. RHDH identity/setup issues prevented the
  previous runtime attempt. Validate exported dynamic plugins in the agreed
  target RHDH version after that harness is working.

## Checks

```sh
yarn workspace @ansible/portal-scaffolder test src/proof/StockRepositoryContent.test.tsx --watch=false --runInBand
npx tsc --noEmit -p workspaces/content-development/plugins/portal-scaffolder
npx eslint workspaces/content-development/plugins/portal-scaffolder/src/proof workspaces/content-development/plugins/portal-scaffolder/src/alpha.tsx
```

The focused tests cover backend README selection, permission-denied mounting,
entity-scoped CI and cancellation of a stale README response. They do not
replace local-app or RHDH integration checks.
