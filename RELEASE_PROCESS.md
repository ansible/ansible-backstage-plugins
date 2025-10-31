# Release Process

This document outlines the release process for the Ansible Backstage Plugins project, including version management, tagging strategy, and coordination between internal and upstream releases.

## Table of Contents

- [Overview](#overview)
- [Release Strategy](#release-strategy)
- [Version Numbering](#version-numbering)
- [Release Types](#release-types)
- [Release Workflow](#release-workflow)
- [Tagging Strategy](#tagging-strategy)
- [Release Notes](#release-notes)
- [Upstream Release Policy](#upstream-release-policy)
- [Internal vs. Upstream Coordination](#internal-vs-upstream-coordination)
- [Hotfix Process](#hotfix-process)
- [Post-Release Tasks](#post-release-tasks)

## Overview

The Ansible Backstage Plugins project maintains releases through Git tags and release markers. This repository is focused on code distribution rather than binary artifacts.

## Release Strategy

### Key Principles

1. **Tags Mark Releases**: Git tags identify release points in the codebase
2. **No Binary Assets**: Source code only; users build from source
3. **Semantic Versioning**: Follow semver for predictable version management
4. **Coordinated Releases**: Align internal and upstream releases when appropriate
5. **Transparent Process**: Document all releases in release notes

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

## Release Types

### Stable Release (1.x.x)

- Production-ready code
- Full test coverage
- Complete documentation
- No known critical bugs

### Release Candidate (1.x.x-rc.N)

- Feature complete
- Final testing phase
- May have minor known issues
- Used for validation before stable release

### Beta Release (1.x.x-beta.N)

- Feature preview
- API may still change
- Used for early feedback
- Not recommended for production

### Alpha Release (1.x.x-alpha.N)

- Experimental features
- Unstable API
- For development and testing only
- Subject to significant changes

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

## Tagging Strategy

### Tag Format

```
v<MAJOR>.<MINOR>.<PATCH>[-PRERELEASE]

Examples:
- v1.0.0
- v1.2.0-rc.1
- v2.0.0-beta.1
```

### Tag Annotations

Always use annotated tags (not lightweight tags):

```bash
# Good: Annotated tag with message
git tag -a v1.2.0 -m "Release version 1.2.0"

# Bad: Lightweight tag
git tag v1.2.0
```

### Multiple Plugin Releases

If plugins have different versions, use plugin-specific tags:

```bash
# Tag individual plugins
git tag -a backstage-rhaap-v1.2.0 -m "Release backstage-rhaap v1.2.0"
git tag -a self-service-v1.1.0 -m "Release self-service v1.1.0"

# Or use a unified tag for all plugins
git tag -a v1.2.0 -m "Release all plugins v1.2.0"
```

### Managing Tags

```bash
# List all tags
git tag -l

# Show tag details
git show v1.2.0

# Delete a local tag
git tag -d v1.2.0

# Delete a remote tag (use with caution!)
git push origin :refs/tags/v1.2.0

# Fetch all tags
git fetch --tags
```

## Release Notes

### Format

Follow this structure for release notes:

```markdown
# Release v1.2.0

**Release Date**: October 27, 2025

**Summary**: Brief description of this release

## Highlights

- Major feature 1
- Major feature 2
- Important fix

## Breaking Changes

⚠️ **Breaking Change**: Description of breaking change

Migration guide: [Link to documentation]

## New Features

- **Job Template Filtering** (#123): Filter templates by organization
- **Inventory Management** (#124): Organization-based inventory views

## Improvements

- Improved error messages in AAP client (#125)
- Better loading states in UI components (#130)

## Bug Fixes

- Fixed crash when inventory list is empty (#126)
- Corrected scaffolder action parameters (#127)

## Dependencies

- Updated Backstage to v1.39.1
- Updated Material-UI components
- Security updates for dependencies

## Upgrade Notes

1. Update your app-config.yaml if using new features
2. Run `yarn install` to update dependencies
3. Clear browser cache if experiencing UI issues

## Contributors

Thank you to all contributors who made this release possible!

- @contributor1
- @contributor2
- @contributor3
```

## Upstream Release Policy

### What Gets Released Upstream

✅ **Released Upstream**:

- Source code (all commits)
- Git tags marking releases
- Documentation
- Configuration examples
- Tests

❌ **NOT Released Upstream**:

- Build artifacts (dist files, bundles)
- Compiled binaries
- Container images
- Dynamic plugin packages
- Release asset files

### Rationale

The upstream repository serves as the canonical source for:

1. **Source Code Distribution**: Users and contributors access the latest source
2. **Version Tracking**: Tags mark stable points in development
3. **Collaboration**: Issues, PRs, and discussions happen upstream
4. **Transparency**: Open source development in public

Build artifacts and packages are:

- Generated by users from source
- Published to package registries (npm) separately
- Distributed through container registries (Quay.io) separately
- Not part of the source repository

## Internal vs. Upstream Coordination

### Synchronization Strategy

#### Continuous Sync (Recommended)

- Develop in upstream repository directly
- Internal builds pull from upstream tags
- Minimal divergence between internal and upstream

#### Periodic Sync

- Develop in internal repository
- Sync to upstream at release milestones
- Review and sanitize before pushing upstream
- Ensure commit history is clean

### Release Coordination

1. **Prepare Release**: Complete features in upstream
2. **Tag Upstream**: Create release tag in upstream repository
3. **Build Internally**: Trigger internal builds from upstream tag
4. **Distribute**: Publish artifacts through appropriate channels
5. **Announce**: Announce release in both internal and external channels

### Handling Discrepancies

If internal and upstream diverge:

```bash
# Sync upstream changes to internal
cd internal-repo
git remote add upstream https://github.com/ansible/backstage-plugins-ansible.git
git fetch upstream
git merge upstream/main

# Or rebase internal changes
git rebase upstream/main

# Resolve conflicts and push
git push origin main
```

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

## Post-Release Tasks

### 1. Verify Release

```bash
# Verify tag exists
git ls-remote --tags origin | grep v1.2.0

# Verify commit is correct
git show v1.2.0
```

### 2. Update Documentation

- Update installation instructions with new version
- Update plugin compatibility matrix
- Refresh example configurations

### 3. Communicate Release

- Announce on GitHub Discussions
- Post to relevant community channels
- Update project website/documentation

### 4. Monitor for Issues

- Watch for bug reports related to the release
- Monitor community feedback
- Be prepared for hotfix if needed

### 5. Plan Next Release

- Review roadmap
- Prioritize next features
- Set target date for next release

## Automation Considerations

While CI/CD is excluded from this repository, release automation may include:

- Automated version bumping
- Tag creation from CI/CD pipeline
- Notification systems for releases

These are implemented in internal CI/CD systems, not in this repository.

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
- **Release Planning**: ansible-devtools@redhat.com
- **Security Releases**: secalert@redhat.com

---

Last updated: October 2025
