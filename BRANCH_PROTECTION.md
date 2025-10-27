# Branch Protection Configuration Guide

This document provides step-by-step instructions for configuring branch protection rules for the `main` branch in the Ansible Backstage Plugins repository.

## Overview

Branch protection rules help maintain code quality and prevent accidental or malicious changes to critical branches. These rules enforce review processes, status checks, and other safeguards before code can be merged.

## Prerequisites

- You must have **admin** or **owner** access to the repository
- Access to the repository's Settings page on GitHub

## Configuration Steps

### 1. Access Branch Protection Settings

1. Navigate to the repository on GitHub: `https://github.com/ansible/ansible-backstage-plugins`
2. Click on **Settings** (top navigation bar)
3. In the left sidebar, click on **Branches** under "Code and automation"
4. Under "Branch protection rules," click **Add rule** or **Add branch protection rule**

### 2. Specify Branch Name Pattern

In the "Branch name pattern" field, enter:

```
main
```

This rule will apply only to the `main` branch.

### 3. Configure Protection Settings

Enable and configure the following settings:

#### Require Pull Request Reviews

- [x] **Require a pull request before merging**
  - Ensures all changes go through pull request review process
  - [x] **Require approvals**: Set to **1** (or more for higher security)
    - At least one maintainer must approve the PR before merging
  - [x] **Dismiss stale pull request approvals when new commits are pushed**
    - Forces re-approval if new changes are added after initial approval
  - [x] **Require review from Code Owners** (if CODEOWNERS file exists)
    - Designated code owners must review changes to their areas

#### Require Status Checks

- [x] **Require status checks to pass before merging**
  - Ensures automated tests and CI checks pass before merge
  - [x] **Require branches to be up to date before merging**
    - Branch must be current with main before merging

  **Status checks to require** (add these if available):
  - `lint` - ESLint code quality checks
  - `test` - Unit tests
  - `build` - Build verification
  - `typescript` - TypeScript compilation check

  _Note: You can add status checks as they become available from CI/CD workflows_

#### Require Conversation Resolution

- [x] **Require conversation resolution before merging**
  - All review comments must be resolved before merging
  - Prevents accidentally merging with unresolved discussions

#### Require Signed Commits

- [ ] **Require signed commits** (optional, recommended for high-security environments)
  - Ensures commits are cryptographically signed
  - Requires contributors to set up GPG signing

#### Require Linear History

- [x] **Require linear history**
  - Prevents merge commits; requires rebase or squash
  - Keeps commit history clean and easy to follow

#### Include Administrators

- [x] **Do not allow bypassing the above settings**
  - Applies rules to administrators as well
  - Ensures consistent process for all contributors
  - _Can be unchecked for emergency situations, but strongly discouraged_

#### Restrictions

- [x] **Restrict who can push to matching branches** (optional)
  - Limit push access to specific users, teams, or apps
  - Recommended: Allow only release managers or CI/CD bots
  - Leave unchecked to allow all contributors to create PRs

#### Force Push and Deletions

- [x] **Do not allow force pushes**
  - Prevents rewriting commit history on the protected branch
  - Protects against accidental or malicious history changes
- [x] **Do not allow deletions**
  - Prevents accidental deletion of the main branch
  - Essential protection for primary branch

#### Allow Fork Syncing

- [x] **Allow fork syncing**
  - Enables contributors to sync their forks with upstream
  - Important for open-source collaboration

### 4. Save the Configuration

1. Scroll to the bottom of the page
2. Click **Create** or **Save changes**
3. Verify the rule appears in the "Branch protection rules" list

## Verification

After applying the rules, verify they work correctly:

1. Try to push directly to `main` - should be rejected
2. Create a test pull request
3. Try to merge without approval - should be blocked
4. Get approval and verify merge works
5. Try to force push - should be rejected

## Rationale for Each Protection Rule

### Require Pull Request Reviews

**Why**: Ensures peer review of all changes, catching bugs and improving code quality before merging.

**Benefit**: Multiple eyes on code reduce errors and improve knowledge sharing.

### Require Status Checks

**Why**: Automated tests catch regressions and ensure code meets quality standards.

**Benefit**: Prevents broken code from entering the main branch.

