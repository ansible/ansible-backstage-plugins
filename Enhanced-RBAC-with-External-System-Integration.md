---
title: "Enhanced RBAC with External System Integration for Backstage Self-Service Portal"
---

_How do we secure Backstage catalog entities by integrating external system RBAC (AAP, GitHub, GitLab) while maintaining Backstage RBAC UI for user-created content?_

|                          |                                                                               |
| ------------------------ | ----------------------------------------------------------------------------- |
| **Component**            | Ansible Backstage Self-Service Portal                                        |
| **Authors**              |                                                                               |
| **Supersedes**           |                                                                               |
| **Superseded By**        |                                                                               |
| **Feature / Initiative** |                                                                               |
| **Parent SDP**           |                                                                               |
| **Links**                |                                                                               |

## Problem Statement

### Inconsistent Permission Enforcement

The Ansible self-service portal integrates with Ansible Automation Platform (AAP) to provide a catalog of job templates. Currently, the system synchronizes all job templates from AAP using an admin token and stores them in the Backstage catalog. While AAP's RBAC prevents unauthorized users from executing templates, the catalog metadata (names, descriptions, parameters) is visible to all users through direct API access.

The frontend self-service UI correctly filters templates by querying AAP with the logged-in user's token, but this filtering only applies to the UI. Users accessing the Backstage catalog API directly see all synced templates regardless of their AAP permissions. While they cannot execute these templates without proper AAP permissions, the visibility of template metadata is inconsistent with the intended user experience.

For example, if User1 has access to 1 template in AAP, the frontend shows only that template. However, querying `/api/catalog/entities?filter=kind=template` directly returns all 3 synced templates.

### Requirements

The solution must provide a unified RBAC system that handles two distinct types of catalog content:

1. User-created entities (components, APIs, custom templates):
   - Managed through Backstage RBAC UI
   - Administrators configure permissions via the `/rbac` interface
   - Rules stored in Backstage database
   - Traditional role-based access control patterns

2. Auto-synced entities from external sources (AAP job templates, GitHub repositories, GitLab projects):
   - Dynamically filtered based on external system RBAC
   - No permission replication or duplication in Backstage
   - External system remains single source of truth
   - Real-time permission checks against external APIs

Specific requirements:

1. RBAC backend and UI must support permission management for user-created entities while performing dynamic permission checks for externally-sourced entities.

2. Enforce external system RBAC consistently across all Backstage catalog endpoints (list queries, search, facets, individual entity access).

3. Avoid replicating external system roles and permissions within Backstage. Query external systems dynamically using the logged-in user's OAuth token rather than syncing or duplicating RBAC rules.

4. Support multiple external systems simultaneously (AAP currently, GitHub and GitLab in future) with each system's RBAC enforced independently.

5. Work with database-backed sessions for OAuth token storage to survive pod restarts and handle automatic token refresh.

### Technical Constraints

The Backstage permission system supports only one permission policy at a time. The community RBAC plugin is a complete backend plugin that does not expose extension points for external modules to hook into. The permission policy receives only user identity, not the HTTP request or session object, requiring a separate mechanism to access OAuth tokens.

---

## Industry Context

This proposal addresses an advanced enterprise requirement that extends beyond typical Backstage deployments. While Backstage provides a robust permission framework with conditional decisions, it does not prescribe specific patterns for dynamic external system RBAC integration with catalog synchronization.

Common industry patterns for external content in developer portals:

1. Sync all external content and apply only internal portal RBAC
   - Simple to implement but loses external permission accuracy
   - Over-exposes content or requires manual rule duplication

2. Manually replicate external permissions within the portal
   - Maintains permission accuracy but creates maintenance burden
   - Administrators manage rules in multiple systems
   - Rules can drift out of sync

3. No external content synchronization
   - Avoids permission complexity entirely
   - Users must access multiple systems directly
   - Loses unified catalog experience

Our solution provides a more sophisticated approach: maintain external systems as the single source of truth while enabling unified catalog discovery through dynamic permission checks. This pattern is appropriate for enterprises with strict compliance requirements where permission accuracy and operational efficiency cannot be compromised.

The implementation follows documented Backstage patterns (conditional decisions, session management, permission policy structure) and extends them for external system integration. This approach is suitable for organizations managing multiple external systems (AAP, GitHub, GitLab) where each system has its own RBAC that must be respected.

---

## Solution Overview

### Approach

Fork the community RBAC plugin and integrate external system permission checks directly into the permission policy. 

Why forking is necessary: Backstage's permission system supports only one active policy at a time. The community RBAC plugin is a complete backend plugin (not a module) that does not expose extension points for external hooks. Attempting to wrap or compose policies externally fails because the RBAC plugin registers its policy via the same extension point our custom policy would use, creating a conflict. Modifying the policy code directly within a fork is the only way to add external system checks while preserving RBAC UI functionality.

