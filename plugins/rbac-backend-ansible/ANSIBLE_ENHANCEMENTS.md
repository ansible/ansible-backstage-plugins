# Ansible Enhancements to RBAC Plugin

## Overview

This is a **forked version** of `@backstage-community/plugin-rbac-backend` with integrated external system RBAC checks.

**Base Plugin**: `@backstage-community/plugin-rbac-backend` v7.5.0  
**Enhanced Plugin**: `@ansible/plugin-rbac-backend-ansible` v1.0.0

## What Was Modified

### 1. Package Identity
- **Name**: `@backstage-community/plugin-rbac-backend` → `@ansible/plugin-rbac-backend-ansible`
- **PluginId**: `rbac` → `permission`
- **Repository**: Updated to ansible/ansible-backstage-plugins

### 2. Permission Policy Enhancement (`src/policies/permission-policy.ts`)

#### Added Dependencies:
```typescript
import { Entity } from '@backstage/catalog-model';
import {
  IAAPService,
  IAAPTokenLookup,
} from '@ansible/backstage-rhaap-common';
```

#### Added Class Properties:
```typescript
export class RBACPermissionPolicy implements PermissionPolicy {
  private readonly aapService?: IAAPService;
  private readonly aapTokenLookup?: IAAPTokenLookup;
  private readonly logger: LoggerService;
  private readonly accessCache = new Map<string, { templateIds: Set<number>; expiresAt: number }>();
  private readonly cacheTTLMs = 60000;
  // ... existing properties
}
```

#### Modified Constructor:
Added optional `aapService` and `aapTokenLookup` parameters to both `build()` and constructor.

#### Enhanced `handle()` Method:
Added external system check **immediately after superuser check, before normal RBAC**:

```typescript
async handle(request: PolicyQuery, user?: PolicyQueryUser): Promise<PolicyDecision> {
  // ... existing code ...
  
  if (this.superUserList!.includes(userEntityRef)) {
    // Allow superusers
  }

  // ===== ANSIBLE ENHANCEMENT: External System RBAC =====
  if (isResourcePermission(request.permission, 'catalog-entity') &&
      request.permission.attributes?.action === 'read') {
    const entity = (request as any).resource as Entity | undefined;
    
    if (entity?.metadata.annotations?.['ansible.com/aapJobTemplateId']) {
      const aapDecision = await this.checkAAPAccess(userEntityRef, entity, auditorEvent);
      if (aapDecision) {
        return aapDecision;  // AAP RBAC takes precedence
      }
    }
    
    // TODO: GitHub and GitLab checks here
  }
  // ===== END ENHANCEMENT =====

  // ... continue with normal RBAC logic ...
}
```

#### Added New Method:
```typescript
private async checkAAPAccess(
  userEntityRef: string,
  entity: Entity,
  auditorEvent: AuditorServiceEvent,
): Promise<PolicyDecision | null> {
  // 1. Check if AAP service is configured
  // 2. Get template ID from annotation
  // 3. Check cache for accessible templates
  // 4. Lookup user's AAP OAuth token from session
  // 5. Query AAP API for accessible templates
  // 6. Cache results for 1 minute
  // 7. Return ALLOW/DENY based on access
}
```

### 3. Policy Builder Enhancement (`src/service/policy-builder.ts`)

#### Added Dependencies:
```typescript
import {
  IAAPService,
  IAAPTokenLookup,
} from '@ansible/backstage-rhaap-common';
```

#### Modified `EnvOptions` Type:
```typescript
export type EnvOptions = {
  // ... existing properties ...
  aapService?: IAAPService;
  aapTokenLookup?: IAAPTokenLookup;
};
```

#### Modified Policy Instantiation:
```typescript
env.policy.setPolicy(
  await RBACPermissionPolicy.build(
    // ... existing parameters ...
    env.aapService,
    env.aapTokenLookup,
  ),
);
```

### 4. Plugin Module Enhancement (`src/plugin.ts`)

#### Added Dependencies:
```typescript
import {
  ansibleServiceRef,
  AAPTokenLookup,
} from '@ansible/backstage-rhaap-common';
import { DatabaseManager } from '@backstage/backend-defaults/database';
```

#### Added Dependency Injection:
```typescript
env.registerInit({
  deps: {
    // ... existing deps ...
    ansibleService: ansibleServiceRef,  // NEW
  },
  async init({ /* ... */, ansibleService }) {
    // Create AAP token lookup service
    const databaseManager = DatabaseManager.fromConfig(config);
    const authDatabase = databaseManager.forPlugin('auth', { logger, lifecycle });
    const aapTokenLookup = await AAPTokenLookup.create({
      database: authDatabase,
      logger,
    });

    // Pass to PolicyBuilder
    await PolicyBuilder.build(
      {
        // ... existing options ...
        aapService: ansibleService,
        aapTokenLookup,
      },
      // ...
    );
  },
});
```

