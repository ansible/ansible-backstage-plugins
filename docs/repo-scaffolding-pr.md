# PR: `chore/implement-repo-scaffolding-best-practices`

**Scope:** 8 commits, 30+ files
**Goal:** Align `ansible-backstage-plugins` with Agentic SDLC repo scaffolding best practices: better AI agent context, deterministic enforcement, and contributor onboarding.

---

## Commits

| Commit     | Summary                                                          |
| ---------- | ---------------------------------------------------------------- |
| `fadf4ce1` | Core scaffolding: hooks, ESLint boundaries, docs, onboarding     |
| `4995d764` | AI commit attribution enforcement via `commit-msg` hook          |
| `679ec0e6` | `yarn.lock` after removing `lint-staged`                         |
| `bf67a78b` | `test.yml`: skip yarn-based pre-commit hooks (no `yarn install`) |
| `7bb99c4b` | Prettier formatting for files touched by ESLint `--fix`          |
| `0cf2e03`  | Pin `prettier@3.6.2`; run ESLint before Prettier in hooks        |
| `1cf6f63b` | Format `AAPClient.ts` for pre-commit Prettier 3.6.2              |

---

## 1. Agent context (Tier 1)

### `.cursorrules`: trimmed to pointer (~186 lines removed)

**Change:** Replaced duplicated project guidance with a short pointer to `AGENTS.md`.

**Reasoning:** Best practice 1.2: single source of truth for agent context. Duplicated `.cursorrules` / `AGENTS.md` content drifts over time; agents and humans should read one canonical file.

### `AGENTS.md`: expanded and corrected

**Changes:**

- Fast-feedback lint/type-check commands (single file / package)
- Note that `yarn workspace <pkg> exec <bin>` does not work in Yarn 4 with `nodeLinker: node-modules`
- Pre-commit / Husky workflow documented
- Import boundary enforcement documented
- AI attribution conventions documented

**Reasoning:** Best practice 1.3: agents need copy-paste commands that actually work. Wrong commands (e.g. broken `exec tsc`) waste agent cycles. Documenting architecture boundaries helps agents avoid invalid imports before CI catches them.

---

## 2. Deterministic enforcement (Tier 2)

### `.husky/pre-commit`: delegate to `pre-commit`

**Change:** Replaced `yarn lint-staged` with `pre-commit run --hook-stage pre-commit`.

**Reasoning:** Best practice 2.2: one IDE-agnostic enforcement layer. Husky is only the Git entry point; hook logic lives in `.pre-commit-config.yaml` (same locally and in CI).

### `.pre-commit-config.yaml`: ESLint + commit-msg hooks

**Changes:**

- Added `eslint` local hook → `scripts/pre-commit-lint.sh` (runs **before** Prettier)
- Pin `prettier@3.6.2` in `additional_dependencies` (unpinned `prettier` resolved to latest on CI fresh installs)
- Added `check-commit-attribution` hook (`stages: [commit-msg]`)

**Reasoning:** Centralizes all commit-time checks. ESLint via Backstage CLI handles monorepo package boundaries; attribution hook enforces Red Hat AI commit policy at commit time, not only in CodeRabbit review. ESLint before Prettier ensures `--fix` output is formatted before commit. Pinning Prettier avoids local cache vs CI version drift.

### `scripts/pre-commit-lint.sh` (new)

**Change:** Runs `yarn backstage-cli repo lint --fix`; if e2e files are staged, runs `tsc --noEmit` in `e2e-tests/`.

**Reasoning:** Root `npx eslint` breaks on e2e TypeScript (wrong config/parser). Backstage CLI is monorepo-aware; e2e gets a separate type-check only when relevant files are staged.

### `package.json`: removed `lint-staged`

**Change:** Dropped `lint-staged` script, config block, and devDependency.

**Reasoning:** Avoids two parallel lint paths (lint-staged vs pre-commit). Single source of truth reduces drift and “passes locally, fails in CI” surprises.

### `.config/eslint-architecture.js` (new)

**Change:** Shared ESLint rules for three plugin tiers:

- **Frontend:** no backend imports; no `AAPClient` / `ScmClient` from common barrel
- **Backend:** no frontend plugin imports
- **Common:** no imports from other plugins

**Reasoning:** Best practice 3.3: architectural boundaries should be machine-enforced, not just documented. Matches the dependency flow in `AGENTS.md` and prevents frontend → AAP direct access.

### Plugin `.eslintrc.js` files (6 plugins)

**Change:** Each extends `eslint-architecture.js` with the appropriate profile (`frontend`, `backend`, or `common`).

**Reasoning:** Wires boundary rules into each package’s existing Backstage ESLint factory config.

### Prettier formatting fixes (plugin source files)

**Files:** `GitlabClient.ts`, `helpers.ts`, `prepareForPublish.ts`, `EEDetailsPage.tsx`, `useLatestCIActivity.ts`, `AAPResourcePicker.tsx`, `CollectionsPickerExtension.tsx`, `AAPClient.ts`

**Reasoning:** ESLint `--fix` and Prettier disagree on some constructs (e.g. `extends Pick<>` layout). Files were formatted to match pre-commit Prettier 3.6.2 so `test.yml` passes on fresh CI installs.

### `.github/workflows/test.yml`: skip yarn-based hooks

**Change:** `SKIP=eslint,openapi-lint,openapi-drift` because this job has no `yarn install`. Yarn-based checks run in `pr.yml` instead.

**Reasoning:** Avoid false failures when hooks invoke `yarn` without node_modules. Prettier/gitleaks/file checks still run here.

---

## 3. Onboarding (Tier 2)

### `install-deps`: install pre-commit CLI