The enhanced policy checks external system annotations (AAP, GitHub, GitLab) before applying normal Backstage RBAC rules.

The solution has two components:

1. Enhanced RBAC plugin with external system integration
2. OAuth token storage and lookup infrastructure

For catalog list queries, the policy returns conditional decisions that allow database-level filtering. For individual entity checks, it returns direct allow/deny decisions. OAuth tokens are stored in database-backed sessions with user entity references for lookup during permission checks.

---

## Architecture

### Complete Request Flow

The following diagram shows how a catalog query flows through the system:

```
┌──────────────────────────────────────────────────────────────────┐
│                      BROWSER / CLIENT                             │
│  User: user1                                                      │
│  Request: GET /api/catalog/entities?filter=kind=template         │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTP Request with JWT token
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│              BACKSTAGE CORE - HTTP ROUTER                         │
│  1. Validates JWT token                                          │
│  2. Extracts user identity: user:default/user1                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│              CATALOG BACKEND PLUGIN                               │
│  1. Receives catalog query request                               │
│  2. Needs to authorize: Can user1 read catalog entities?         │
└────────────────────────┬─────────────────────────────────────────┘
                         │ Calls Permission API
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│        BACKSTAGE PERMISSION FRAMEWORK                             │
│  Endpoint: POST /api/permission/authorize                        │
│  Request:                                                         │
│    - permission: catalog.entity.read                             │
│    - resourceType: catalog-entity                                │
│    - user: user:default/user1                                    │
└────────────────────────┬─────────────────────────────────────────┘
                         │ Routes to Policy
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│    ENHANCED RBAC PERMISSION POLICY (Our Forked Plugin)           │
│    File: plugins/rbac-backend-ansible/src/policies/              │
│          permission-policy.ts                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  handle(request, user) {                                         │
│    1. Check if user is superuser → ALLOW                         │
│                                                                  │
│    2. Is catalog-entity READ permission?                         │
│       ├─► YES                                                    │
│       │   │                                                      │
│       │   ├─► Is LIST query (no entity object)?                  │
│       │   │   └─► Call getAAPConditionalDecision() ──┐           │
│       │   │                                          |           │
│       │   └─► Is INDIVIDUAL entity check?            │           │
│       │       └─► Has AAP annotation?                │           │
│       │           └─► Call checkAAPAccess() ─────────┤           │
│       │                                               │          │
│       └─► NO                                          │          │
│           └─► Continue to Normal RBAC ──────────── ┐   │          │
│  }                                                 │  │          │
└────────────────────────────────────────────────────┼──┼──────────┘
                                                     │  │
                    ┌────────────────────────────────┘  │
                    │                                   │
                    ▼                                   ▼
┌─────────────────────────────────────┐  ┌────────────────────────┐
│  NORMAL RBAC LOGIC                  │  │  AAP INTEGRATION       │
│  (User-created entities)            │  │  (External entities)   │
├─────────────────────────────────────┤  ├────────────────────────┤
│                                     │  │                        │
│  1. Check user roles                │  │  1. AAP Token Lookup   │
│  2. Check permissions               │  │     Service            │
│  3. Check conditional policies      │  │     │                  │
│  4. Return ALLOW/DENY/CONDITIONAL   │  │     ▼                  │
│                                     │  │  2. Query Session DB   │
└─────────────────────────────────────┘  │     (auth database)    │
                                         │     │                  │
                                         │     ▼                  │
                                         │  3. Get AAP OAuth      │
                                         │     Token              │
                                         │     │                  │
                                         │     ▼                  │
                                         │  4. Query AAP API      │
                                         │     /job_templates     │
                                         │     │                  │
                                         │     ▼                  │
                                         │  5. Get Accessible IDs │
                                         │     [11, 9, 10]        │
                                         │     │                  │
                                         │     ▼                  │
                                         │  6. Return Decision:   │
                                         │     - CONDITIONAL       │
                                         │       (anyOf IDs)      │
                                         │     - ALLOW/DENY       │
                                         └────────────────────────┘
```

### AAP Integration Flow for List Queries

This is the primary use case where users query the catalog:

```
GET /api/catalog/entities?filter=kind=template
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│  getAAPConditionalDecision(userEntityRef, permission)      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. aapTokenLookup.getTokenByUserEntityRef('user:default/user1')
│     │                                                      │
│     ▼                                                      │
│     Query: SELECT sess FROM sessions                       │
│            WHERE sess LIKE '%user:default/user1%'         │
│            AND expired > NOW()                            │
│     │                                                      │
│     ▼                                                      │
│     Returns: { accessToken: "abc123...", expiresAt: "..." }
│                                                            │
│  2. aapService.getResourceData('job_templates', token)    │
│     │                                                      │
│     ▼                                                      │
│     HTTP GET: https://aap.example.com/api/controller/v2/  │
│               job_templates/?organization=1-org           │
│     Authorization: Bearer abc123...                       │
│     │                                                      │
│     ▼                                                      │
│     AAP Response: { results: [                            │
│                     { id: 11, name: "Template 1" }        │
│                   ]}                                       │
│                                                            │
│  3. Extract accessible IDs: [11]                          │
│                                                            │
│  4. Create Conditional Decision:                          │
│     createCatalogConditionalDecision(permission, {        │
│       anyOf: [                                             │
│         hasAnnotation({                                    │
│           annotation: 'ansible.com/aapJobTemplateId',     │
│           value: '11'                                      │
│         })                                                 │
│       ]                                                    │
│     })                                                     │
│     │                                                      │
│     ▼                                                      │
│     Returns: CONDITIONAL decision                         │
└────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│  CATALOG BACKEND - Applies Conditional Filter              │
│  SELECT * FROM catalog_entities                            │
│  WHERE kind = 'Template'                                   │
│    AND annotations->>'ansible.com/aapJobTemplateId' IN ('11')
│                                                            │
│  Returns: 1 template (not all 3)                           │
└────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│  RESPONSE TO BROWSER                                       │
│  Status: 200 OK                                            │
│  Body: Only 1 template (filtered by AAP RBAC)              │
└────────────────────────────────────────────────────────────┘
```

### Session and Token Management

Backstage supports database-backed session storage through the `express-session` middleware with `connect-session-knex` as the session store. When configured, sessions are persisted to the same database used by Backstage, managed through the `KnexSessionStore`.

Configuration is enabled via `app-config.yaml`:

```yaml
auth:
  session:
    secret: ${AUTH_SESSION_SECRET}
```

When the session secret is provided, Backstage automatically:
- Creates a `sessions` table in the auth plugin's database
- Uses `KnexSessionStore` to persist session data as JSON
- Manages session expiry and cleanup
- Stores session ID in HTTP-only cookies

References:
- Backstage auth configuration: https://backstage.io/docs/auth/
- Session store implementation: `@backstage/backend-defaults` package
- Session table managed by: `connect-session-knex` npm package

The system stores OAuth tokens in these database-backed sessions:

```
┌──────────────────────────────────────────────────────────────┐
│  USER AUTHENTICATION (Login with AAP)                        │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  AAP AUTH PROVIDER                                           │
│  File: auth-backend-module-rhaap-provider/authenticator.ts   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  authenticate(input) {                                       │
│    1. Call AAP OAuth /o/token/                              │
│    2. Get access_token from AAP                             │
│    3. Fetch user profile → username: "user1"                │
│    4. Store in session:                                     │
│       storeAAPToken(req, access_token, {                    │
│         username: "user1",                                  │
│         expiresAt: "2026-01-12T..."                         │
│       })                                                     │
│       │                                                      │
│       ▼                                                      │
│       Converts to:                                          │
│       {                                                      │
│         aapToken: {                                         │
│           accessToken: "abc123...",                         │
│           userEntityRef: "user:default/user1",             │
│           storedAt: "2026-01-11T...",                       │
│           expiresAt: "2026-01-12T..."                       │
│         }                                                    │
│       }                                                      │
│  }                                                           │
└───────────────────────┬──────────────────────────────────────┘
                        │ Saves to DB
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  AUTH DATABASE (Backstage session store)                     │
│  Database: Configured in app-config.yaml                     │
│  (SQLite, PostgreSQL, MySQL, etc.)                           │
│                                                              │
│  Table: sessions                                            │
│  ┌────────┬────────────────────────┬─────────────────────┐ │
│  │  sid   │        sess (JSON)     │     expired         │ │
│  ├────────┼────────────────────────┼─────────────────────┤ │
│  │ sess1  │ { aapToken: {          │ 2026-01-12 05:00:00 │ │
│  │        │   accessToken: "...",  │                     │ │
│  │        │   userEntityRef:       │                     │ │
│  │        │   "user:default/user1",│                     │ │
│  │        │   expiresAt: "..."     │                     │ │
│  │        │ }}                     │                     │ │
│  └────────┴────────────────────────┴─────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                        │
                        │ Later, when permission check happens...
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  AAP TOKEN LOOKUP SERVICE                                    │
│  File: backstage-rhaap-common/src/AAPTokenLookup/            │
│        aapTokenLookup.ts                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  getTokenByUserEntityRef('user:default/user1') {            │
│    1. Query database:                                       │
│       SELECT sess FROM sessions                             │
│       WHERE expired > NOW()                                 │
│       ORDER BY expired DESC                                 │
│       LIMIT 100                                             │
│                                                              │
│    2. Parse each session (JSON)                             │
│    3. Filter by userEntityRef match                         │
│    4. Check token not expired                               │
│    5. Return: { accessToken, expiresAt }                    │
│  }                                                           │
└──────────────────────────────────────────────────────────────┘
                        │
                        │ Token retrieved
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  ENHANCED RBAC POLICY - getAAPConditionalDecision()         │
│  (Handles List Queries)                                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Get user's AAP token                                     │
│  2. Query AAP API:                                          │
│     GET https://aap.example.com/api/controller/v2/          │
│         job_templates/?organization=1-org                   │
│     Authorization: Bearer <user's_token>                    │
│     │                                                        │
│     ▼                                                        │
│  3. AAP Response:                                           │
│     { results: [{ id: 11, name: "1-file-operations" }] }   │
│                                                              │
│  4. Extract accessible IDs: [11]                            │
│                                                              │
│  5. Create Conditional Decision:                            │
│     {                                                        │
│       result: "CONDITIONAL",                                │
│       pluginId: "catalog",                                  │
│       resourceType: "catalog-entity",                       │
│       conditions: { anyOf: [...] }                          │
│     }                                                        │
└───────────────────────┬──────────────────────────────────────┘
                        │ Returns CONDITIONAL decision
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  BACKSTAGE PERMISSION FRAMEWORK                              │
│  Returns decision to Catalog Backend                         │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  CATALOG BACKEND - Apply Conditional Filter                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Original Query:                                            │
│    SELECT * FROM catalog_entities WHERE kind = 'Template'   │
│                                                              │
│  Modified with Conditional Filter:                          │
│    SELECT * FROM catalog_entities                           │
│    WHERE kind = 'Template'                                  │
│      AND (                                                   │
│        annotations->>'ansible.com/aapJobTemplateId' = '11'  │
│        -- Only templates user1 can access in AAP            │
│      )                                                       │
│                                                              │
│  Result: 1 template returned (only what user1 can access)   │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  RESPONSE TO BROWSER                                         │
│  Status: 200 OK                                              │
│  Body: [                                                     │
│    {                                                         │
│      kind: "Template",                                       │
│      metadata: {                                             │
│        name: "1-file-operations",                           │
│        annotations: {                                        │
│          "ansible.com/aapJobTemplateId": "11"               │
│        }                                                     │
│      }                                                       │
│    }                                                         │
│  ]                                                           │
│                                                              │
│  User1 only sees 1 template (AAP RBAC enforced)             │
└──────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### Components Created

#### 1. Enhanced RBAC Plugin

Fork `@backstage-community/plugin-rbac-backend` and create `@ansible/plugin-rbac-backend-ansible`.

Location: `plugins/rbac-backend-ansible/`

**A. Permission Policy** (`src/policies/permission-policy.ts`)

Imports to be added:
```typescript
import { Entity } from '@backstage/catalog-model';
import { IAAPService, IAAPTokenLookup } from '@ansible/backstage-rhaap-common';
import {
  createCatalogConditionalDecision,
  catalogConditions,
} from '@backstage/plugin-catalog-backend/alpha';
```

Class properties to be added:
```typescript
export class RBACPermissionPolicy implements PermissionPolicy {
  // External system integration services
  private readonly aapService?: IAAPService;
  private readonly aapTokenLookup?: IAAPTokenLookup;
  private readonly logger: LoggerService;
  
  // Cache: stores list of accessible template IDs per user to reduce AAP API calls
  // Key: userEntityRef (e.g., "user:default/user1")
  // Value: { templateIds: [11, 9, 10], expiresAt: timestamp }
  private readonly accessCache = new Map<string, { 
    templateIds: Set<number>; 
    expiresAt: number 
  }>();
  private readonly cacheTTLMs = 60000;  // Cache duration: 1 minute
  
