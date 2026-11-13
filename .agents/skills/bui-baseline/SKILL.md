---
name: bui-baseline
description: >-
  Regenerate and interpret bui-baseline.yaml, the frozen inventory of pre-BUI
  UI usage in ansible-backstage-plugins. Use when the BUI drift check reports
  unlisted usage, after removing non-BUI code, or when a maintainer approves a
  new pre-BUI exception.
user-invocable: true
---

# BUI baseline

`bui-baseline.yaml` is the grandfather list for the portal's move to
`@backstage/ui`. It records the MUI (v4 and v5), PatternFly and legacy
Backstage components that existed before BUI, so that CI can tell old code
from new drift. The file is generated from source - never hand-edit it.

**Policy: the file may shrink, never grow.** An entry that is already listed
is accepted. An entry that is not listed is drift. Growing the file is how a
drift gets accepted, so growth always needs a maintainer's explicit approval
in the pull request.

## Commands

Run from the repository root:

```bash
yarn bui:baseline                 # regenerate bui-baseline.yaml
node scripts/generate-bui-baseline.mjs --check   # is the file current?
yarn bui:drift                    # advisory drift report for this checkout
yarn test:bui-baseline           # unit tests for the parser and scanner
```

`bui:drift` reads `origin/main` for the comparison by default; pass
`--base <ref>` for anything else, `--format json` for machine output, or
`--format github` for workflow annotations. It exits 0 unless `--strict`.

## When to regenerate

- **After deleting non-BUI code.** Regeneration shrinks the file. Commit it.
- **When a pull request reports unlisted usage** and the code is being
  converted to `@backstage/ui`. Regenerate after the conversion, not before.
- **Never to silence the check** for new non-BUI code without maintainer
  approval recorded on the pull request.

## Reading the report

Two independent signals, and they mean different things:

- _Non-BUI usage not in the baseline_ - the working tree uses a kit or ships
  a component the committed file does not list. Convert it, or escalate.
- _Baseline growth vs the base branch_ - the file itself gained entries.
  Either someone regenerated to accept drift, or a merge went wrong.

Shrinkage is always fine.

## Adding a real exception

If new non-BUI code is genuinely required (a kit gap, an upstream constraint):

1. Get a maintainer to approve it on the pull request.
2. Run `yarn bui:baseline` and commit the resulting growth.
3. Say why in the pull request description - the file records that the entry
   is pre-BUI-era, not why this particular one was approved today.

## Scope

Tracked: imports of `@backstage/core-components`, `@material-ui/*`, `@mui/*`
(including `@mui/x-*`), `@patternfly/react-*`, `@emotion/*` and
`styled-components` in `.ts`/`.tsx` under `workspaces/**/src`, matched by
package prefix so new packages in those families are caught on first use.
Static, side-effect (`import 'x'`), dynamic `import()` and `require()` forms
all count, as do the components those files export. Not tracked yet: raw HTML
elements and standalone CSS files (#1041).
