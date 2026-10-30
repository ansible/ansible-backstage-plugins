# Portal backend authorization inventory

## Scope and review status

This document describes how Portal backend requests and background tasks are authorized. It records existing checks, identifies boundaries that need further review, and proposes changes with acceptance examples. It is intended for contributors reviewing or extending backend integrations. Proposed changes are not implemented policy.

The source baseline is `88950e3091a878cd2dacbd840aa63248a7aaf121` on 2026-10-29. References below are pinned to that baseline. Registration in a package does not prove installation in every deployment. The [source backend composition][composition] installs the AAP catalog, auth, user-provisioner, AAP scaffolder, APME catalog, automation-content and Portal operation backends. The APME scaffolder action is also inventoried as a separately installable transport.

The inventory covers repository-owned interactive mutations, work launches, credential-backed reads related to those effects, alternate transports, and automatic catalog/AAP/APME/content work. It includes reads alongside writes to avoid classifying a route solely by its HTTP method. Upstream Backstage task submission, catalog processing, OAuth endpoints and generic publish actions remain platform boundaries. Their deployment policies and downstream AAP, SCM and APME gateway policies need separate verification. Frontend visibility is never evidence of backend authorization.

Evidence is a source trace, not a live penetration test or an assertion that a deployed instance is exploitable. An AST-assisted route/action/scheduler discovery was followed by tracing handlers, module registration and credential use. Startup hooks, sign-in provisioning, action callbacks and shared scheduler helpers were inspected separately.

The discovery pass identified 73 HTTP route declarations, nine scaffolder action declarations and 12 scheduler/helper call sites in the AAP, APME, content, Portal operations and Portal health backend packages. These counts are coverage aids, not 94 independent authorization boundaries. Router mounts and auth-policy declarations are not counted as additional HTTP routes. The grouped entries below enumerate those routes and trace the effects behind shared helpers.

The proposals are open for maintainer and community review. Review should cover the affected catalog providers, scaffolder actions, authentication integration, APME integration and content backend. Existing organization resolution, entitlement checks and resource guards remain part of the baseline. Package restructuring is outside the scope of this document.

## Reading the inventory

This document uses AAP for Ansible Automation Platform, EE for execution environment, and SCM for source control management. APME refers to the integration implemented in `workspaces/apme`. A principal is an authenticated user or service identity. A guard is a backend check that permits or rejects an action. An entitlement determines whether a capability is available within its declared scope.

Entries use local identifiers: I-01 through I-12 describe interactive boundaries, B-01 through B-06 describe background execution, and F-01 through F-07 describe proposed follow-up changes. Each entry names its entry points, effect, principal, checks, scope, entitlement and enablement behavior, and proposed disposition. Paths under the AAP and APME catalog routers have the prefix `/api/catalog`. Content routes have `/api/automation-content`. Portal operation routes have `/api/portal-operations`. AAP auth routes have `/api/auth`.

“Implemented guard” means a specific check was found. It does not mean all policy decisions for that path are complete. “Guard gap” means the traced handler lacks an identified check needed to bind an effect to its caller or resource. “Policy decision” means the intended authority must first be agreed. All entries retain backend authentication defaults unless an explicit exception is described.

An organization membership from the trusted resolver is an AAP organization identity. A repository's SCM organization, catalog owner annotation or user namespace is not. Git repositories are shared resources. Do not add artificial organization ownership to make them pass the dispatcher.

## Implemented interactive boundaries

### I-01: Portal operation dispatcher

**Entry points:** `POST /:operationId` and `GET /context`. The entitlement query is `GET /entitlements/:entitlementId`.

**Principal and checks:** The [HTTP operation router][operation-router] requires a user, restricts the request envelope and body size, and supplies a server-resolved context. The [dispatcher][dispatcher] checks REST exposure, trusted organization memberships, declared permission with an ALLOW decision, input schema, required entitlements and output schema. Organization-scoped execution rejects ambiguous organization context. Shared operations can use multiple trusted memberships. A caller-supplied subject is not itself resource authorization.

**Scope and gates:** Required entitlements come from the registered descriptor. Membership and entitlement organization matching are enforced centrally. Handler registration and descriptor exposure control availability. The [identity middleware][identity-middleware] alone does not reject missing context and must not be treated as a guard.

**Disposition:** Preserve these guarantees. Handlers still own resource access and downstream credential choice. Log-based execution audit is present, but is not durable job ownership, cancellation or a scheduler policy.

### I-02: APME registered operations and compatibility transports

