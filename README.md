# Ansible Backstage Plugins

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![codecov](https://codecov.io/gh/ansible/ansible-backstage-plugins/graph/badge.svg)](https://codecov.io/gh/ansible/ansible-backstage-plugins)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=ansible_ansible-backstage-plugins&metric=coverage)](https://sonarcloud.io/component_measures?id=ansible_ansible-backstage-plugins&metric=coverage)

This repository contains Automation Portal plugins and shared SDK packages for
Backstage and Red Hat Developer Hub (RHDH): Portal host contracts, self-service
workflows, AAP integrations, and APME quality contributions.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Initial Setup](#initial-setup)
  - [Configuration](#configuration)
  - [Running Locally](#running-locally)
- [Repository Structure](#repository-structure)
- [Available Plugins](#available-plugins)
- [Development](#development)
  - [Testing](#testing)
  - [Building](#building)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Overview

The Ansible Backstage Plugins project brings Ansible Automation Platform capabilities into Backstage, enabling developers to:

- Browse and launch job templates
- Manage inventories, projects, and credentials
- View job execution history and results
- Create self-service automation workflows
- Integrate AAP with software catalogs
- Generate scaffolder actions for AAP resources

Packages are organized into Portal core, self-service, AAP, and APME workspaces.
The source app defaults to native NFS composition. APME demonstrates a third-party
contributor without direct dependencies on self-service page components.

This branch is an experimental SDK implementation. Native composition does not
complete content extraction or establish production compatibility for
every RHDH version. See the [implementation guide](./docs/next/portal-plugin-factory-implementation-guide.md).

## Features

- **Frontend Integration**: Browse resources directly in Backstage UI
- **Self-Service Automation**: Enable developers to trigger automations without AAP knowledge
- **Catalog Integration**: Sync AAP resources into Backstage catalog
- **Scaffolder Actions**: Create software templates that interact with AAP
- **Authentication**: Integrate AAP authentication with Backstage auth
- **RBAC Support**: Leverage AAP's role-based access control
- **Dynamic Plugin Support**: Deploy as dynamic plugins in Red Hat Developer Hub
- **Portal SDK**: Shared frontend/backend contracts with native Blueprint contributions
- **APME Integration**: Quality views, scan actions, and repository registration workflows
- **Configurable Navigation**: Select discovered page links or expandable groups without changing permissions

## Prerequisites

Before setting up the development environment, ensure you have:

### Required Software

- **Node.js**: Version **22** or **24**, matching the root package engines and CI matrix
  - Check version: `node --version`
  - Install via [nvm](https://github.com/nvm-sh/nvm) or from [nodejs.org](https://nodejs.org/)

- **Yarn**: Version **4.12.0** (managed via Corepack, as pinned in `package.json`)
  - Install Corepack if your Node.js distribution does not include it
  - Enable Corepack: `corepack enable`
  - Verify: `yarn --version`

- **Git**: For version control
  - Check version: `git --version`

### System Requirements

- **Operating System**: Linux, macOS, or Windows with WSL2
- **RAM**: Minimum 8GB (16GB recommended for optimal build performance)
- **Disk Space**: At least 2GB free space for dependencies and build artifacts

### Optional But Recommended

- **Ansible Automation Platform**: Access to an AAP instance for full functionality
  - Version 2.4 or later recommended
  - API access token with appropriate permissions

- **GitHub Account**: For GitHub integration features
  - Personal Access Token (PAT) with `repo` scope

## Getting Started

### Initial Setup

1. **Clone the Repository**

```bash
git clone https://github.com/ansible/ansible-backstage-plugins.git
cd ansible-backstage-plugins
```

2. **Install Dependencies**

Enable Corepack and install the root Yarn workspace dependencies:

```bash
corepack enable
yarn install --immutable
```

The root `packageManager` field selects Yarn 4.12.0. Installation resolves all
configured workspaces and runs the root Husky preparation script. Do not install
each plugin separately or ignore dependency/native-build errors.

Alternatively, run `./install-deps`, which will:

- Install all workspace dependencies
- Set up Git hooks via Husky (runs [pre-commit](https://pre-commit.com/) from `.pre-commit-config.yaml`)
- Install the pre-commit CLI and prefetch hook environments (requires Python 3 + pip)

If you use only `yarn install --immutable`, install pre-commit manually:
`pip install pre-commit && pre-commit install-hooks`.

3. **Verify Installation**

Check that installation was successful:

```bash
# Check Node.js version
node --version  # Should show v22.x.x or v24.x.x

# Check Yarn version
yarn --version  # Should show 4.12.0

# Verify workspace structure
yarn workspaces list
```

### Configuration

#### 1. Create Environment File

All secrets are managed via a `.env` file. It is loaded automatically by `yarn start` via `dotenv-cli`.

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

| Variable                    | Required             | Description                                                                        |
| --------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `BACKEND_SECRET`            | No                   | Auto-generated on each `yarn start` if left empty                                  |
| `AUTH_SIGNING_KEY`          | No                   | Auto-generated on each `yarn start` if left empty                                  |
| `GITHUB_INTEGRATION_TOKEN`  | Yes                  | GitHub PAT for SCM integration ([create here](https://github.com/settings/tokens)) |
| `GITLAB_INTEGRATION_TOKEN`  | If using GitLab      | GitLab PAT for SCM integration                                                     |
| `AUTH_GITHUB_CLIENT_ID`     | If using GitHub auth | GitHub OAuth App client ID ([create here](https://github.com/settings/developers)) |
| `AUTH_GITHUB_CLIENT_SECRET` | If using GitHub auth | GitHub OAuth App client secret                                                     |
| `AUTH_GITLAB_CLIENT_ID`     | If using GitLab auth | GitLab OAuth App client ID                                                         |
| `AUTH_GITLAB_CLIENT_SECRET` | If using GitLab auth | GitLab OAuth App client secret                                                     |
| `AAP_HOST`                  | Yes                  | AAP controller URL (e.g. `https://aap.example.com`)                                |
| `AAP_AUTH_CLIENT_ID`        | Yes                  | AAP OAuth client ID                                                                |
| `AAP_AUTH_CLIENT_SECRET`    | Yes                  | AAP OAuth client secret                                                            |
| `AAP_API_TOKEN`             | Yes                  | AAP API token for catalog sync                                                     |

**Note:** `BACKEND_SECRET` and `AUTH_SIGNING_KEY` are auto-generated if left empty. Set them explicitly if you need persistent sessions across restarts.

#### 2. Create Local Configuration File (Optional)

For local overrides (non-secret settings like schedule intervals, enabled features, etc.):

```bash
cp app-config.yaml app-config.local.yaml
```

Edit `app-config.local.yaml` to customize settings for your local environment. This file is gitignored.

### Running Locally

#### Start the Development Server

Make sure you have created a `.env` file (see [Configuration](#configuration) above), then:

```bash
yarn start
```

This will:

- Load environment variables from `.env` via `dotenv-cli`
- Auto-generate `BACKEND_SECRET` and `AUTH_SIGNING_KEY` if not set
- Start the backend on `http://localhost:7007`
- Start the frontend on `http://localhost:3000`
- Enable hot module reloading for development
- Open your browser automatically

#### What to Expect

1. **First Launch**: Wait for frontend compilation and backend initialization
2. **Browser Opens**: Navigate to `http://localhost:3000`
3. **Login**: Use Guest login or configured auth provider
4. **Hot Reload**: Changes to source files automatically reload

#### Startup Logs

Normal startup logs include:

```
[0] info: Loaded config from app-config.yaml, app-config.local.yaml
[0] info: Created database connection
[1] info: Listening on :7007
[0] webpack compiled successfully
```

#### Accessing Different Sections

The source app defaults to the new frontend system (NFS). Its user-facing routes include:

- **Templates**: `http://localhost:3000/self-service` (the default destination of `/` when installed and no landing override is configured)
- **History**: `http://localhost:3000/self-service/create/tasks`
- **Execution Environments**: `http://localhost:3000/self-service/ee`
- **Collections**: `http://localhost:3000/self-service/collections`
- **Git repositories**: `http://localhost:3000/self-service/repositories`
- **Administration/RBAC**: `http://localhost:3000/rbac`, subject to permissions
- **Settings**: `http://localhost:3000/settings`

Sidebar configuration selects installed page extensions; it does not install plugins or
grant permissions. `?portalFrontend=legacy` explicitly selects the legacy app.
The local header retains account/logout controls. RHDH uses its platform header.
The duplicate `/portal/*` pages have been removed. See
[Portal NFS composition](./docs/next/portal-sdk-nfs-composition.md) for integration,
navigation configuration, and verification boundaries. Backend port 7007 is the checked-in
default; local configuration can override it.

## Repository Structure

```
ansible-backstage-plugins/
├── api/                       # OpenAPI spec and testing docs
│   ├── openapi.yaml          # API specification (source of truth)
│   └── README.md             # Swagger UI setup and testing guide
│
├── workspaces/                # Packages grouped by ownership
│   ├── portal-core/
│   │   ├── packages/app/      # Source frontend development harness
│   │   ├── packages/backend/  # Source backend development harness
│   │   └── plugins/           # Portal host, SDK, operations, and health
│   ├── self-service/plugins/  # Templates, tasks, and current content pages
│   ├── aap/plugins/           # AAP clients, authentication, catalog, actions
│   └── apme/plugins/          # Third-party contribution example and backend modules
│
├── docs/                      # Documentation
│   ├── features/             # Feature documentation
│   └── plugins/              # Plugin-specific docs
│
├── examples/                  # Example configurations
│   ├── entities.yaml         # Sample catalog entities
│   ├── org.yaml              # Sample organization structure
│   └── template/             # Sample software template
│
├── app-config.yaml           # Main configuration file
├── app-config.production.yaml # Production configuration
├── package.json              # Root package.json with workspaces
├── tsconfig.json             # TypeScript configuration
└── yarn.lock                 # Dependency lock file
```

## Available Plugins

The packages below include installable plugins/modules and shared libraries.
A library does not create a page or sidebar item merely by being installed.

### Portal core and SDK

- [`@ansible/portal-core`](./docs/plugins/portal-core.md): native frontend host and configurable navigation.
- [`@ansible/portal-extension-api`](./docs/plugins/portal-extension-api.md): frontend Blueprint contracts, API references, and clients.
- [`@ansible/portal-extension-common`](./docs/plugins/portal-extension-common.md): shared manifest, launch, operation, and entitlement contracts.
- [`@ansible/portal-extension-host`](./docs/plugins/portal-extension-host.md): contribution validation, filtering, and rendering.
- [`@ansible/portal-health-backend`](./docs/plugins/portal-health-backend.md): backend health aggregation.
- [`@ansible/portal-operations-backend`](./docs/plugins/portal-operations-backend.md): authorized operations and host entitlement decisions.
- [`@ansible/portal-plugin-node`](./docs/plugins/portal-plugin-node.md): backend services, audit, health, and organization helpers.
- [`@ansible/portal-plugin-sdk`](./docs/plugins/portal-plugin-sdk.md): reusable frontend components, context, cache, notifications, and theme utilities.
- [`@ansible/portal-rhdh`](./docs/plugins/portal-rhdh.md): optional native RHDH adapter for contributed profile-menu items, including AAP Sign out.

### AAP integration

- [`@ansible/backstage-plugin-auth-backend-module-rhaap-provider`](./docs/plugins/auth.md): AAP authentication.
- [`@ansible/plugin-backstage-rhaap`](./docs/plugins/backstage-frontend.md): existing AAP frontend integration.
- [`@ansible/backstage-rhaap-common`](./docs/plugins/backstage-rhaap-common.md): AAP/SCM clients, service contracts, types, and permissions.
- [`@ansible/backstage-plugin-catalog-backend-module-rhaap`](./docs/plugins/catalog.md): AAP resource and content synchronization.
- [`@ansible/backstage-plugin-catalog-backend-module-rhaap-user-provisioner`](./docs/plugins/catalog-user-provisioner.md): on-demand catalog user provisioning.
- [`@ansible/plugin-scaffolder-backend-module-backstage-rhaap`](./docs/plugins/scaffolder.md): AAP scaffolder actions.

### Self-service

- [`@ansible/portal-scaffolder`](./docs/plugins/self-service.md): templates, tasks/history,
  native fields, and current collection/EE/repository pages awaiting content extraction.

### APME integration

- [`@ansible/plugin-backstage-apme`](./docs/plugins/backstage-apme.md): native Quality contributions and repository workflows.
- [`@ansible/backstage-apme-common`](./docs/plugins/backstage-apme-common.md): shared APME types, services, operations, and permissions.
- [`@ansible/backstage-plugin-catalog-backend-module-apme`](./docs/plugins/catalog-apme.md): catalog providers, operation handlers, settings, and synchronization.
- [`@ansible/scaffolder-backend-module-apme`](./docs/plugins/scaffolder-apme.md): repository-registration scaffolder action.

See the [workspace overview](./workspaces/README.md) for source ownership and
the [implementation guide](./docs/next/portal-plugin-factory-implementation-guide.md)
for remaining architecture work.

## Development

### Selecting development contributors

The native source app defaults to the full contributor set. To test optional
composition, set a preset in your uncommitted `app-config.local.yaml`:

```yaml
portal:
  development:
    profile: core
```

`full` includes portal-scaffolder and APME; `scaffolder` omits APME; `core`
omits both. AAP authentication, host services, Administration, and Settings
remain available. Without a configured installed landing page, `/` shows the
neutral Portal fallback. The global header has no Create shortcut. Use the
installed pages and their page-level actions to start workflows. Existing content
browsing pages still belong to portal-scaffolder; removing that contributor also
removes those pages.

These presets are development/test conveniences, not production configuration,
authorization policy, or a list of supported plugins. The explicit legacy
frontend selector retains its existing composition.

To test another frontend plugin without changing the presets:

1. Register its package in the repository's Yarn workspaces. Give it the
   `frontend-plugin` or `frontend-plugin-module` Backstage role and a native
   `./alpha` export. Its package root must be side-effect-free: declare
   `"sideEffects": false` and do not register legacy contributions there.
   Backstage discovery imports both the root and native entry; the declaration
   is an author contract, not a sandbox that prevents arbitrary module code.
2. Add the workspace dependency to the source app:

   ```bash
   yarn workspace app add '@ansible/plugin-example@workspace:^'
   ```

3. Include that package explicitly in your local configuration:

   ```yaml
   portal:
     development:
       profile: core
   app:
     packages:
       include:
         - '@ansible/plugin-example'
   ```

4. Restart `yarn start`. The preflight rejects unknown packages, non-native
   frontend entries, dependencies resolving outside the selected workspace,
   and rediscovery of the preset-managed packages. Use explicit `include`, not
   all-package discovery. A new backend plugin still requires registration in
   the source backend; frontend discovery does not install backend services.

Verify the harness with `yarn test:composition`, `yarn tsc`, and the affected
package's tests/lint. For dynamic frontend/backend exports on local RHDH, use
the `PORTAL_EXTRA_PLUGINS` procedure in automation-portal-local's development
guide. Production RHDH selects installed artifacts through its normal dynamic
plugin configuration, not these source-app presets.

### Testing

#### Run Unit Tests

```bash
# Run all tests once
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:all
```

#### Test Specific Plugin

```bash
# Test a specific plugin
yarn workspace @ansible/plugin-backstage-rhaap test

# Test with coverage
yarn workspace @ansible/plugin-backstage-rhaap test --coverage
```

#### Coverage Requirements

- Maintain >80% code coverage for all plugins
- Coverage reports are generated in `coverage/` directory
- View HTML report: `open coverage/lcov-report/index.html`
- CI publishes plugin-only coverage from all four workspace plugin roots;
  app/backend harness packages are excluded from that filtered report.

#### E2E Tests

End-to-end tests use Playwright and are located in `e2e-tests/`.

```bash
# Install e2e dependencies
cd e2e-tests && yarn install

# Run all e2e tests
yarn pw:test

# Run e2e tests (self-service)
yarn pw:test:self-service

# Run e2e tests (RHDH)
yarn pw:test:rhdh

# View test report
yarn pw:show-report
```

#### Viewing Coverage Reports

- **Codecov**: [codecov.io/gh/ansible/ansible-backstage-plugins](https://codecov.io/gh/ansible/ansible-backstage-plugins)
- **SonarCloud**: [sonarcloud.io/project/overview?id=ansible_ansible-backstage-plugins](https://sonarcloud.io/project/overview?id=ansible_ansible-backstage-plugins)
- **Local HTML Report**: After running `yarn test:all`, open `coverage/lcov-report/index.html`

### Building

#### Build All Packages

```bash
# Type check
yarn tsc

# Build all packages
yarn build:all
```

## Troubleshooting

### Common Issues and Solutions

#### Issue: `yarn install` fails with native package errors

**Solution**: Inspect the failing package's build log and resolve its platform
prerequisites or permissions. Do not suppress an installation failure:

```bash
yarn install --immutable
```

#### Issue: Out of memory during build

**Solution**: Increase Node.js memory:

```bash
export NODE_OPTIONS="--max-old-space-size=16384"
yarn build:all
```

#### Issue: Port 3000 or 7007 already in use

**Solution**: Either stop the conflicting process or use different ports:

```bash
# Inspect the listeners before stopping a confirmed application process
lsof -nP -iTCP:3000 -iTCP:7007 -sTCP:LISTEN

# Or configure different ports in app-config.local.yaml
```

#### Issue: AAP connection fails with SSL errors

**Solution**: For development, disable SSL verification:

```yaml
aap:
  checkSSL: false
```

**For production**, ensure proper SSL certificates are configured.

#### Issue: GitHub integration not working

**Solution**: Verify token has correct scopes:

```bash
# Test token
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user
```

Required scopes: `repo` (private repos) or `public_repo` (public only)

#### Issue: Plugins not loading

**Solution**: Clear build cache and rebuild:

```bash
yarn clean
yarn install
yarn build:all
yarn start
```

#### Issue: TypeScript errors after updating dependencies

**Solution**: Rebuild TypeScript declarations:

```bash
yarn tsc --build --clean
yarn tsc
```

### Getting Help

If you encounter issues:

1. Check existing [GitHub Issues](https://github.com/ansible/ansible-backstage-plugins/issues)
2. Review plugin-specific README files
3. Consult the [Documentation](#documentation)
4. Ask in [GitHub Discussions](https://github.com/ansible/ansible-backstage-plugins/discussions)

## Documentation

### General Documentation

- **[Installation Guide](./docs/installation.md)**: Deployment instructions
- **[Features Overview](./docs/index.md)**: Comprehensive feature documentation
- **[Changelog](./CHANGELOG.md)**: Release notes, breaking changes, and upgrade hints
- **[Portal NFS composition](./docs/next/portal-sdk-nfs-composition.md)**: Native plugin contracts, navigation, and acceptance scope
- **[Portal implementation guide](./docs/next/portal-plugin-factory-implementation-guide.md)**: Current delivery scope and remaining architecture work

### API Reference

- **[OpenAPI Specification](./api/README.md)**: Backend API spec, Swagger UI setup, and testing guide

### Plugin Documentation

Package references are linked in [Available Plugins](#available-plugins).
The documentation site's Plugins tab groups them by Portal core/SDK, AAP,
APME, and Self-service ownership.

### Portal SDK Guides

- [Native NFS composition](./docs/next/portal-sdk-nfs-composition.md)
- [Implementation and remaining architecture](./docs/next/portal-plugin-factory-implementation-guide.md)
- [Content picker contract proposal](./docs/next/portal-content-picker-contract-proposal.md)
- [Design tokens](./docs/next/portal-sdk-design-tokens.md)
- [Quickstart — legacy compatibility example](./docs/next/portal-sdk-quickstart.md)
- [RHDH dynamic plugin deployment](./docs/next/portal-sdk-rhdh-dynamic-plugin.md)

### Building the Documentation

Install the documentation dependencies into an isolated environment, including
the `mkdocs-ansible` theme package, then build from the repository root:

```bash
uv run --no-project --with-requirements .config/requirements.txt mkdocs build --strict
```

If `uv` is unavailable, use a Python virtual environment and install
`.config/requirements.txt` there before running `python -m mkdocs build --strict`.
The Material social-card generator also requires Cairo shared-library discovery;
an installed Python CairoSVG package alone is not sufficient.

### Feature Documentation

- **[External Authentication](./docs/features/external-authentication.md)**
- **[Job Templates](./docs/features/job-templates.md)**
- **[Users, Teams & Organizations](./docs/features/users-teams-organizations.md)**

### Additional Resources

- [Backstage Documentation](https://backstage.io/docs/)

## Changelog

See **[CHANGELOG.md](./CHANGELOG.md)** for version history, **breaking changes** (for example catalog sync route renames), and upgrade guidance for templates and integrations.

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details on:

- Code of Conduct
- Development workflow
- Coding standards
- Pull request process
- Testing requirements

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run `yarn lint:all` and `yarn test:all`
6. Submit a pull request

### Release Process

For information on how releases are managed, see [RELEASE_PROCESS.md](./RELEASE_PROCESS.md).

## Security

For information about reporting security vulnerabilities, see [SECURITY.md](./SECURITY.md).

## License

This project is licensed under the **Apache License 2.0**. See [LICENSE](./LICENSE) for details.

By contributing to this project, you agree that your contributions will be licensed under the Apache License 2.0.

## Project Status

This project is actively maintained by the Ansible team at Red Hat. We appreciate all contributions and feedback from the community!

## Support

- **Issues**: [GitHub Issues](https://github.com/ansible/ansible-backstage-plugins/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ansible/ansible-backstage-plugins/discussions)

---

Made with ❤️ by the Ansible team