### Require Conversation Resolution

**Why**: Ensures all feedback is addressed and discussions are concluded.

**Benefit**: Prevents premature merging with unresolved concerns.

### Require Linear History

**Why**: Maintains a clean, understandable commit history.

**Benefit**: Easier debugging with `git bisect` and clearer change tracking.

### Include Administrators

**Why**: Ensures consistent standards apply to all contributors.

**Benefit**: Prevents accidental bypasses and maintains process integrity.

### Prevent Force Pushes

**Why**: Protects commit history integrity.

**Benefit**: Prevents loss of work and maintains audit trail.

### Prevent Deletions

**Why**: Protects against accidental branch deletion.

**Benefit**: Ensures main branch always exists and is recoverable.

## Advanced Configuration (Optional)

### Required Status Checks Configuration

As your CI/CD pipeline matures, add these status checks:

```yaml
# Example status checks to add progressively
- build-backend
- build-frontend
- test-unit
- test-integration
- lint-typescript
- lint-eslint
- security-scan
- dependency-check
```

### CODEOWNERS File

Create a `.github/CODEOWNERS` file to automatically request reviews:

```
# Default owners for everything in the repo
* @ansible/backstage-plugins-maintainers

# Plugin-specific owners
/plugins/backstage-rhaap/ @ansible/frontend-team
/plugins/scaffolder-backend-module-backstage-rhaap/ @ansible/backend-team
/plugins/self-service/ @ansible/self-service-team

# Documentation
/docs/ @ansible/docs-team
*.md @ansible/docs-team
```

### Rulesets (GitHub Enterprise)

For GitHub Enterprise, consider using **Rulesets** instead of branch protection rules for more granular control:

- Navigate to Settings > Rules > Rulesets
- Create a ruleset with the same protections
- Rulesets provide better inheritance and targeting

## Troubleshooting

### Common Issues

**Problem**: Can't push to main even with proper PR process

**Solution**: Ensure PR is approved and all status checks pass. Check that branch is up to date.

---

**Problem**: Status checks not appearing in the list

**Solution**: Status checks must run at least once before they appear. Push a commit to trigger CI.

---

**Problem**: Need to bypass rules for emergency fix

**Solution**: Repository admins can temporarily disable protection, make the fix, and re-enable protection. Document the reason.

---

**Problem**: Contributors can't sync their forks

**Solution**: Ensure "Allow fork syncing" is enabled in branch protection settings.

## Security Considerations

### Red Hat GitHub Security Guidelines Compliance

This configuration aligns with Red Hat's GitHub security guidelines:

1. **Branch Protection**: Enabled for main branch ✓
2. **Required Reviews**: At least one approval ✓
3. **Status Checks**: Automated testing required ✓
4. **Force Push Prevention**: Enabled ✓
5. **Two-Factor Authentication**: Required for all contributors (enforced at organization level)
6. **Secret Scanning**: Enable via Security settings
7. **Dependabot Alerts**: Enable via Security settings

### Additional Security Settings

Beyond branch protection, configure these security settings:

1. **Security** → **Code security and analysis**
   - Enable Dependabot alerts
   - Enable Dependabot security updates
   - Enable Dependabot version updates
   - Enable Secret scanning
   - Enable Push protection

2. **Settings** → **Moderation options**
   - Enable interaction limits if needed

3. **Settings** → **Actions** → **General**
   - Set workflow permissions to read-only by default
   - Require approval for first-time contributors

## Maintenance

### Regular Reviews

Review and update branch protection rules:

- **Quarterly**: Verify rules are still appropriate
- **After incidents**: Adjust rules based on lessons learned
- **When CI changes**: Update required status checks

### Documentation Updates

When changing branch protection rules:

1. Update this document
2. Notify team via appropriate channels
3. Update CONTRIBUTING.md if process changes
4. Add note to next release notes

## Related Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [SECURITY.md](SECURITY.md) - Security policy
- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)

## Contact

For questions about branch protection configuration:

- **Repository Maintainers**: Open a GitHub Discussion
- **Security Concerns**: ansible-devtools@redhat.com
- **GitHub Enterprise Support**: Contact your GitHub administrator

---

Last updated: October 2025