**Operations:** `apme.repository.register`, `apme.repository.deregister`, `apme.quality.scan`. [Descriptors][apme-descriptors] declare shared scope and distinct mutation permissions. Only quality scan declares `apme.scanning` as a required entitlement. Do not silently add that entitlement to registration or deregistration.

**Resource checks:** [Registration][register-operation] binds the subject to the authenticated user, checks HTTPS/configured SCM host and repository metadata, verifies repository accessibility through the SCM client, and checks catalog duplicates using caller credentials. This is not proof of personal SCM access when the factory selects a configured integration credential. F-04 proposes clarifying which credentials may establish repository access.

The [scan and deregister handlers][apme-operations] require ALLOW for catalog entity read, load the entity with an on-behalf-of catalog token, and check entity type. Scan resolves repository URL and branch, checks tracking before dispatch and launches the gateway scan. Deregistration requires a manual registration annotation and removes Portal tracking. It does not delete the shared gateway project or cancel running work.

**Alternate transports:** `POST /apme/repositories` in the [manual router][manual-router] resolves the user context and delegates to the registration operation. The [APME scaffolder action][apme-action] `ansible:register:git-repository` obtains initiator credentials, requires a user and delegates to the same operation. Neither is a separate unguarded registration implementation.

**Gates:** [APME module initialization][apme-module] returns before router, operation and scheduler registration when APME is disabled. Frontend configuration is additional presentation behavior, not enforcement.

The configuration key is `ansible.apme.enabled`. An older module log message uses the shorter `apme.enabled` name, which is not the configuration path to change.

### I-03: APME workflow forwarding

**Entry points:** `ALL /apme/projects/:projectId/operation`, `ALL /apme/projects/:projectId/operation/*`, and legacy `POST /apme/projects/:projectId/submit` in the [APME router][apme-router]. The wildcard includes streamed responses and future suffixes.

**Principal and checks:** All three call the [project authorizer][project-authorizer] before resolving integration SCM credentials. It requires a user with trusted organization context and matching `apme.scanning` entitlement. Non-GET/HEAD requests require `ansible.apme.quality.scan`. It resolves the gateway project to a repository and branch, queries catalog with caller credentials, requires a readable matching entity and excludes stopped tracking.

**Scope and gates:** Shared repository access is resolved through catalog visibility, not owner annotations or namespace tenancy. APME module enablement applies. The [proxy helper][operation-proxy] relies on the guarded caller and is not an independently authorized entry point.

**Disposition:** Preserve this boundary and regression coverage. The gateway contract must confirm that GET/HEAD suffixes never start work. If any do, classify effects explicitly and require the mutation permission for them. The Portal checks do not establish security of direct gateway access.

### I-04: AAP execution-environment deletion and build dispatch

**Entry points:** `DELETE /ansible/ee/:name` and `POST /ansible/ee/build` in the [AAP router][aap-router].

**Deletion:** User or service credentials are accepted. The handler loads the target with caller credentials, checks EE entity type and requires `catalog.entity.delete` ALLOW for that entity. Catalog mutations use the caller's token. A service-token query counts siblings to avoid deleting a shared location based on a filtered count. Provider-managed removal still passes the entity delete decision first. A missing entity produces a no-op response.

**Build:** User or permitted service credentials, EE view permission and catalog read checks precede dispatch. [Entity resolution][aap-helpers] loads the EE with an on-behalf-of token and derives the repository from its annotations. Host validation applies. Dispatch requires an explicit `X-Github-Token` or `X-Gitlab-Token`, rather than automatically using an integration token.

**Scope, entitlements and gates:** These are legacy routes without dispatcher organization/entitlement checks. No build-specific mutation permission is checked. Configured external-access subjects are used as a service filter, but an absent/empty filter accepts any service principal. EE provider registration and configured SCM hosts control availability.

**Disposition:** Keep deletion's resource guard. F-03 proposes explicit build authority and service caller policy. Do not describe these paths as having no authorization or remove DELETE while migrating POST registration.

## Remaining interactive boundaries

### I-05: APME project and suppression mutations

**Entry points and effects in the [APME router][apme-router]:**

- `PUT /apme/projects/:projectId/scan-target` writes the persisted target version for a project.
- `POST /apme/projects` validates the SCM repository/branch and creates a gateway project.
- `DELETE /apme/projects/:projectId` deletes a gateway project.
- `POST /apme/suppressions` creates a suppression from client-supplied rule and scope.
- `DELETE /apme/suppressions/:suppressionId` deletes a suppression.

