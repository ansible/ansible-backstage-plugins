# GitHub Auth Wrapper Module

This module wraps Backstage's standard GitHub auth provider to add OAuth token storage in database-backed sessions. This enables the enhanced RBAC plugin to access user's GitHub tokens for repository permission checks.

## Purpose

The standard `@backstage/plugin-auth-backend-module-github-provider` does not store OAuth tokens in a way that the permission policy can access them. This wrapper:

1. Intercepts the authenticate and refresh methods
2. Stores GitHub OAuth tokens in sessions with the user's entity reference
3. Enables GitHubTokenLookup service to retrieve tokens for permission checks

## Usage

Replace the standard GitHub auth provider with this wrapper:

```typescript
// packages/backend/src/index.ts

// Remove standard provider:
// backend.add(import('@backstage/plugin-auth-backend-module-github-provider'));

// Add wrapper instead:
backend.add(import('@ansible/auth-backend-module-github-wrapper'));
```

## How It Works

The wrapper delegates all authentication logic to the standard GitHub provider but adds token storage:

```typescript
async authenticate(input, ctx) {
  // 1. Call standard GitHub authenticator
  const result = await githubAuthenticator.authenticate(input, ctx);
  
  // 2. Store token in session
  storeGitHubToken(input.req, result.session.accessToken, {
    username: result.fullProfile.username,
    expiresAt: ...
  });
  
  // 3. Return standard result
  return result;
}
```

## Token Storage

Tokens are stored in the same database-backed session infrastructure as AAP tokens:

```
Session Data:
{
  githubToken: {
    accessToken: "gho_xxx",
    userEntityRef: "user:default/username",
    storedAt: "2026-01-11T...",
    expiresAt: "2026-01-12T..."
  }
}
```

## Integration with Permission Policy

The enhanced RBAC plugin will use GitHubTokenLookup service (similar to AAPTokenLookup) to retrieve tokens by user entity reference for permission checks on GitHub-discovered repositories.

## Compatibility

This wrapper is fully compatible with the standard GitHub provider configuration in `app-config.yaml`. No configuration changes needed.