**Change:** After `yarn install`, runs `python3 -m pip install pre-commit` and `pre-commit install-hooks` (with fallback via `python3 -m pre_commit`).

**Reasoning:** Closes onboarding gap. Contributors previously had to manually `pip install pre-commit` or commits would fail at the Husky hook. Prefetching hook envs speeds up the first commit.

### `.config/requirements.txt`: added `pre-commit`

**Change:** One-line addition at top of requirements file.

**Reasoning:** Aligns Python dev deps with what CI/docs expect; available for docs tooling installs.

### `README.md`, `CONTRIBUTING.md`, `docs/installation.md`

**Changes:**

- Document that `install-deps` installs pre-commit
- Manual fallback if Python/pip unavailable
- AI attribution patterns (`Assisted-by` / `Generated by`, no email required)

**Reasoning:** Onboarding docs should match actual setup flow. Contributors shouldn’t discover missing `pre-commit` only at first `git commit`.

---

## 4. AI commit attribution (Tier 2 + policy)

### `scripts/check-commit-attribution.sh` (new)

**Change:** `commit-msg` validation that **rejects** `Co-authored-by:` lines naming AI tools/bots (Cursor, Claude, Copilot, `[bot]`, etc.). **Allows** human co-authors and accepted patterns:

```
Assisted-by: <name of code assistant>
Generated by <name of code assistant>
```

**Reasoning:** Red Hat policy and Linux kernel precedent: AI tools must not use `Co-authored-by`. Enforcement at commit time is stronger than CodeRabbit warnings alone. Human pair-programming co-authors remain valid.

### `.husky/commit-msg` (new)

**Change:** Runs `pre-commit run check-commit-attribution --hook-stage commit-msg --commit-msg-filename "$1"`.

**Reasoning:** Husky triggers validation; only the attribution hook runs (not Prettier on `.git/COMMIT_EDITMSG`, which caused failures when all hooks ran on commit-msg stage).

### `.coderabbit.yaml`: `ai-attribution` instruction update

**Change:** Clarified accepted patterns: `"Assisted-by: <tool>"` or `"Generated by <tool>"` (no email required).

**Reasoning:** Keeps automated PR review aligned with local hook policy and contributor docs.

---

## 5. Summary by file

| File                                  | What changed                                  | Why                                 |
| ------------------------------------- | --------------------------------------------- | ----------------------------------- |
| `.config/eslint-architecture.js`      | New boundary rules                            | Enforce plugin dependency graph     |
| `.config/requirements.txt`            | +`pre-commit`                                 | Dev dependency parity               |
| `.cursorrules`                        | Pointer to AGENTS.md                          | Eliminate context drift             |
| `.husky/pre-commit`                   | → `pre-commit run`                            | Single hook source                  |
| `.husky/commit-msg`                   | New attribution check                         | Block AI `Co-authored-by` at commit |
| `.pre-commit-config.yaml`             | ESLint + attribution hooks; pin Prettier      | Centralized enforcement + CI parity |
| `AGENTS.md`                           | Fast feedback, hooks, boundaries, attribution | Agent + contributor guidance        |
| `CONTRIBUTING.md`                     | Onboarding + attribution docs                 | Contributor onboarding              |
| `README.md`                           | `install-deps` includes pre-commit            | Onboarding accuracy                 |
| `docs/installation.md`                | Brief install-deps note                       | Local dev docs                      |
| `install-deps`                        | pip install pre-commit + install-hooks        | One-step setup                      |
| `package.json`                        | Remove lint-staged                            | De-duplicate lint path              |
| `scripts/pre-commit-lint.sh`          | Monorepo-aware lint                           | Correct pre-commit ESLint           |
| `scripts/check-commit-attribution.sh` | AI co-author blocker                          | Policy enforcement                  |
| `plugins/*/.eslintrc.js` (×6)         | Extend architecture rules                     | Per-package enforcement             |
| 8 plugin source files                 | Prettier formatting only                      | Match pre-commit Prettier on CI     |
| `.github/workflows/test.yml`          | Skip yarn hooks in pre-commit job             | No yarn install in that job         |
| `.coderabbit.yaml`                    | Attribution wording                           | PR review alignment                 |

---

## 6. What this PR does **not** change

- Application/plugin features or runtime behavior
- `pre-push` hook for protected-branch pushes
- Full `.coderabbit.yaml` prodsec template (that landed separately in `109e90b5` on this branch)
- Design-intent docs (`docs/design/`), suggested future improvement
- Aligning `yarn prettier:check` (Prettier 2.x in `package.json`) with pre-commit Prettier 3.6.2 (possible follow-up)

---

## 7. How to verify

```bash
./install-deps                                    # installs pre-commit + hooks
pre-commit run --all-files                        # full hook suite (uses local cache)
# Match test.yml (fresh Prettier env, no yarn hooks):
pre-commit clean
SKIP=eslint,openapi-lint,openapi-drift pre-commit run --all-files
git commit --allow-empty -m "test

Co-authored-by: Cursor"                            # should fail
git commit --allow-empty -m "test

Assisted-by: Composer"                             # should pass
yarn lint:all                                       # ESLint boundaries active
```

**Local vs CI:** `test.yml` installs a fresh pre-commit environment every run. Stale `~/.cache/pre-commit` can hide Prettier drift. Use `pre-commit clean` or `PRE_COMMIT_HOME=/tmp/pc-ci-sim` before pushing if the CI prettier hook fails locally with `--all-files`.

---

## Net effect

The repo is better structured for AI-assisted development: one agent context file, enforced architectural boundaries, unified pre-commit enforcement, smoother onboarding, and deterministic AI attribution policy at commit time.