**Current boundary:** Each requires a user. Branch validation and input validation are present where applicable. These handlers do not call the project authorizer or dispatcher and do not check an effect-specific permission, target catalog visibility or scanning entitlement. No trusted organization context is resolved here. The module-wide APME enablement gate still applies.

**Disposition:** Guard gap F-01. Project deletion must not reuse Portal deregistration semantics, since the gateway project can be shared. Global suppression administration also needs a separate policy from a project-scoped suppression. The presence of gateway service authentication does not bind these requests to the Portal user.

### I-06: APME settings and related reads

**Guarded administration:** The [settings edit middleware][settings-edit] requires a user and `ansible.settings.edit` ALLOW for capability resource `apme`. It protects:

- `PUT /apme/settings`.
- `POST /apme/settings/galaxy-servers`, `PATCH /apme/settings/galaxy-servers/:serverId`, `DELETE /apme/settings/galaxy-servers/:serverId`.
- `POST /apme/ai/config`, `POST /apme/ai/provider/:id/configure`, `DELETE /apme/ai/provider/:id`.
- `PUT /apme/rules/:ruleId/config`, `DELETE /apme/rules/:ruleId/config`.

These modify Portal settings or gateway configuration. Galaxy server, AI configuration and AI engine reads use the [settings view middleware][settings-view]. The general settings GET requires a user, without that capability check. This capability is global administration rather than an organization-owned project. There is no declared scanning entitlement on these routes. Decide that policy explicitly rather than applying the scan entitlement to every settings operation.

**Other authenticated reads:** `/apme/projects`, `/apme/projects/:projectId`, its `/violations`, `/dependencies`, `/activity`, `/scan-target`, `/apme/activity/:activityId`, `/apme/lookup`, `/apme/suppressions`, `/apme/repos/branch-check`, `/apme/rules`, `/apme/ai/status`, `/apme/ai/models` and `/apme/ai/providers` are GET routes. `/apme/settings`, `/apme/settings/galaxy-servers`, `/apme/ai/config` and `/apme/ai/engines` are the settings reads above. `/apme/health` requires a user and returns gateway health.

**Disposition:** Preserve settings guards. F-01 includes project/activity/suppression read scope, so denied users cannot obtain the same resource through a detail or lookup route after mutation guards are added. Confirm credential selection for branch validation under F-04. Health and global rule/model discovery need an explicit documented read policy, not mutation operation IDs.

### I-07: AAP manual synchronization

**Entry points:** `POST /ansible/sync/from-aap/orgs_users_teams`, `/ansible/sync/from-aap/job_templates`, `/ansible/sync/from-aap/content` and `/ansible/sync/from-scm/content` in the [AAP router][aap-router]. They trigger provider tasks or provider synchronization and therefore mutate catalog state even though their upstream work is mainly reads.

**Current boundary:** The [superuser helper][aap-helpers] requires the catalog user's `aap.platform/is_superuser` annotation, or accepts a service principal according to an optional subject filter. The [module][aap-module] derives that filter from `backend.auth.externalAccess[].options.subject`. An empty filter accepts any service principal. This is not a dedicated per-operation allowlist.

**Scope and gates:** Provider configuration, enabled sync blocks, repository/source selectors and scheduling state bound the available work. Configured AAP organizations and SCM source organizations serve different purposes. No dispatcher entitlement check or per-target user organization resolution occurs in these routes. `GET /ansible/sync/status` accepts a catalog read conditional decision other than DENY. `GET /health` is a health response.

**Disposition:** Policy decision F-03 for explicit service authority. User superuser checking is an implemented guard. F-05 addresses the authority of the scheduled task after a manual trigger.

### I-08: EE registration through service credentials

**Entry point:** `POST /ansible/ee` requires a service principal, validates that an entity was supplied, and calls the [EE provider][ee-provider]. The provider requires a name and EE type, then applies a catalog delta. There is no service-subject restriction or initiator/resource authorization at this endpoint.

**Alternate path:** `ansible:create:ee-definition` uses [own service credentials][ee-action] to POST a generated entity for the non-SCM experience. Its cleanup path instead uses initiator credentials and the guarded DELETE route. Skipped or failed best-effort cleanup is surfaced but does not prevent registration. A service-authenticated POST therefore does not demonstrate that the initiating user may create or replace the entity.

**Scope and gates:** No trusted organization context or entitlement is checked for registration. Entity owner input and the default namespace are not authority. Catalog/scaffolder module installation and provider connection enable the path.