  // ... existing RBAC properties
}
```

Constructor modification to accept AAP services:
```typescript
private constructor(
  logger: LoggerService,
  private readonly enforcer: EnforcerDelegate,
  private readonly auditor: AuditorService,
  private readonly conditionStorage: ConditionalStorage,
  preferPermissionPolicy: boolean,
  superUserList?: string[],
  aapService?: IAAPService,           // Optional AAP service for external checks
  aapTokenLookup?: IAAPTokenLookup,   // Optional token lookup service
) {
  this.logger = logger;
  this.aapService = aapService;
  this.aapTokenLookup = aapTokenLookup;
  // ... existing initialization
}
```

Enhanced handle() method implementation:
```typescript
async handle(request: PolicyQuery, user?: PolicyQueryUser): Promise<PolicyDecision> {
  // Existing: Superuser check returns ALLOW immediately
  // ... superuser check ...
  
  // NEW: Check for external system entities before normal RBAC
  if (isResourcePermission(request.permission, 'catalog-entity') &&
      request.permission.attributes?.action === 'read') {
    
    const entity = (request as any).resource as Entity | undefined;
    
    // Case 1: List query (no entity object) - return conditional decision
    if (!entity) {
      const aapConditionalDecision = await this.getAAPConditionalDecision(
        userEntityRef,
        request.permission as ResourcePermission<'catalog-entity'>,
        auditorEvent,
      );
      if (aapConditionalDecision) {
        return aapConditionalDecision;  // Database-level filtering
      }
    } 
    // Case 2: Individual entity check - return direct ALLOW/DENY
    else if (entity.metadata.annotations?.['ansible.com/aapJobTemplateId']) {
      const aapDecision = await this.checkAAPAccess(userEntityRef, entity, auditorEvent);
      if (aapDecision) {
        return aapDecision;  // Direct decision for single entity
      }
    }
  }
  
  // Existing: Continue with normal RBAC logic for non-external entities
  // ... normal RBAC checks ...
}
```

New method for handling catalog list queries:
```typescript
private async getAAPConditionalDecision(
  userEntityRef: string,
  permission: ResourcePermission<'catalog-entity'>,
  auditorEvent: AuditorServiceEvent,
): Promise<PolicyDecision | null> {
  // Skip if AAP services not configured
  if (!this.aapService || !this.aapTokenLookup) {
    return null;
  }

  // Step 1: Lookup user's AAP OAuth token from session database
  const tokenData = await this.aapTokenLookup.getTokenByUserEntityRef(userEntityRef);
  
  if (!tokenData?.accessToken) {
    // No token found - block all AAP templates, allow other entities
    return createCatalogConditionalDecision(permission, {
      not: catalogConditions.hasAnnotation({
        annotation: 'ansible.com/aapJobTemplateId',
      }),
    });
  }

  try {
    // Step 2: Query AAP API with user's token to get accessible templates
    const aapResponse = await this.aapService.getResourceData(
      'job_templates',
      tokenData.accessToken,
    );

    // Step 3: Extract accessible template IDs
    const accessibleIds = new Set<number>(
      (aapResponse?.results || []).map((template: { id: number }) => template.id),
    );

    if (accessibleIds.size === 0) {
      // User has no templates - block all AAP templates
      return createCatalogConditionalDecision(permission, {
        not: catalogConditions.hasAnnotation({
          annotation: 'ansible.com/aapJobTemplateId',
        }),
      });
    }

    // Step 4: Create conditional decision that filters by accessible IDs
    // This allows database-level filtering: WHERE aapJobTemplateId IN (accessible IDs)
    const conditions = Array.from(accessibleIds).map(id =>
      catalogConditions.hasAnnotation({
        annotation: 'ansible.com/aapJobTemplateId',
        value: String(id),
      }),
    );

    return createCatalogConditionalDecision(permission, {
      anyOf: conditions as any,  // Show only templates user can access
    });
  } catch (error) {
    // Fail-safe: On error, block all AAP templates
    return createCatalogConditionalDecision(permission, {
      not: catalogConditions.hasAnnotation({
        annotation: 'ansible.com/aapJobTemplateId',
      }),
    });
  }
}
```

New method for individual entity access checks:
```typescript
private async checkAAPAccess(
  userEntityRef: string,
  entity: Entity,
  auditorEvent: AuditorServiceEvent,
): Promise<PolicyDecision | null> {
  // Skip if AAP services not configured
  if (!this.aapService || !this.aapTokenLookup) {
    return null;
  }

  // Extract template ID from entity annotation
  const templateIdStr = entity.metadata.annotations?.['ansible.com/aapJobTemplateId'];
  const templateId = parseInt(templateIdStr!, 10);

  // Check cache first to avoid repeated AAP API calls
  const cached = this.accessCache.get(userEntityRef);
  if (cached && cached.expiresAt > Date.now()) {
    const hasAccess = cached.templateIds.has(templateId);
    return { result: hasAccess ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
  }

  // Cache miss - lookup token and query AAP
  const tokenData = await this.aapTokenLookup.getTokenByUserEntityRef(userEntityRef);
  if (!tokenData) {
    return { result: AuthorizeResult.DENY };  // No token, deny access
  }

  try {
    // Query AAP API with user's token
    const aapResponse = await this.aapService.getResourceData(
      'job_templates',
      tokenData.accessToken,
    );

    // Build set of accessible template IDs
    const accessibleIds = new Set<number>(
      (aapResponse?.results || []).map((template: { id: number }) => template.id),
    );

    // Store in cache for 1 minute
    this.accessCache.set(userEntityRef, {
      templateIds: accessibleIds,
      expiresAt: Date.now() + this.cacheTTLMs,
    });

    // Check if requested template is in accessible set
    const hasAccess = accessibleIds.has(templateId);
    return { result: hasAccess ? AuthorizeResult.ALLOW : AuthorizeResult.DENY };
  } catch (error) {
    // Fail-safe: deny access on error
    return { result: AuthorizeResult.DENY };
  }
}
```

**B. Policy Builder** (`src/service/policy-builder.ts`)

Modified to accept and pass AAP services:

```typescript
export type EnvOptions = {
  // ... existing properties
  aapService?: IAAPService;
  aapTokenLookup?: IAAPTokenLookup;
};
```

Updated policy instantiation:
```typescript
env.policy.setPolicy(
  await RBACPermissionPolicy.build(
    env.logger,
    env.auditor,
    env.config,
    conditionalStorage,
    enforcerDelegate,
    roleMetadataStorage,
    databaseClient,
    pluginMetadataCollector,
    env.auth,
    env.aapService,        // NEW
    env.aapTokenLookup,    // NEW
  ),
);
```

**C. Plugin Module** (`src/plugin.ts`)

Added dependency injection:

```typescript
import {
  ansibleServiceRef,
  AAPTokenLookup,
} from '@ansible/backstage-rhaap-common';
import { DatabaseManager } from '@backstage/backend-defaults/database';

export const rbacPlugin = createBackendModule({
  pluginId: 'permission',
  moduleId: 'rbac',
  register(env) {
    env.registerInit({
      deps: {
        // ... existing deps
        ansibleService: ansibleServiceRef,  // NEW
      },
      async init({ /* ... */, ansibleService }) {
        // Create AAP token lookup service
        const databaseManager = DatabaseManager.fromConfig(config);
        const authDatabase = databaseManager.forPlugin('auth', { 
          logger, 
          lifecycle 
        });
        
        const aapTokenLookup = await AAPTokenLookup.create({
          database: authDatabase,
          logger,
        });

        // Pass to PolicyBuilder
        await PolicyBuilder.build(
          {
            // ... existing options
            aapService: ansibleService,
            aapTokenLookup,
          },
          // ...
        );
      },
    });
  },
});
```

#### 2. OAuth Session Storage

Location: `plugins/backstage-rhaap-common/src/OAuthSessionTokens/oAuthSessionTokens.ts`

Utility functions will be created for storing and retrieving OAuth tokens from sessions:

```typescript
// Data structure stored in session
export interface AAPTokenData {
  accessToken: string;
  storedAt: string;
  expiresAt?: string;
  userEntityRef?: string;  // Key for permission policy lookup
}

// Store token in database-backed session
export function storeAAPToken(
  req: RequestWithAAPSession,
  accessToken: string,
  options: { username: string; expiresAt?: string },
): boolean {
  // Convert username to Backstage entity reference format
  // Example: "user1" → "user:default/user1"
  const userEntityRef = stringifyEntityRef({
    kind: 'User',
    namespace: 'default',
    name: options.username,
  });

  // Store in session (persisted to database by KnexSessionStore)
  req.session.aapToken = {
    accessToken,
    storedAt: new Date().toISOString(),
    expiresAt: options.expiresAt,
    userEntityRef,  // Critical: enables lookup by identity
  };

  return true;
}
```

#### 3. AAP Token Lookup Service

Location: `plugins/backstage-rhaap-common/src/AAPTokenLookup/aapTokenLookup.ts`

The permission policy receives only user identity, not the HTTP request or session. This service retrieves OAuth tokens from the session database using the user's entity reference.

Planned implementation:
```typescript
export class AAPTokenLookup implements IAAPTokenLookup {
  async getTokenByUserEntityRef(userEntityRef: string): Promise<AAPTokenLookupResult | null> {
    // Query database for active sessions, ordered by freshest first
    // SELECT sess FROM sessions WHERE expired > NOW() ORDER BY expired DESC LIMIT 100
    const sessions = await this.queryActiveSessions();
    
    // Parse each session and find matching userEntityRef
    // Note: A user may have multiple active sessions (different browsers, devices)
    // We iterate through all sessions and return the first valid token found
    for (const session of sessions) {
      const data = JSON.parse(session.sess);
      
      // Check if session contains token for this user
      if (data.aapToken?.userEntityRef === userEntityRef) {
        // Validate token not expired
        if (isTokenValid(data.aapToken)) {
          return data.aapToken;  // Return: { accessToken, expiresAt, ... }
        }
        // Continue to next session if token expired
      }
    }
    
    return null;  // No valid token found across any session
  }
}
```

Handling multiple concurrent sessions: When a user is logged in from multiple browsers or devices, each session stores its own separate AAP OAuth token (different tokens issued by AAP for each login). The lookup service queries all active sessions and returns the first valid token found (sessions ordered by expiry DESC, so freshest first).

Important: While these are different OAuth tokens (token A from Chrome, token B from Firefox), they are all issued to the same AAP user account. AAP's RBAC is user-based, not token-based. Therefore, all tokens for the same user have identical permissions in AAP. When checking if User1 can access template 11, it doesn't matter which of User1's active tokens we use, they all query AAP's API as the same user and return the same accessible templates.

Example:

- User1 logs in from Chrome: AAP issues token A, stored in Chrome's session
- User1 logs in from Firefox: AAP issues token B, stored in Firefox's session  
- Permission check from Chrome: May use token A or token B from lookup
- Result: Both tokens query AAP as User1, both return template 11 as accessible

The lookup strategy prioritizes the freshest token (most recently refreshed) to minimize the chance of using an expired token, but functionally any valid token for the user is equivalent.

The implementation will be database-agnostic, using Knex queries that work with any configured database backend (SQLite, PostgreSQL, MySQL).

#### 4. Auth Provider Integration

Location: `plugins/auth-backend-module-rhaap-provider/src/authenticator.ts`

The AAP auth provider will be modified to store OAuth tokens in the session during authentication:

```typescript
async authenticate(input, context) {
  // Step 1: Complete OAuth flow with AAP
  const result = await aapService.rhAAPAuthenticate(context);
  
  // Step 2: Fetch user profile to get username
  const fullProfile = await aapService.fetchProfile(result.session.accessToken);

  // Step 3: Store token in database-backed session
  if (fullProfile.username) {
    storeAAPToken(input.req, result.session.accessToken, {
      username: fullProfile.username,                    // Converts to userEntityRef
      expiresAt: calculateExpiry(result.session.expiresInSeconds),
    });
  }

  return { ...result, fullProfile };
}

// Similar updates for refresh() to update token on renewal
// Add logout() to clean up: removeAAPToken(input.req)
```

#### 5. Entity Annotation

Location: `plugins/catalog-backend-module-rhaap/src/providers/dynamicJobTemplate.ts`

Job template entities will include an annotation to identify them as AAP-sourced:

```typescript
metadata: {
  namespace: nameSpace,
  name: formatEntityName(job.name),
  title: job.name,
  description: job.description,
  annotations: {
    [ANNOTATION_LOCATION]: `url:${baseUrl}/...`,
    [ANNOTATION_ORIGIN_LOCATION]: `url:${baseUrl}/...`,
    'ansible.com/aapJobTemplateId': String(job.id),  // Identifies AAP templates for permission filtering
  },
}
```

This annotation enables the permission policy to identify AAP entities and apply external system RBAC checks.

#### 6. Configuration

Configuration changes required in `app-config.yaml`:

```yaml
auth:
  session:
    secret: ${AUTH_SESSION_SECRET}  # Enables database-backed sessions

backend:
  database:
    client: better-sqlite3  # Or postgresql, mysql
    connection:
      directory: ./.backstage-db  # Persistent storage
```

Backend module configuration in `packages/backend/src/index.ts`:
```typescript
// Load base permission backend first
backend.add(import('@backstage/plugin-permission-backend'));

// Then load enhanced RBAC with AAP integration
backend.add(import('@ansible/plugin-rbac-backend-ansible'));
```

---

## How It Works

When users access the catalog, the enhanced RBAC policy intercepts permission checks for catalog entities. For list queries without entity objects, it queries AAP with the user's OAuth token and returns a conditional decision that filters results at the database level. For individual entity requests, it checks the cache or queries AAP and returns allow/deny directly.

Superusers bypass external checks and see all content. User-created entities without external annotations follow normal RBAC rules configured via the UI.

---

## Benefits

Consistent permission enforcement across all catalog endpoints with AAP as the single source of truth. Administrators manage permissions in AAP only, without duplicate rules in Backstage.

Database-level filtering via conditional decisions provides efficient query performance even with large catalogs. The 1-minute cache reduces AAP API calls for repeated queries.

RBAC UI remains fully functional for managing permissions on user-created Backstage entities. The architecture supports future GitHub and GitLab integration using the same pattern.

OAuth token management is transparent to users with automatic refresh and persistence across pod restarts.

---

## Future Work

### GitHub and GitLab Integration

The same pattern will extend to GitHub repository and GitLab project discovery:

Implementation approach:

1. Create wrapper modules for standard auth providers (GitHub/GitLab)
   - Cannot modify Backstage's standard providers directly
   - Create thin wrapper that intercepts authenticate/refresh methods
   - Store tokens in session using same infrastructure as AAP

2. Token storage during authentication
   ```typescript
   // Wrapper intercepts standard provider
   async authenticate(input, ctx) {
     const result = await standardGitHubAuthenticator.authenticate(input, ctx);
     
     // Store token in session
     storeGitHubToken(input.req, result.session.accessToken, {
       username: result.fullProfile.username,
       expiresAt: calculateExpiry(result.session.expiresInSeconds),
     });
     
     return result;
   }
   ```

3. Add annotations during repository/project discovery: `github.com/project-slug`, `gitlab.com/project-slug`

4. Implement permission checks in enhanced RBAC policy:
   - `checkGitHubAccess()` and `getGitHubConditionalDecision()`
   - `checkGitLabAccess()` and `getGitLabConditionalDecision()`

5. Query external APIs with user's token: 
   - GitHub: `GET /repos/:owner/:repo`
   - GitLab: `GET /projects/:id`

This wrapper approach preserves compatibility with standard Backstage providers while adding token storage capability.

### Performance Optimizations

Future improvements to consider:

* Adjust cache duration (currently 1 minute) based on observed AAP API latency
* Add automatic backoff when AAP API is unavailable (temporarily stop querying AAP if multiple failures detected, preventing timeout delays)
* Add metrics and monitoring for AAP query performance

---

## Security Considerations

### Token Storage and Access Control

OAuth tokens are stored in database-backed sessions managed by Backstage's `KnexSessionStore`. The session secret (configured via `AUTH_SESSION_SECRET`) is used to sign and encrypt session cookies, preventing session forgery and tampering.

Token isolation is enforced at multiple levels:
- Session cookies are HTTP-only and secure (HTTPS-only in production)
- Each session is uniquely identified by session ID
- Tokens are stored with the associated `userEntityRef` 
- Token lookup requires exact userEntityRef match
- No cross-user token access is possible

The AAPTokenLookup service implements the following security measures:
- Queries only non-expired sessions (expired sessions are excluded)
- Validates token expiry before returning
- Limits query to 100 most recent sessions to prevent DoS
- Returns null on any error (fail-safe behavior)
- Does not log token values (only metadata like expiry times)

### Database Security

Session data is stored in the auth plugin's database with the following protections:
- Database access restricted to Backstage backend processes only
- Session table contains JSON blobs, no plaintext token fields in schema
- Database-level encryption at rest (if configured at infrastructure level)
- Regular session cleanup via expiry mechanism prevents stale data accumulation

The sessions table structure prevents enumeration attacks:
- Session IDs are cryptographically random
- No user-identifiable information in session ID
- userEntityRef is embedded in JSON, not indexed (prevents targeted queries from outside application)

### Permission Check Security

The enhanced RBAC policy implements defense-in-depth:

Fail-safe behavior on errors:
- If AAP token lookup fails: deny access to AAP templates
- If AAP API call fails: deny access to AAP templates
- If token is expired: deny access to AAP templates
- Non-AAP entities remain accessible (graceful degradation)

Superuser checks occur first, preventing unnecessary external API calls for privileged users.

All permission decisions are audited via Backstage's audit logging framework, creating an audit trail for compliance and security reviews.

### Token Lifecycle Management

Token security throughout the lifecycle:

On login/authentication:
- Tokens stored only after successful AAP OAuth flow
- User identity validated before token storage
- Token expiry calculated and stored with token

During use:
- Tokens retrieved only when needed for permission checks
- Cache reduces token exposure (1-minute TTL)
- No token values in log messages

On token refresh:
- Old token replaced atomically in session
- Refresh handled by Backstage OAuth framework
- No gap in authorization during refresh

On logout:
- Token explicitly removed from session via `removeAAPToken()`
- Session invalidated
- No orphaned tokens remain

### Preventing Common Vulnerabilities

Session fixation: Prevented by Backstage's session management (new session ID on authentication)

Session hijacking: Mitigated by secure, HTTP-only cookies and HTTPS enforcement in production

Token leakage: Tokens never exposed in URLs, logs, or error messages

Replay attacks: Session expiry and token expiry limit replay window

Privilege escalation: Superuser list is configuration-based, not runtime modifiable

DoS via session flooding: Query limit of 100 sessions prevents unbounded database queries

### Security Review Checklist

For product security review, the following has been implemented:

- OAuth token storage uses industry-standard session management
- No custom crypto implementations (relies on Backstage framework)
- Fail-safe error handling (deny on error)
- Token isolation prevents cross-user access
- Audit logging for all permission decisions
- Session expiry and cleanup mechanisms
- No sensitive data in logs or error messages
- Database access restricted to backend only
- HTTPS enforcement in production configurations
- Regular security dependency updates via Backstage upstream

---

## Alternatives Considered

Client-side filtering only: Simple but allows API bypass.

Periodic RBAC sync from AAP: Not real-time, requires duplicate rule management.

Custom permission policy without RBAC: Loses RBAC UI functionality.

Middleware response filter: Inefficient, doesn't protect all endpoints, bypasses audit logging.

Conditional entity provider: Doesn't scale for multi-user scenarios, complex cache invalidation.

---

## Success Criteria

All catalog endpoints consistently enforce AAP RBAC permissions. RBAC UI operational for user-created entity management.

Performance targets: Less than 100ms latency for cached queries, less than 1 second for uncached AAP API calls.

No administrator training required. Solution is transparent to end users.

---

## Conclusion

The enhanced RBAC plugin provides consistent permission enforcement for external system content while maintaining Backstage RBAC UI for user-created entities. The key innovation is using conditional decisions for database-level filtering based on real-time AAP queries.

The architecture establishes a pattern for external system integration that will extend to GitHub and GitLab discovery features. AAP remains the single source of truth for job template permissions, eliminating duplicate rule management.
