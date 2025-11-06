# Ansible Backstage Plugins

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Welcome to the Ansible plugins for Backstage project! This repository provides plugins for [backstage.io](https://backstage.io) to deliver Ansible-specific user experiences in the developer portal, enabling self-service automation and integration with Ansible Automation Platform (AAP).

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
  - [Plugin Development](#plugin-development)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
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

This is a monorepo containing multiple plugins that work together to provide a comprehensive Ansible experience in Backstage.

## Features

- **Frontend Integration**: Browse resources directly in Backstage UI
- **Self-Service Automation**: Enable developers to trigger automations without AAP knowledge
- **Catalog Integration**: Sync AAP resources into Backstage catalog
- **Scaffolder Actions**: Create software templates that interact with AAP
- **Authentication**: Integrate AAP authentication with Backstage auth
- **RBAC Support**: Leverage AAP's role-based access control
- **Dynamic Plugin Support**: Deploy as dynamic plugins in Red Hat Developer Hub

## Prerequisites

Before setting up the development environment, ensure you have:

### Required Software

- **Node.js**: Version **20** or **22** (LTS versions)
  - Check version: `node --version`
  - Install via [nvm](https://github.com/nvm-sh/nvm) or from [nodejs.org](https://nodejs.org/)

- **Yarn**: Version **4.9.2** (managed via Corepack)
  - Corepack is included with Node.js 16.10+
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

Run the installation script to set up all dependencies:

```bash
./install-deps
```

This script will:

- Install Yarn 4.x via Corepack
- Install all workspace dependencies
- Set up Git hooks via Husky for pre-commit checks

**Note**: On systems with strict security policies, some native package builds may fail. This is usually acceptable as they're often optional dependencies.

3. **Verify Installation**

Check that installation was successful:

```bash
# Check Node.js version
node --version  # Should show v20.x.x or v22.x.x

# Check Yarn version
yarn --version  # Should show 4.9.1 or similar

# Verify workspace structure
yarn workspaces list
```

### Configuration

#### 1. Create Local Configuration File

For local development, create a local configuration file that won't be committed:

```bash
cp app-config.yaml app-config.local.yaml
```

#### 2. Configure Required Settings

Edit `app-config.local.yaml` and update the following fields marked as `changeme`:

##### Backend Secret (Required)

```yaml
backend:
  auth:
    keys:
      # Generate a secret with: openssl rand -base64 32
      - secret: YOUR_SECRET_HERE
```

##### GitHub Integration (Required)

```yaml
integrations:
  github:
    - host: github.com
      # Create a token at: https://github.com/settings/tokens
      # Required scopes: repo (for private repos) or public_repo (for public only)
      token: ${GITHUB_TOKEN} # Or paste token directly
```

##### AAP Integration (Optional but Recommended)

```yaml
aap:
  # Your Ansible Automation Platform instance URL
  baseUrl: https://your-aap-instance.example.com

  # AAP API token
  # Create at: AAP UI → Users → Tokens → Add
  token: ${AAP_TOKEN} # Or paste token directly

  # SSL verification (set to true in production)
  checkSSL: false
```

#### 3. Set Environment Variables (Alternative)

Instead of editing the config file, you can set environment variables:

```bash
# Create a .env file (this file is gitignored)
cat > .env << EOF
# Backend
BACKEND_SECRET=$(openssl rand -base64 32)

# GitHub Integration
GITHUB_TOKEN=ghp_your_token_here

# AAP Integration
AAP_BASE_URL=https://your-aap-instance.example.com
AAP_TOKEN=your-aap-token-here
AAP_CHECK_SSL=false

# Auth (for production)
AUTH_SIGNING_KEY=$(openssl rand -base64 32)
EOF
```

#### 4. Additional Configuration Options

<details>
<summary><b>Authentication Providers</b></summary>

```yaml
auth:
  environment: development # Set to 'production' for production
  providers:
    github:
      development:
        clientId: ${AUTH_GITHUB_CLIENT_ID}
        clientSecret: ${AUTH_GITHUB_CLIENT_SECRET}
```

</details>

### Running Locally

#### Start the Development Server

```bash
yarn start
```

This will:

- Start the backend on `http://localhost:7007`
- Start the frontend on `http://localhost:3000`
- Enable hot module reloading for development
- Open your browser automatically

#### What to Expect

1. **First Launch**: Initial compilation takes 2-3 minutes
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

- **Home**: `http://localhost:3000`
- **Catalog**: `http://localhost:3000/catalog`
- **Ansible Plugin**: `http://localhost:3000/ansible`
- **Ansible Self-service Plugin**: `http://localhost:3000/self-service` (AAP Related)
- **API Docs**: `http://localhost:7007/api/docs`

## Repository Structure

```
ansible-backstage-plugins/
├── packages/                  # Core Backstage application
│   ├── app/                  # Frontend React application
│   └── backend/              # Backend Node.js service
│
├── plugins/                   # Ansible-specific plugins
│   ├── backstage-rhaap/                    # Provides access to the frontend plugin
│   ├── backstage-rhaap-common/             # Shared utilities and types
│   ├── auth-backend-module-rhaap-provider/ # Authentication provider
│   ├── catalog-backend-module-rhaap/       # Catalog integration
│   ├── scaffolder-backend-module-backstage-rhaap/ # Scaffolder actions
│   └── self-service/                       # Self-service UI plugin
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

### Frontend Plugins

#### [@ansible/plugin-backstage-rhaap](./plugins/backstage-rhaap)

Enables the Ansible sidebar option and provides access to the frontend plugin

**Features**:

- Ansible specific UI
- Allows to view ansible specific catalog information
- Allows to view and run ansible specific software templates
- Ansible related learning paths.

#### [@ansible/plugin-self-service](./plugins/self-service)

Self-service UI plugin for simplified automation access.

**Features**:

- Simplified job template interface
- Role-based view filtering
- Quick launch capabilities

### Backend Plugins

#### [@ansible/auth-backend-module-rhaap-provider](./plugins/auth-backend-module-rhaap-provider)

Authentication provider for integrating AAP authentication with Backstage.

#### [@ansible/catalog-backend-module-rhaap](./plugins/catalog-backend-module-rhaap)

Catalog provider that syncs AAP resources into the Backstage catalog.

**Syncs**:

- Organizations
- Teams
- Users
- Projects
- Inventories

#### [@ansible/scaffolder-backend-module-backstage-rhaap](./plugins/scaffolder-backend-module-backstage-rhaap)

Scaffolder actions for creating software templates that interact with AAP.

**Actions**:

- Launch job templates
- Create projects
- Manage inventories
- Configure credentials

### Shared Packages

#### [@ansible/plugin-backstage-rhaap-common](./plugins/backstage-rhaap-common)

Shared utilities, types, and API clients used across all plugins.

## Development

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

**Solution**: Some native packages (like `esbuild`) may fail in restricted environments. This is usually acceptable:

```bash
yarn install --immutable || echo "Some optional dependencies failed, continuing..."
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
# Find process using port
lsof -ti:3000 | xargs kill -9  # macOS/Linux

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

### Plugin Documentation

- **[Frontend Plugin](./docs/plugins/backstage-frontend.md)**: AAP frontend integration
- **[Self-Service Plugin](./docs/plugins/self-service.md)**: Simplified automation UI
- **[Auth Provider](./docs/plugins/auth.md)**: AAP authentication
- **[Catalog Module](./docs/plugins/catalog.md)**: Catalog integration
- **[Scaffolder Module](./docs/plugins/scaffolder.md)**: Scaffolder actions

### Feature Documentation

- **[External Authentication](./docs/features/external-authentication.md)**
- **[Job Templates](./docs/features/job-templates.md)**
- **[Users, Teams & Organizations](./docs/features/users-teams-organizations.md)**

### Additional Resources

- [Backstage Documentation](https://backstage.io/docs/)

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