**Disposition:** Guard gap F-02. Preserve both lifecycle routes and explicitly authorize replacement before an upsert. Treat background EE ingestion separately if it is added later.

### I-09: AAP credential-backed reads

**Entry points:** `GET /ansible/git/file-content` and `POST /ansible/git/ci-activity` in the [AAP router][aap-router]. The POST is a batch read, not a mutation.

**Current boundary:** File content requires any one of Git repository, EE or collection view permissions. CI activity requires Git repository view. Both require a catalog read conditional decision that is not DENY. They then use caller-supplied repository parameters without evaluating those catalog conditions against a target entity. The SCM factory/CI helpers can select configured integration credentials. CI helpers validate allowed hosts and bound the batch size. These checks do not establish caller visibility of each requested repository.

**Scope and gates:** No trusted organization context, entitlement or resource-to-repository binding is resolved. SCM integration configuration and its actual credential privileges limit downstream access, but do not substitute for Portal resource authorization.

**Disposition:** Guard gap F-04. Bind each request item to a caller-readable catalog resource before credential resolution and cache lookup. Keep non-catalog use, if required, behind an explicit independently authorized contract.

### I-10: AAP scaffolder actions and autocomplete

The [AAP scaffolder module][aap-scaffolder] registers eight actions. Upstream scaffolder task/action permission policy is an outer boundary. It is not evidence of a Portal entitlement, target resource check or trusted organization context inside an action.

- `rhaap:create-project`, `rhaap:create-job-template`, `rhaap:create-execution-environment`, `rhaap:clean-up` use the non-empty AAP token supplied in task input. AAP performs downstream authorization for that token. The actions do not bind its identity to the Portal initiator or independently evaluate Portal operation permissions.
- `rhaap:launch-job-template` launches using the input token. Its [polling helper][launch-action] can switch to `ansible.rhaap.token` for status, stdout and cancellation on abort. This is an explicit transition from user-supplied to configured service authority, not a second user operation.
- `ansible:content:create` invokes the configured creator service and writes generated files in the task workspace. It does not itself publish an SCM repository.
- `ansible:create:ee-definition` invokes the creator service, generates files and can register a catalog EE through I-08. Cleanup is described in I-08. Standard downstream publish steps are separate scaffolder actions.
- `ansible:prepare:publish` checks repository existence and derives output URLs/branch metadata through the SCM factory. It does not create the repository despite its name. The optional input token can fall back to integration credentials.

The `aap-api-cloud` [autocomplete provider][autocomplete] reads AAP resources with the provided token. Its controller availability probe can use the configured AAP token. Collection autocomplete uses an [own-service catalog token][autocomplete-utils] and a shared cache, without receiving initiator credentials in this provider contract.

**Scope and gates:** Module installation and the task's configured template flow determine availability. No per-action Portal entitlement or trusted organization context is resolved here. Supplied `owner`, token and SCM organization values must not be treated as trusted Portal organization identity.

**Disposition:** F-06 covers user action authorization and the polling transition. F-04 covers integration-backed and collection reads. Changes should preserve the action contracts while adding authorization checks.

### I-11: Automation-content manual refresh and reads

**Entry points:** `POST /sync`, `POST /registries/:name/poll`, `POST /registries/:name/sync` in the [content router][content-router]. These trigger registry requests and index/cache updates using configured registry connections. Polling can trigger a refresh after drift. Named-registry routes reject unknown names.

**Current boundary:** Backend default authentication applies. The handlers do not require a user specifically, check an explicit refresh permission, or resolve a trusted organization context/entitlement. Only `/health` is explicitly unauthenticated in the [plugin registration][content-plugin]. Registry configuration bounds the target list.

**Read/compute boundaries:** GET `/registries`, `/content`, `/content/:ref(*)`, `/content/:ref(*)/contents`, `/execution-environments`, `/execution-environments/:ref(*)`, `/execution-environments/:ref(*)/contents`, `/collections`, `/collections/:namespace/:name`, `/content-items`, `/content-items/:fqcn`, `/plugins`, `/plugins/:fqcn` and `/config/export`. Export substitutes placeholders for configured credential values. `POST /resolve/requirements` computes a response from the index. `POST /config/validate` validates a document shape and does not install configuration or contact a supplied registry.

**Disposition:** F-07 proposes an explicit refresh permission and service caller policy. Decide whether index visibility is deliberately shared across all authenticated callers. Registry namespaces are registry discovery selectors, not Portal organization identities. Registry model and package restructuring are outside this proposal.

### I-12: Authentication and health boundaries

