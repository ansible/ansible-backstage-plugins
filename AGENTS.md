# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## Project Overview

Ansible plugins for Red Hat Developer Hub (RHDH) / Backstage. A monorepo of plugins that integrate Ansible Automation Platform (AAP) capabilities into the Backstage developer portal — catalog browsing, job template launching, self-service automation, and scaffolder actions.

## Development Commands

### Setup

```bash
./install-deps          # Install all dependencies (run first)
```

### Build & Run

```bash
yarn start              # Start dev server (frontend :3000, backend :7007)
yarn build              # TypeScript compile + build all packages
yarn build:all          # Build all packages via backstage-cli
yarn build:backend      # Build backend only
```

### Testing

```bash
yarn test                                              # Run all tests (no watch)
yarn test:watch                                        # Run tests in watch mode
yarn test:all                                          # Run all tests with coverage
yarn workspace @ansible/plugin-backstage-rhaap test    # Test a single plugin
yarn test:e2e                                          # Run Playwright e2e tests
```

### Code Quality

```bash
yarn lint               # Lint changes since origin/main
yarn lint:all           # Lint everything
yarn tsc                # TypeScript type check
yarn tsc:full           # Full TypeScript check (no skipLibCheck)
yarn fix                # Auto-fix lint issues
yarn prettier:check     # Check formatting
```

## Architecture

### Plugin Map

| Directory                                           | Package Name                                                   | Role                                                                | Type            |
| --------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | --------------- |
| `plugins/backstage-rhaap-common`                    | `@ansible/backstage-rhaap-common`                              | Shared AAP client, types, interfaces, permissions                   | Common library  |
| `plugins/backstage-rhaap`                           | `@ansible/plugin-backstage-rhaap`                              | Ansible sidebar & frontend pages                                    | Frontend plugin |
| `plugins/self-service`                              | `@ansible/plugin-backstage-self-service`                       | Self-service UI (job templates, EE builder, collections, git repos) | Frontend plugin |
| `plugins/catalog-backend-module-rhaap`              | `@ansible/backstage-plugin-catalog-backend-module-rhaap`       | Entity providers that sync AAP resources into catalog               | Backend module  |
| `plugins/scaffolder-backend-module-backstage-rhaap` | `@ansible/plugin-scaffolder-backend-module-backstage-rhaap`    | Custom scaffolder actions for AAP                                   | Backend module  |
| `plugins/auth-backend-module-rhaap-provider`        | `@ansible/backstage-plugin-auth-backend-module-rhaap-provider` | AAP OAuth authentication                                            | Backend module  |

### Core Service Pattern

The `ansibleServiceRef` (in `backstage-rhaap-common/src/AAPService/`) is a Backstage service reference that provides `IAAPService` — an interface for the `AAPClient`. Backend modules depend on this service ref to interact with AAP. The `AAPClient` (in `backstage-rhaap-common/src/AAPClient/AAPClient.ts`) handles all HTTP communication with AAP (job templates, projects, inventories, organizations, users, execution environments, collections).

### Dependency Flow

```text
backstage-rhaap-common (shared: AAPClient, types, permissions)
    ├── catalog-backend-module-rhaap (uses ansibleServiceRef)
    ├── scaffolder-backend-module-backstage-rhaap (uses ansibleServiceRef)
    └── auth-backend-module-rhaap-provider (uses AAPClient directly)

Frontend plugins (backstage-rhaap, self-service) communicate with backend
via Backstage proxy/API routes, not directly with AAP.
```

### Backend Module Registration

Backend modules follow the Backstage `createBackendModule` pattern and are registered in `packages/backend/src/index.ts` via `backend.add(import(...))`. Each module uses `reg.registerInit()` with dependency injection for logger, config, scheduler, etc.

### Catalog Entity Providers

The catalog module (`catalog-backend-module-rhaap`) registers multiple entity providers in `module.ts`:

- **AAPEntityProvider** — syncs AAP organizations, teams, users
- **AAPJobTemplateProvider** — syncs job templates as catalog entities
- **EEEntityProvider** — syncs execution environments
- **PAHCollectionProvider** — syncs Private Automation Hub collections
- **AnsibleGitContentsProvider** — syncs git-based Ansible content

Providers use `fromConfig()` static factory methods and run on a scheduler.

### Scaffolder Actions

Located in `scaffolder-backend-module-backstage-rhaap/src/actions/`. Each action is a separate file:

- `ansible.ts` — main scaffolder action
- `aapCreateProject.ts`, `aapCreateJobTemplate.ts`, `aapLaunchJobTemplate.ts`, `aapCreateEEEnv.ts`, `aapCleanUp.ts` — AAP resource management
- `ansibleContentCreate.ts` — Ansible content creation
- `createEEDefinition.ts` — EE definition generation
- `prepareForPublish.ts` — pre-publish preparation

Also includes custom scaffolder field extensions in the self-service plugin under `src/components/Scaffolder/` (AAPTokenField, AAResourcePicker, CollectionsPicker, etc.).

### Permissions (RBAC)

Permissions are defined in `backstage-rhaap-common/src/permissions.ts`:

- `ansible.execution-environments.view`
- `ansible.git-repositories.view`
- `ansible.collections.view`

Registered via `permissionsRegistry.addPermissions()` in the catalog module. Frontend sidebar items use conditional rendering based on these permissions.

### Frontend Plugin Structure

- **backstage-rhaap**: Registers the `ansible` plugin with `createPlugin`, provides `AnsiblePage` routable extension at `/ansible`
- **self-service**: Registers the `self-service` plugin, provides multiple routable extensions (`SelfServicePage`, `EEPage`, `CollectionsPage`, `GitRepositoriesPage`) and permission-gated sidebar items

### Configuration

- `app-config.yaml` — main config (AAP connection under `aap:` key with `baseUrl`, `token`, `checkSSL`)
- `app-config.local.yaml` — local overrides (gitignored)
- `app-config.production.yaml` — production config
- Plugin config schemas defined in `config.d.ts` files within each plugin

### Dynamic Plugin Support

Plugins support deployment as dynamic plugins in RHDH. Each plugin has a `dist-dynamic/` build and `export-dynamic` script. Dynamic entry points are in `src/dynamic/index.ts`.

## Key Conventions

- Node.js 20 or 22, Yarn 4 (via Corepack), TypeScript ~5.8, Backstage ^0.33.1
- Tests co-located with source files (`.test.ts` / `.test.tsx`), mock data in `mock/` directories
- Uses `msw` for API mocking in tests, `supertest` for backend route testing
- Pre-commit hooks via Husky: ESLint + Prettier on staged files
- Workspace references use `workspace:^` in package.json

## Guidelines for AI Agents

- When working with any external library, look up the latest syntax and usage rather than relying on potentially outdated training data. Do not skip or replace a library because of errors — diagnose the root cause first. This applies doubly when the user has explicitly asked to use a specific library; if they wanted a different library they would have asked for one.
- Always run linting after making major changes to catch syntax errors, incorrect method usage, or corrupted files.
- Organise code into separate files wherever appropriate. Follow best practices for variable naming, modularity, function complexity, file sizes, and commenting.
- Optimise code for readability — code is read more often than it is written.
- Never produce "dummy" or placeholder implementations. Implement the actual functionality.
- When starting a new task, first understand the current architecture, identify files to modify, and formulate a plan. Think through architectural aspects, edge cases, and the best approach. Get the plan approved before writing code.
- Ask clarifying questions rather than making incorrect assumptions about requirements.
- Do not carry out large refactors unless explicitly instructed to do so.
- If encountering repeated issues, investigate the root cause instead of trying random fixes or switching libraries.
- When doing UI & UX work, ensure designs are aesthetically pleasing, easy to use, and follow UI/UX best practices. Pay attention to interaction patterns and micro-interactions.
- When a task is very large in scope or too vague, break it down into smaller subtasks first. If that still leaves too many open questions, ask the user to help scope the work.