## Required Infrastructure

This plugin requires the following infrastructure (already implemented):

### 1. OAuth Session Storage
- **Path**: `plugins/backstage-rhaap-common/src/OAuthSessionTokens/`
- **Purpose**: Store OAuth tokens in database-backed sessions
- **Functions**: `storeAAPToken()`, `getAAPToken()`, `removeAAPToken()`

### 2. AAP Token Lookup Service
- **Path**: `plugins/backstage-rhaap-common/src/AAPTokenLookup/`
- **Purpose**: Query session database by `userEntityRef` to retrieve tokens
- **Class**: `AAPTokenLookup`

### 3. Auth Provider Integration
- **Path**: `plugins/auth-backend-module-rhaap-provider/src/authenticator.ts`
- **Changes**: Stores AAP token in session on login/refresh, removes on logout

### 4. Entity Annotations
- **Path**: `plugins/catalog-backend-module-rhaap/src/providers/dynamicJobTemplate.ts`
- **Changes**: Adds `ansible.com/aapJobTemplateId` annotation to job templates

### 5. App Configuration
- **Path**: `app-config.yaml`
- **Changes**:
  - `auth.session.secret` - Enables database-backed sessions
  - `backend.database.connection.directory` - Persistent SQLite storage

## How It Works

### Permission Flow

```
User Request
   │
   ▼
RBAC Policy handle()
   │
   ├─► Superuser? → ALLOW
   │
   ├─► Has external annotation?
   │   ├─► AAP job template → checkAAPAccess()
   │   │   ├─► Lookup user's AAP token from session DB
   │   │   ├─► Query AAP API for accessible templates
   │   │   └─► Return ALLOW/DENY
   │   │
   │   ├─► GitHub repo → checkGitHubAccess() [TODO]
   │   └─► GitLab project → checkGitLabAccess() [TODO]
   │
   └─► Normal RBAC logic (Casbin enforcer, conditional policies, etc.)
```

### Key Benefits

1. **Single Source of Truth**: AAP permissions are checked directly against AAP API
2. **No Duplicate Rules**: No need to maintain job template permissions in Backstage
3. **RBAC UI**: Full RBAC UI still available for user-created entities
4. **Extensible**: Easy to add GitHub/GitLab checks in future
5. **Backward Compatible**: Falls back to normal RBAC if no external annotation

## Testing

### Start the Server
```bash
cd /Users/gnalawad/Documents/projects/portal/ansible-backstage-plugins
yarn start
```

### Expected Log Messages
```
[RBAC-Ansible] Initializing AAP token lookup for external RBAC checks
[RBAC-Ansible] ✅ AAP token lookup service created
RBAC backend plugin was enabled
```

### Test AAP Filtering
1. Log in as `admin` (AAP superuser)
2. Navigate to `/catalog?filters[kind]=template`
3. Should see **all 3 job templates** ✅

4. Log in as `user1` (limited access)
5. Navigate to `/catalog?filters[kind]=template`
6. Should see **only 1 job template** ✅

### Test RBAC UI
1. Navigate to `/rbac`
2. Should see RBAC UI for managing permissions ✅
3. Create roles and assign permissions for user-created entities ✅

## Future Enhancements

### GitHub Integration
When adding GitHub repository discovery:

1. Implement `checkGitHubAccess()` method in `permission-policy.ts`
2. Add GitHub token storage in GitHub auth provider
3. Create `GitHubTokenLookup` service
4. Add `github.com/project-slug` annotation during discovery

### GitLab Integration
Similar to GitHub - implement `checkGitLabAccess()` method.

## Maintenance

### Syncing Upstream Changes
To merge updates from community RBAC plugin:

```bash
# In community-plugins repo
cd workspaces/rbac/plugins/rbac-backend
git log --oneline | head -20  # Check recent changes

# Copy specific files or patches
git diff v7.5.0..HEAD src/policies/permission-policy.ts > /tmp/rbac-updates.patch

# Apply to ansible fork (review carefully)
cd /path/to/ansible-backstage-plugins/plugins/rbac-backend-ansible
patch -p1 < /tmp/rbac-updates.patch

# Test thoroughly
yarn start
```

### Known Issues
- TypeScript strict mode errors in original RBAC code (Type 'unknown' not assignable)
- These don't affect runtime behavior
- Can be suppressed with `// @ts-expect-error` if needed

## Success Criteria

✅ RBAC UI available at `/rbac`  
✅ AAP job templates filtered by AAP RBAC (single source of truth)  
✅ User-created entities managed via RBAC UI  
✅ No duplicate permission management  
✅ Ready for GitHub/GitLab integration