`GET /api/auth/rhaap/user-job-templates` has an explicit outer unauthenticated policy, but its [handler][auth-templates] first requires a Backstage user. It reads AAP resources using the supplied access token or refreshes the AAP cookie session. It is not an anonymous job launcher. Review how the AAP session is bound to the Backstage identity before drawing conclusions from the outer authentication exception.

Standard OAuth callback, refresh and logout routes are supplied by the installed Backstage auth provider. Do not migrate authentication protocol effects into the Portal user dispatcher. The sign-in catalog mutation is recorded as B-05 below.

`GET /api/portal-health/status`, Portal context and entitlement queries are status/read boundaries. Their routers authenticate or resolve context according to their existing contracts. They do not authorize a later mutation on behalf of the caller.

## Automatic and service execution

### B-01: AAP organization, user and job-template synchronization

[Provider configuration][provider-config] reads `catalog.providers.rhaap`, per-sync enabled flags and schedules, configured AAP organizations and `ansible.rhaap.token`. [AAP provider registration][aap-module] connects providers to catalog. AAPEntityProvider and AAPJobTemplateProvider run through scheduled task helpers and apply catalog mutations. Manual I-07 requests reach the same provider work.

**Authority:** Backend configured AAP credential plus catalog provider mutation authority, not a signed-in user. There is no Portal service execution/entitlement policy evaluated per task run. Organization configuration is an ingestion scope and must not be replaced by a user's namespace. Keep existing organization resolution behavior.

**Disposition:** F-05. Agree whether configuration is an explicit service grant and how disabling/revoking it affects queued/running work.

### B-02: PAH collection and SCM content synchronization

PAHCollectionProvider and AnsibleGitContentsProvider create configured schedules, run on provider connect and publish catalog mutations. [Configuration][provider-config] supplies repository/source selectors and schedules. SCM crawlers use configured SCM clients and credentials. I-07 can request the same work manually. EEEntityProvider is not a scheduled AAP EE pull, it is the callback-driven registration/removal boundary in I-08 and I-04.

**Authority:** Provider/service and integration authority. SCM organization selectors are not AAP organization identities. No user dispatcher or per-run entitlement evaluation applies.

**Disposition:** F-05. Keep approved source and repository allowlists as explicit grants, with mutation and credential use included in the policy.

### B-03: APME automatic project creation and scan

The [catalog sync scheduler][apme-scheduler] registers `apme-catalog-sync-${env}` only for configured sync scopes and skips mock mode. It inherits the module-wide APME enablement gate. The [batch task][apme-batch] reads catalog with own service credentials, checks tracking, resolves or creates gateway projects and can call `triggerScan` when `scanOnRegister` is enabled. It rechecks tracking before scan submission.

[Selection][apme-selection] matches SCM organization and optional labels. Those selectors do not prove AAP organization membership or service entitlement. The task does not call the user dispatcher or evaluate `apme.scanning` as a service policy. The existing tracking checks are implemented safeguards, not a complete service authorization model.

**Disposition:** F-05, first proposed background policy change. Explicitly decide which configured authority permits project creation and automatic scans, including AI enablement. Never manufacture a user context to reuse the user dispatcher.

### B-04: APME configuration replication and learned dependencies

[Galaxy server replication][galaxy-sync] runs once at initialization and hourly, using configured PAH connections to create, update and delete managed gateway server entries. It skips mock mode and inherits module enablement. It has no end-user principal or per-run service entitlement decision. Credential replication and deletion are part of the effect, not just a read.

[Learned dependency synchronization][learned-provider] runs after a startup delay and every 30 minutes. It uses own-service catalog credentials, reads tracked repositories and gateway dependencies, then publishes synthetic collection entities. It skips mock mode and checks tracking. The ManualGitRepositoryProvider applies deltas when called by authorized registration/deregistration handlers. It does not independently schedule gateway scans.

**Disposition:** F-05. Review these as separate service grants. Do not make learned-dependency publication require an unrelated user's scan permission.

### B-05: Sign-in user provisioning

The optional [allowNewAAPUserSignIn resolver][auth-resolver] receives an authenticated OAuth profile and calls the [user provisioner][user-provisioner] when catalog identity is absent. The provider loads AAP user/org/team data, validates configured membership and applies catalog mutations. This happens before a Portal user session is issued.

**Authority:** Authenticated AAP profile plus backend service data access. This is an authentication-bootstrap service path, not an anonymous general-purpose user-create API. Resolver/module installation and configured organizations gate it. Existing membership rejection must remain in place.

