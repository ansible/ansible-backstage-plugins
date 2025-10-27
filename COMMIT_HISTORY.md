# Commit History Sanitization Guide

This document provides guidance on sanitizing the Git commit history before publishing to upstream repositories. This process ensures sensitive information, internal references, and proprietary details are removed while maintaining a clean, useful commit history.

## Table of Contents

- [Overview](#overview)
- [When to Sanitize](#when-to-sanitize)
- [Pre-Publishing Checklist](#pre-publishing-checklist)
- [Tools for Sanitization](#tools-for-sanitization)
- [Step-by-Step Sanitization Workflow](#step-by-step-sanitization-workflow)
- [Common Sanitization Scenarios](#common-sanitization-scenarios)
- [Verification](#verification)
- [Best Practices](#best-practices)
- [Important Warnings](#important-warnings)

## Overview

Commit history sanitization involves reviewing and cleaning the Git commit history to remove:

- Sensitive credentials (API keys, tokens, passwords)
- Internal URLs and hostnames
- Proprietary information or internal project names
- Personal or customer data
- Debug information with sensitive context
- Large binary files or build artifacts
- Internal email addresses or usernames

This process is typically performed once before initial upstream publication and maintained through careful commit practices thereafter.

## When to Sanitize

Sanitize your commit history when:

- **Initial upstream publication**: Before pushing to a public repository for the first time
- **Sensitive data committed**: If credentials or sensitive information was accidentally committed
- **Internal references**: Removing references to internal systems or projects
- **Compliance requirements**: Meeting security or legal requirements
- **Repository migration**: Moving from internal to public hosting

## Pre-Publishing Checklist

Before beginning sanitization, complete this checklist:

### 1. Search for Sensitive Information

Search the entire repository history for:

- [ ] API keys and tokens (`grep -r "api[_-]key" $(git rev-list --all)`)
- [ ] Passwords (`grep -r "password\|passwd" $(git rev-list --all)`)
- [ ] Private keys (search for "BEGIN" + "PRIVATE" + "KEY", "BEGIN" + "RSA" patterns)
- [ ] Internal URLs (search for company-specific domains)
- [ ] Email addresses (search for internal domains)
- [ ] IP addresses of internal systems
- [ ] Database connection strings
- [ ] OAuth secrets and client IDs
- [ ] Proprietary comments or documentation

### 2. Identify Commits to Modify

- [ ] List commits containing sensitive information
- [ ] Identify commits with poor or internal-only commit messages
- [ ] Note commits that need to be squashed or removed
- [ ] Document commits that reference internal systems

### 3. Create Backup

```bash
# Create a backup branch before starting
git branch backup-before-sanitization

# Or clone the entire repository
git clone --mirror <repo-url> <repo-backup>
```

### 4. Notify Team

- [ ] Inform team members of the sanitization
- [ ] Coordinate timing to minimize disruption
- [ ] Plan for repository force-push

## Tools for Sanitization

### Option 1: git-filter-repo (Recommended)

**Best for**: Most sanitization tasks, fast and safe

**Installation**:

```bash
# On Fedora/RHEL
sudo dnf install git-filter-repo

# On Ubuntu/Debian
sudo apt-get install git-filter-repo

# Via pip
pip3 install git-filter-repo
```

**Advantages**:

- Fast and efficient
- Safer than filter-branch
- Better handling of edge cases
- Officially recommended by Git

### Option 2: BFG Repo-Cleaner

**Best for**: Removing large files or simple text replacements

**Installation**:

```bash
# Download from https://rtyley.github.io/bfg-repo-cleaner/
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# Create alias
alias bfg='java -jar /path/to/bfg-1.14.0.jar'
```

**Advantages**:

- Very fast
- Simple syntax
- Good for bulk operations

### Option 3: git filter-branch (Legacy)

**Best for**: Complex, specific rewrites

**Note**: Deprecated in favor of git-filter-repo, but still available

## Step-by-Step Sanitization Workflow

### Workflow Using git-filter-repo

#### 1. Clone Fresh Repository

```bash
# Start with a fresh clone
git clone <repository-url> ansible-backstage-plugins-clean
cd ansible-backstage-plugins-clean
```

#### 2. Remove Sensitive Files from History

```bash
# Remove specific file from all commits
git filter-repo --path config/secrets.yaml --invert-paths

# Remove entire directory from history
git filter-repo --path internal-tools/ --invert-paths

# Remove multiple patterns
git filter-repo --path-glob '*.key' --invert-paths
git filter-repo --path-glob '**/secrets/*' --invert-paths
```

#### 3. Replace Sensitive Text

Create a file `replacements.txt`:

```
# Format: old_text==>new_text
api-key-abc123==>REDACTED_API_KEY
internal.example.com==>example.com
secret-token-xyz==>REDACTED_TOKEN
john.doe@company.internal==>contributor@example.com
```

Run the replacement:

```bash
git filter-repo --replace-text replacements.txt
```

#### 4. Rewrite Commit Messages

Create a file `message-replacements.txt`:

```
# Remove internal ticket references
JIRA-\d+==>
INTERNAL-\d+==>

# Replace internal project names
SecretProjectName==>Ansible Backstage Plugins
```

```bash
git filter-repo --replace-message message-replacements.txt
```

#### 5. Rewrite Author Information (Optional)

```bash
# Anonymize internal contributors
git filter-repo --email-callback '
  return email if not email.endswith(b"@company.internal") else b"contributor@example.com"
'
```

### Workflow Using BFG Repo-Cleaner

#### 1. Clone Mirror Repository

```bash
git clone --mirror <repository-url> ansible-backstage-plugins.git
cd ansible-backstage-plugins.git
```

#### 2. Remove Large Files

```bash
# Remove files larger than 10MB
bfg --strip-blobs-bigger-than 10M

# Remove specific file by name
bfg --delete-files secrets.yaml

# Remove folder
bfg --delete-folders internal-tools
```

#### 3. Replace Sensitive Text

Create `passwords.txt` with one sensitive string per line:

```
api-key-abc123
secret-token-xyz
internal.example.com
```

```bash
bfg --replace-text passwords.txt
```

#### 4. Clean Up

```bash
# Expire reflog and garbage collect
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## Common Sanitization Scenarios

### Scenario 1: Remove Accidentally Committed Secrets

```bash
# Find commits containing the secret
git log -S "api-key-abc123" --all

# Remove the secret from history
git filter-repo --replace-text <(echo 'api-key-abc123==>REDACTED_API_KEY')
```

### Scenario 2: Remove Internal URLs

```bash
# Create replacements file
cat > replacements.txt << EOF
https://internal.company.com==>https://example.com
http://jenkins.internal==>http://ci-server.example.com
EOF

# Apply replacements
git filter-repo --replace-text replacements.txt
```

### Scenario 3: Clean Up Commit Messages

```bash
# Remove internal ticket references from commit messages
git filter-repo --message-callback '
  import re
  message = message.decode("utf-8")
  message = re.sub(r"JIRA-\d+", "", message)
  message = re.sub(r"Reviewed-by:.*@company\.internal", "", message)
  return message.encode("utf-8")
'
```

### Scenario 4: Squash Debug Commits

```bash
# Interactive rebase to squash commits
git rebase -i HEAD~20

# In the editor, change "pick" to "squash" for commits to combine
```

### Scenario 5: Remove Large Binary Files

```bash
# Find large files in history
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  sed -n 's/^blob //p' | \
  sort --numeric-sort --key=2 | \
  tail -n 10

# Remove them
git filter-repo --strip-blobs-bigger-than 5M
```

## Verification

After sanitization, verify the changes:

### 1. Check for Sensitive Data

```bash
# Search for API keys
git log --all -S "api-key" -S "api_key" -S "apikey"

# Search for passwords
git log --all -S "password" -S "passwd"

# Search for internal domains
git log --all -S "internal.company.com"

# Check files in history
git log --all --pretty=format: --name-only --diff-filter=A | sort -u
```

### 2. Verify Commit Integrity

```bash
# Check that all commits are reachable
git fsck --full

# Verify branch pointers
git log --oneline --graph --all

# Check repository size
du -sh .git
```

### 3. Test Build and Functionality

```bash
# Verify the repository still builds
yarn install
yarn build:all
yarn test

# Check that all references work
git ls-remote --heads
git ls-remote --tags
```

### 4. Review Commit Messages

```bash
# Review all commit messages
git log --oneline --all

# Check for internal references
git log --all | grep -i "internal\|secret\|confidential"
```

## Best Practices

### For Future Commits

1. **Use .gitignore Properly**
   - Add sensitive files before committing
   - Maintain comprehensive .gitignore
   - Use .env files for local secrets

2. **Pre-Commit Hooks**
   - Install hooks to prevent sensitive data commits
   - Use tools like `git-secrets` or `detect-secrets`

3. **Commit Message Guidelines**
   - Avoid internal references in commit messages
   - Use public issue tracker references
   - Keep messages professional and clear

4. **Configuration Management**
   - Use environment variables for secrets
   - Never commit credentials or tokens
   - Use example files (e.g., `.env.example`)

5. **Code Review**
   - Review all commits before merging
   - Check for sensitive information in diffs
   - Enforce branch protection rules

### Maintaining Clean History

```bash
# Add pre-commit hook for secret detection
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Check for common secret patterns
if git diff --cached | grep -iE 'api[_-]?key|password|secret|token'; then
    echo "ERROR: Possible secret detected in commit"
    echo "Please review and remove sensitive data"
    exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
```

## Important Warnings

### ⚠️ History Rewriting is Destructive

- Rewriting history changes all commit SHAs
- All contributors must fetch the new history
- Old clones and forks will be incompatible
- Tags and branches need to be recreated

### ⚠️ Never Rewrite Published History

- **DO NOT** rewrite history that has been pushed to public/shared repositories
- If sensitive data is in published commits, consider:
  - Rotating the compromised credentials immediately
  - Removing the repository and creating a new one
  - Using GitHub/GitLab support to force-remove sensitive data

### ⚠️ Backup Before Sanitizing

- Always create a backup before sanitization
- Keep backups until verification is complete
- Store backups securely (not in public locations)

### ⚠️ Force Push Coordination

When pushing sanitized history:

```bash
# Force push to upstream (COORDINATE WITH TEAM)
git push --force --all origin
git push --force --tags origin
```

Notify all contributors:

```
IMPORTANT: The repository history has been rewritten.

Please follow these steps:
1. Commit or stash all local changes
2. Fetch the new history: git fetch origin
3. Reset to the new history: git reset --hard origin/main
4. Delete old local branches
5. Re-create any local branches from origin

Your old local repository will no longer be compatible with upstream.
```

## Additional Resources

- [Git Filter-Repo Documentation](https://github.com/newren/git-filter-repo)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
- [GitHub: Removing Sensitive Data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Git Filter-Branch Documentation](https://git-scm.com/docs/git-filter-branch)

## Support

For questions or assistance with commit history sanitization:

- **Internal**: Contact your repository administrator
- **Security Issues**: ansible-devtools@redhat.com
- **General Questions**: Open a GitHub Discussion

---

Last updated: October 2025
