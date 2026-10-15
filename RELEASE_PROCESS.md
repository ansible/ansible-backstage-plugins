# Release Process

This document outlines the release process for the Ansible Backstage Plugins project, including version management, tagging strategy, and coordination between internal and upstream releases.

## Table of Contents

- [Overview](#overview)
- [Release Strategy](#release-strategy)
- [Version Numbering](#version-numbering)
- [Release Workflow](#release-workflow)
- [Hotfix Process](#hotfix-process)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)
- [Contact](#contact)

## Overview

The Ansible Backstage Plugins project maintains releases through Git tags and release markers. This repository is focused on code distribution rather than binary artifacts.

## Release Strategy

### Key Principles

1. **Tags Mark Releases**: Git tags identify release points in the codebase
2. **Semantic Versioning**: Follow semver for predictable version management
3. **Coordinated Releases**: Align internal and upstream releases when appropriate
4. **Transparent Process**: Document all releases in release notes

### Release Cadence

- **Major Releases**: As needed for breaking changes (coordinated with Backstage releases)
- **Minor Releases**: Monthly or as features are completed
- **Patch Releases**: As needed for bug fixes and security updates
- **Hotfixes**: Immediately for critical security vulnerabilities

## Version Numbering

We follow [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]

Examples:
- 1.0.0       # Stable release
- 1.1.0       # New features, backward compatible
- 1.1.1       # Bug fixes
- 2.0.0-rc.1  # Release candidate
- 1.2.0-beta.1 # Beta release
```

### Version Components

- **MAJOR**: Incompatible API changes or breaking changes
- **MINOR**: New functionality, backward compatible
- **PATCH**: Bug fixes, backward compatible
- **PRERELEASE**: Optional suffix for pre-release versions (alpha, beta, rc)
- **BUILD**: Optional build metadata (commit SHA, build date)

### Breaking Changes

A breaking change requires a major version bump and includes:

- Removing or renaming public APIs
- Changing function signatures
- Modifying configuration schema in non-backward-compatible ways
- Changing plugin IDs or routes
- Updating minimum supported versions of dependencies (Node.js, Backstage)

## Release Workflow

### 1. Prepare for Release

#### Update Version Numbers

Update package.json files for all affected plugins:

```bash
# Update plugin versions
cd plugins/backstage-rhaap
# Edit package.json, set "version": "1.2.0"

cd ../self-service
# Edit package.json, set "version": "1.2.0"

# Repeat for all plugins being released
```

#### Update Dependencies

Ensure internal dependencies reference the correct versions:

```json
{
  "dependencies": {
    "@ansible/plugin-backstage-rhaap-common": "^1.2.0"
  }
}
```

### 2. Run Pre-Release Checks

```bash
# Install fresh dependencies
yarn install --immutable

# Run type checking
yarn tsc

# Run all tests
yarn test:all

# Run linting
yarn lint:all

# Build all packages
yarn build:all

# Verify dynamic plugin export
yarn export-local
```

### 3. Create Release Commit

```bash
# Commit version changes
git add .
git commit -m "chore(release): prepare for v1.2.0 release

- Updated plugin versions to 1.2.0
- Updated dependencies
"
```

### 4. Create and Push Tag

```bash
# Create annotated tag
git tag -a v1.2.0 -m "Release version 1.2.0

## Highlights
- Job template filtering
- Organization-based inventory
- Improved error handling
"

# Push the commit and tag
git push origin main
git push origin v1.2.0
```

### 5. Create GitHub Release (Optional)

While we don't upload release assets, we can create GitHub releases for documentation:

1. Go to repository on GitHub
2. Click "Releases" → "Draft a new release"
3. Select the tag (v1.2.0)
4. Set release title: "v1.2.0 - Release Name"
5. Add release notes describing the changes
6. Check "Set as the latest release"
7. Click "Publish release"

**Note**: Do not upload any build artifacts or compiled files.

## Hotfix Process

For critical bugs or security vulnerabilities:

### 1. Create Hotfix Branch

```bash
# From the latest release tag
git checkout -b hotfix/1.2.1 v1.2.0
```

### 2. Apply Fix

```bash
# Make the fix
# Test thoroughly
yarn test:all
```

### 3. Release Hotfix

```bash
# Update version to 1.2.1
git commit -m "fix: critical security vulnerability (#XXX)"

# Tag the hotfix
git tag -a v1.2.1 -m "Hotfix release v1.2.1

Security: Fixed critical vulnerability in AAP authentication
"

# Merge to main
git checkout main
git merge hotfix/1.2.1

# Push everything
git push origin main
git push origin v1.2.1
```

### 4. Notify Users

- Create GitHub release with [Security] tag
- Notify users through appropriate channels
- Update security advisory if applicable

## Best Practices

1. **Always Test Before Tagging**: Run full test suite
2. **Document Breaking Changes**: Clear migration guides
3. **Coordinate with Team**: Ensure all stakeholders are aware
4. **Consistent Naming**: Follow tag naming conventions
5. **Meaningful Messages**: Write descriptive tag annotations
6. **Security First**: Prioritize security updates
7. **Backward Compatibility**: Minimize breaking changes
8. **Clear Communication**: Keep community informed

## Related Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [SECURITY.md](SECURITY.md) - Security policy

## Contact

For questions about the release process:

- **General Questions**: Open a GitHub Discussion
- **Security Releases**: secalert@redhat.com

---