**Disposition:** F-05 must explicitly preserve this bootstrap exception and its narrow callable surface. Do not require an already-issued Portal user credential to provision that user.

### B-06: Automation-content indexing and catalog publication

The [content backend][content-plugin] schedules `automation-content-drift-poll` and `automation-content-index-refresh` against configured registry connections. The [catalog module][content-catalog] separately creates an OCIRegistryEntityProvider and configured task runner per registry. Provider connection schedules catalog publication. An empty registry list prevents catalog provider registration. Index refresh does not itself mean catalog provider publication has occurred.

**Authority:** Configured registry credentials plus in-process index or catalog provider authority. No end-user principal, Portal organization resolution or per-run entitlement evaluation. Registry selectors and owner labels are configuration, not identity proofs.

**Disposition:** F-07 and the service policy below. Keep API refresh and catalog publication distinct when validating revocation and observability.

## Proposed service execution policy

This section proposes a service execution policy for public review. It does not describe an implemented SDK API.

Interactive work must retain the authenticated initiator, enforce effect permission and resource access before resolving privileged downstream credentials, and pass through the same guard on every transport. A registered operation can supply shared guarantees. Legacy routes can temporarily use equivalent explicit guards. Documentation saying “internal only” is insufficient if the installed route still accepts broader credentials.

Automatic work needs a separately defined service grant. A grant should identify the responsible plugin/service, configured task, permitted effects, approved resource selectors, credential source, and any applicable organization entitlement. SCM organizations and registry namespaces may bound resources but must never become AAP organization identities. Global configuration replication and pre-session identity provisioning need explicit service policies, not fabricated user memberships.

Evaluate the grant before work is queued and again before a privileged effect when work is delayed. A missing, disabled or ambiguous grant fails closed. Decide how an applicable entitlement is mapped to a service scope before implementing it. A user-only entitlement resolver is not evidence that scheduled work has been authorized.

Audit task identity, trigger type, initiator when present, resource, policy/grant identifier, credential class and decision. Never log tokens. Distinguish “requested”, “authorized”, “submitted” and actual downstream completion. Preserve tracking checks, concurrency limits and cancellation behavior. Revocation must stop future submissions. Cancellation of already accepted AAP/gateway work requires a separate, explicit contract and must not be promised by disabling a task.

Policy questions to resolve before implementation:

1. Is configured ingestion an explicit service grant, and which selectors and credential privileges are mandatory?
2. Which automatic APME effects need entitlement evaluation, and how is that entitlement bound to a service scope for shared repositories?
3. Which service identities may trigger sync, register EEs or request content refresh? What happens when an allowlist is absent?
4. Can a user-initiated job switch to service credentials for polling, stdout or cancellation, and how is that authority bound to the launched job?
5. What is the revocation boundary for queued work, an in-flight scan and an already running external job?

## Prioritized follow-up proposals and acceptance examples

The following proposals are independently reviewable changes. The suggested order prioritizes direct mutations and work launches. It is not an exploit severity rating or a release commitment. Each proposal requires tests for alternate transports and verification that denied requests cause no downstream effects or privileged credential resolution.

### F-01: Guard legacy APME project and suppression paths

**Order:** 1. **Affected components:** APME project routes and catalog resource checks. **Evidence:** I-05 and I-06.

Define distinct project mutation/read, destructive gateway lifecycle and global suppression administration authority. Resolve project/activity/suppression IDs to an approved resource before forwarding. Apply scanning entitlement only where the agreed effect requires it. Either route through registered operations or share explicit guards across raw routes. Remove unused routes only after checking consumers, with an enforceable absence test.

**Allow:** A user allowed to change a readable project's scan target changes that project only. An explicitly authorized global administrator can manage a global suppression.

**Deny:** A signed-in user with no target access cannot change/delete that project or read its activity by ID/lookup. A project user cannot submit a global suppression. A service principal cannot use user-only compatibility routes. Assert no gateway call or settings write.

### F-02: Preserve user authority through EE create and replace

**Order:** 2. **Affected components:** EE scaffolder action and catalog provider. **Evidence:** I-08 and I-04.

Introduce a create/replace guard using initiator credentials and trusted target resolution. Preserve DELETE resource checks. Restrict or remove the raw service POST, or require a narrowly defined service grant for genuinely automatic creation. Replacement permission must be checked even when best-effort cleanup is skipped or fails.

**Allow:** An authorized user creates an EE and replaces an EE they may update through the non-SCM action. Cleanup and registration preserve the same subject and target.

