# Contributing to Ansible Backstage Plugins

Thank you for your interest in contributing to the Ansible Backstage Plugins project! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Environment Setup](#development-environment-setup)
- [Development Workflow](#development-workflow)
- [Code Style and Standards](#code-style-and-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Plugin Development Guidelines](#plugin-development-guidelines)
- [Documentation](#documentation)
- [Release Process](#release-process)
- [Community and Communication](#community-and-communication)
- [Security](#security)
- [License](#license)

## Code of Conduct

This project adheres to the [Ansible Community Code of Conduct](https://docs.ansible.com/ansible/latest/community/code_of_conduct.html). By participating, you are expected to uphold this code. Please report unacceptable behavior to ansible-devtools@redhat.com.

## Getting Started

Before contributing, please:

1. Read this contributing guide thoroughly
2. Review the [README.md](README.md) for project overview
3. Check existing [issues](https://github.com/ansible/ansible-backstage-plugins/issues) and [pull requests](https://github.com/ansible/ansible-backstage-plugins/pulls)
4. Set up your development environment following the instructions below

## Development Environment Setup

### Prerequisites

- **Node.js**: Version 20 or 22 (check with `node --version`)
- **Yarn**: Version 4.9.2 (managed via Corepack)
- **Git**: For version control
- **Operating System**: Linux, macOS, or Windows with WSL2
- **RAM**: Minimum 8GB (16GB recommended for optimal performance)

### Initial Setup

1. **Fork and Clone the Repository**

```bash
git clone https://github.com/YOUR_USERNAME/ansible-backstage-plugins.git
cd ansible-backstage-plugins
```

2. **Install Dependencies**

```bash
./install-deps
```

This script will:

- Install all package dependencies
- Set up the Yarn workspace
- Configure pre-commit hooks via Husky

3. **Configure the Application**

Copy and edit the configuration file:

```bash
cp app-config.yaml app-config.local.yaml
```

Update the following fields in `app-config.local.yaml`:

- `backend.auth.keys.secret`: A secure random string (generate with `openssl rand -base64 32`)
- `auth.environment`: Set to 'development'
- `aap.baseUrl`: Your Ansible Automation Platform instance URL (if available)
- `aap.token`: Your AAP API token (if available)
- `aap.checkSSL`: Set to `false` for development, `true` for production

4. **Start the Development Server**

```bash
yarn start
```

The application will be available at `http://localhost:3000`

### IDE Setup

**Recommended VS Code Extensions:**

- ESLint
- Prettier - Code formatter
- TypeScript and JavaScript Language Features
- GitLens
- YAML

## Development Workflow

### Branching Strategy

- `main`: Protected branch, always stable
- `feature/*`: New features (e.g., `feature/add-inventory-support`)
- `fix/*`: Bug fixes (e.g., `fix/job-template-loading`)
- `enhancement/*`: Improvements to existing features
- `docs/*`: Documentation updates

### Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring without functionality changes
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates
- `perf`: Performance improvements

**Examples:**

```
feat(backstage-rhaap): add job template filtering

Adds ability to filter job templates by organization

Closes #123
```

```
fix(scaffolder): handle empty inventory list

Previously crashed when inventory list was empty.
Now displays appropriate message.

Fixes #456
```

### Git Hooks

Pre-commit hooks automatically run:

- ESLint (with auto-fix)
- Prettier (formatting)
- Type checking on staged files

## Code Style and Standards

### TypeScript

- Use **TypeScript strict mode**
- Prefer **interfaces** over types for object shapes
- Use **explicit return types** for exported functions
- Avoid `any` type; use `unknown` when type is truly unknown
- Use **named exports** (avoid default exports)

### File Naming

- Components: `ComponentName.tsx`
- Hooks: `useHookName.ts`
- Utilities: `utilityName.ts`
- Types: `types.ts` or `interfaces.ts`
- Tests: `*.test.ts` or `*.test.tsx`

### Import Organization

Organize imports in this order:

```typescript
// 1. Node/Backstage core modules
import { createPlugin } from '@backstage/core-plugin-api';

// 2. Third-party modules
import React from 'react';

// 3. Backstage plugins
import { catalogApiRef } from '@backstage/plugin-catalog-react';

// 4. Internal shared modules
import { AAPClient } from '@ansible/plugin-backstage-rhaap-common';

// 5. Relative imports
import { MyComponent } from './MyComponent';
import { useLocalHook } from './hooks';
```

Prettier handles formatting automatically. Run:

```bash
yarn prettier:check  # Check formatting
yarn fix             # Auto-fix formatting and lint issues
```

### ESLint

Run linting:

```bash
yarn lint:all        # Lint all files
yarn lint            # Lint changed files since main
```

## Testing

### Unit Tests

We use Jest for unit testing:

```bash
yarn test            # Run tests once
yarn test:watch      # Run tests in watch mode
yarn test:all        # Run all tests with coverage
```

### Testing Requirements

- **Coverage**: Maintain >80% code coverage
- **Test files**: Co-locate tests with source files
- Write tests for:
  - All business logic functions
  - React components with user interactions
  - API client methods
  - Utility functions

## Pull Request Process

### Before Submitting

1. **Create an issue** (if one doesn't exist)
2. **Fork the repository** and create a branch
3. **Make your changes** following code standards
4. **Write/update tests** to maintain coverage
5. **Update documentation** as needed
6. **Run all checks locally**:

```bash
yarn lint:all        # Check code style
yarn test:all        # Run all tests
yarn tsc             # Check TypeScript compilation
yarn build:all       # Ensure build succeeds
```

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests added/updated with passing status
- [ ] No new lint warnings
- [ ] Commit messages follow conventions
- [ ] PR description clearly explains changes
- [ ] Related issue(s) linked

### Review Process

1. **Automated Checks**: CI runs tests, linting, and builds
2. **Code Review**: At least one maintainer approval required
3. **Discussion**: Address feedback and update as needed
4. **Approval**: Maintainer approves PR
5. **Merge**: Maintainer merges using squash or merge commit

### Workflow Approval for Pull Requests

For security reasons, workflows that require access to repository secrets (such as SonarCloud analysis) use GitHub Environment protection. This prevents potentially malicious code from being executed with elevated permissions.

**How it works:**

1. Submit your PR - privileged workflows will pause and wait for approval
2. A maintainer will review your PR code for security concerns
3. Once reviewed, a maintainer approves the workflow run in the GitHub Actions UI
4. The workflow proceeds with access to secrets

**Note:** Each time you push new commits to your PR, the workflow will require re-approval. This ensures that any new code changes are reviewed before running with elevated permissions.

## Issue Reporting

### Before Creating an Issue

- Search existing issues to avoid duplicates
- Verify the issue in the latest version
- Gather relevant information

### Issue Labels

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Documentation improvements
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention needed
- `question`: Further information requested

## Plugin Development Guidelines

### Backstage Plugin Conventions

When developing plugins:

1. **Plugin Structure**:
   - Follow Backstage plugin architecture
   - Use plugin IDs consistently (e.g., `ansible`)
   - Export plugin from `src/plugin.ts`

2. **API Clients**:
   - Use `@ansible/plugin-backstage-rhaap-common` for shared utilities
   - Implement proper error handling
   - Use TypeScript interfaces for API responses

3. **UI Components**:
   - Use Material-UI v4 components
   - Follow Backstage design patterns
   - Implement loading and error states
   - Make components responsive

4. **Configuration**:
   - Define schema in `config.d.ts`
   - Document configuration in plugin README
   - Provide sensible defaults

### Creating a New Plugin

```bash
yarn new
# Follow prompts to create plugin scaffold
```

## Documentation

### Documentation Requirements

- **README.md**: Each plugin must have a README with:
  - Purpose and features
  - Installation instructions
  - Configuration guide
  - Usage examples
  - Screenshots (for UI plugins)

- **Code Comments**: Add JSDoc for:
  - Public APIs
  - Complex functions
  - Type definitions

- **Architecture Docs**: Update `docs/` for architectural changes

### Documentation Style

- Use clear, concise language
- Include code examples
- Add screenshots for UI features
- Keep documentation up to date with code changes

## Release Process

See [RELEASE_PROCESS.md](RELEASE_PROCESS.md) for detailed release procedures.

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **Major** (X.0.0): Breaking changes
- **Minor** (x.X.0): New features, backward compatible
- **Patch** (x.x.X): Bug fixes, backward compatible

## Community and Communication

### Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and discussions
- **Pull Requests**: Code contributions

### Getting Help

- Check existing documentation and issues
- Ask questions in GitHub Discussions
- Join Ansible community forums

## Security

**Never commit sensitive information**:

- API tokens or passwords
- Private keys or certificates
- Internal URLs or endpoints
- Customer data

For security vulnerabilities, see [SECURITY.md](SECURITY.md).

### Two-Factor Authentication

All contributors with commit access must enable two-factor authentication on their GitHub accounts.

## License

This project is licensed under the Apache-2.0 License. See [LICENSE](LICENSE) for details.

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.

## Thank You!

Thank you for contributing to Ansible Backstage Plugins! Your contributions help make this project better for everyone in the Ansible and Backstage communities.

---

Last updated: October 2025