**Deny:** An unauthorized user cannot overwrite a same-name provider EE, including the cleanup-skip path. An unrelated backend service cannot register one by directly calling POST. Assert no provider mutation.

### F-03: Separate build, sync and external-service authority

**Order:** 3. **Affected components:** AAP catalog routes and Portal operation contracts. **Evidence:** I-04 and I-07.

Define mutation permission for EE build rather than deriving it from view permission. Retain entity visibility and user SCM token checks. Define endpoint-specific service subjects/grants for sync and build, with an explicit empty-allowlist policy. Existing external-access configuration must not silently grant every external subject every catalog effect.

**Allow:** A readable-EE user with build authority and a valid downstream token can dispatch. A service explicitly granted a configured provider sync can trigger that sync.

**Deny:** View-only users cannot launch builds. A service allowed for another endpoint cannot sync/build. A user failing the superuser check cannot manually sync. Assert no dispatch or scheduler trigger.

### F-04: Bind credential-backed reads to authorized resources

**Order:** 4. **Affected components:** Catalog, scaffolder and SCM credential handling. **Evidence:** I-02 registration credential choice, I-09, I-10 autocomplete and prepare-for-publish, I-06 branch validation.

Apply catalog resource conditions to each requested target before integration credential use and before shared cache access. Use initiator-bound catalog credentials for collection autocomplete, or define a deliberately shared data contract with explicit permission. Confirm whether repository registration/existence checks intentionally allow integration-backed access and document the grant. Personal SCM access must not be claimed when the backend credential was used.

**Allow:** A user can retrieve content/CI for a caller-readable repository using its resolved host/repository/ref. Creation-time repository checks follow their explicitly approved credential policy.

**Deny:** A user whose conditional catalog policy excludes a repository cannot retrieve its file, CI data or cached result by supplying raw SCM coordinates. A mixed batch returns no unauthorized item. No integration token is resolved for denied targets.

### F-05: Define and enforce automatic-work service grants

**Order:** 5, with policy review started alongside F-01. **Affected components:** Catalog providers, APME scheduling and authentication bootstrap. **Evidence:** B-01 through B-05.

Implement the reviewed service policy incrementally, starting with automatic gateway project creation/scan. Preserve configured ingestion scopes and existing identity membership validation. Separate metadata publication, credential replication and work launch grants. Do not route service execution through a fake Portal user. Record policy decisions and grant revocation semantics before extending the operation contract.

**Allow:** An enabled service grant for a selected repository permits the configured scan. Approved ingestion and identity bootstrap continue without an interactive session.

**Deny:** Disabled/missing grant, excluded source, stopped tracking or revoked applicable entitlement prevents the next scan submission, including delayed work. No forged user namespace or SCM organization can satisfy AAP membership. Test initial startup runs as well as recurring tasks. Do not assert cancellation of jobs already accepted downstream.

### F-06: Authorize AAP scaffolder effects and service polling

**Order:** 6. **Affected components:** AAP scaffolder actions and Portal operation contracts. **Evidence:** I-10.

Choose per-action Portal guards or an explicit supported downstream-token boundary. Obtain initiator credentials where Portal policy applies and keep checks independent of frontend field visibility. Bind any service polling/stdout/cancel capability to the authorized launched job. Preserve task abort behavior and downstream AAP authorization.

**Allow:** An authorized initiator launches an allowed template. Approved service polling continues for that returned job without permitting arbitrary job access.

**Deny:** A caller unable to launch the target cannot cause a launch via a custom template/direct task. A polling transition cannot read/cancel another job. Missing or denied downstream credentials do not fall back to broader mutation authority.

### F-07: Authorize content refresh and clarify shared index visibility

**Order:** 7. **Affected components:** Content indexing and Portal authorization. **Evidence:** I-11 and B-06.

Define refresh authority for users and permitted services, and a separate automatic-indexing grant over configured registries. Retain fixed configured targets and placeholder-only credential export. Confirm whether discovery reads are globally shared or filtered. Avoid duplicating registry model/package work.

**Allow:** An authorized refresher can refresh an approved configured registry. A service with an active indexing grant publishes only its configured registry selection.

**Deny:** An authenticated caller without refresh authority cannot cause poll/refresh network requests. Unknown registries cannot become arbitrary targets. Revoking the service grant prevents the next index refresh/catalog publication.

## Review and completion procedure

### Prerequisites

- Identify the affected backend packages and their current maintainers.
- Recheck source references after rebasing or related package moves.

### Procedure

1. Review the relevant source paths and identify omitted entry points, transports or effects. Include maintainers of affected packages in the public review.
2. Record decisions, unresolved policy questions and the source baseline in the pull request discussion or a linked public design proposal. The proposals in this document have not yet been accepted.
3. Agree the service policy and scope of each change. Link accepted follow-up work through public issues or pull requests, and explain dependencies on changes to package structure or operation contracts.
4. Add positive and denied tests to each implementation PR, including raw routes, scaffolder and scheduled/startup paths. Verify zero effect after denial.

### Verification

The inventory is ready to guide implementation when every in-scope effect has a documented authorization path or an explicit proposal, review decisions are publicly accessible, and exclusions are explained. A proposed gap is resolved only after the guard is implemented or the route/task is removed, with acceptance tests demonstrating the result. Publishing this inventory does not itself resolve the gaps.

## Existing regression evidence

The following source-linked test suites document expected behavior for the existing boundaries:

- [Dispatcher tests][dispatcher-tests] cover permission/entitlement denials, trusted memberships and organization ambiguity.
- [Workflow authorization tests][project-authorizer-tests] cover denied scan permission, missing catalog subjects, stopped tracking and shared repository access.
- [APME handler tests][apme-operation-tests] cover resource denial, entitlement denial before downstream access and deregistration without deleting gateway state.
- [Manual registration transport tests][manual-router-tests] cover permission denial, duplicate identities and invalid SCM URL metadata.

These tests support the implemented boundaries in I-01 through I-03. They do not establish that legacy routes or scheduled effects have the missing policies proposed in F-01 through F-07. Test coverage should be extended alongside each accepted implementation change.

[composition]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/portal-core/packages/backend/src/index.ts
[operation-router]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/portal-core/plugins/portal-operations-backend/src/router.ts#L23
[dispatcher]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/portal-core/plugins/portal-plugin-node/src/operations.ts
[identity-middleware]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/portal-core/plugins/portal-plugin-node/src/middleware.ts
[apme-descriptors]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/backstage-apme-common/src/operations.ts
[register-operation]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/manualRepositories/registerOperation.ts#L14
[apme-operations]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/operations.ts
[manual-router]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/manualRepositories/router.ts#L26
[apme-action]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/scaffolder-backend-module-apme/src/actions/registerGitRepository.ts#L22
[apme-module]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/module.ts#L124
[apme-router]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/router.ts
[project-authorizer]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/projectOperationAuthorization.ts
[operation-proxy]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/gatewayOperationProxy.ts
[aap-router]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/catalog-backend-module-rhaap/src/router.ts
[aap-helpers]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/catalog-backend-module-rhaap/src/helpers.ts#L639
[settings-edit]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/requireSettingsManage.ts
[settings-view]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/requireSettingsView.ts
[aap-module]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/catalog-backend-module-rhaap/src/module.ts
[ee-provider]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts#L24
[ee-action]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts#L359
[aap-scaffolder]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts#L96
[launch-action]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/aapLaunchJobTemplate.ts#L46
[autocomplete]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/autocomplete.ts
[autocomplete-utils]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/utils.ts#L170
[content-router]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/content/plugins/automation-content-backend/src/router.ts
[content-plugin]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/content/plugins/automation-content-backend/src/plugin.ts
[auth-templates]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/auth-backend-module-rhaap-provider/src/userJobTemplatesRouter.ts#L22
[provider-config]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/config.ts
[apme-scheduler]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/apmeCatalogSyncScheduler.ts
[apme-batch]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/apmeCatalogSyncTask.ts
[apme-selection]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/backstage-apme-common/src/apmeCatalogSync.ts#L27
[galaxy-sync]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/portalGalaxyServersSync.ts
[learned-provider]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/providers/ApmeLearnedDepsEntityProvider.ts#L122
[auth-resolver]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/auth-backend-module-rhaap-provider/src/resolvers.ts#L159
[user-provisioner]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/aap/plugins/catalog-backend-module-rhaap-user-provisioner/src/UserProvisionerProvider.ts#L187
[content-catalog]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/content/plugins/catalog-backend-module-automation-content/src/module.ts
[dispatcher-tests]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/portal-core/plugins/portal-plugin-node/src/operations.test.ts
[project-authorizer-tests]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/projectOperationAuthorization.test.ts
[apme-operation-tests]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/operations.test.ts
[manual-router-tests]: https://github.com/ansible/ansible-backstage-plugins/blob/88950e3091a878cd2dacbd840aa63248a7aaf121/workspaces/apme/plugins/catalog-backend-module-apme/src/manualRepositories/router.test.ts
