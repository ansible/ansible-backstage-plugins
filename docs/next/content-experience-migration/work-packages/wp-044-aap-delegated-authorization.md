# WP-044 — AAP delegated authorization

| Field      | Value                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Phase      | 4 — Read/write API                                                                                   |
| Depends on | WP-013                                                                                               |
| Targets    | `aap-common`, `aap-backend`, typed `aap-node` client, auth provider, and delegated credential policy |
| Outcome    | Explicit end-user-to-AAP authorization semantics for privileged reads and mutations                  |

## Human summary

**Why this matters:** Permission in the portal does not prove that Ansible Automation Platform (AAP) allows the same action. Privileged reads and changes must preserve the signed-in user or approved integration identity all the way to AAP without silently switching to broader credentials.

**What will change:** Each operation will use exactly one documented mode: a signed-in user's delegated credential, an allowlisted Backstage service identity, or a scheduler-owned identity. The AAP backend will resolve short-lived credentials, enforce both portal and AAP authorization, and record correlated identities without storing reusable tokens.

**PR scope:** Deliver the work as the ordered PR series below: approve delegation policy, extract the provider compatibly, establish the portable authentication contracts plus AAP-backend credential manager and typed client, integrate operation authorization, and complete adversarial and operational certification. No PR broadens credentials or removes the prior path before parity evidence passes.

**Not in this PR:** A failed or expired user credential will never fall back to a more privileged service credential. Controller access and credential resolution will not be allowed outside the AAP backend, and tokens will not be persisted in jobs, events, storage, logs, metrics, traces, or audit records.

**Success looks like:** An action has no unauthorized effect when either the portal or AAP denies it, and each service or scheduler action is limited to its approved resources and operations. Token races, expiry, cancellation, outages, multiple replicas, identity changes, and architectural boundary tests all pass.

## Scope and changes

Define and implement the delegated authorization contract between Backstage identity/permissions and AAP authorization, publish the portable authentication/delegation portion of `aap-common`, and extract `auth-backend-module-aap-provider` from the current RHAAP provider while preserving provider ID, profile exchange, sign-in resolver, token lifecycle, and hardened optional onboarding behavior. Operations declare exactly one execution mode: signed-in user with delegated AAP OAuth credential, allowlisted Backstage service principal with configured service credential, or scheduler-owned integration identity. The resolver never silently falls from user to service privilege. The `aap-node` client carries Backstage caller credentials/correlation IDs to plugin ID `aap`; `aap-backend` alone owns plugin ID `aap`, resolves execution credentials, and talks to Controller. Never treat portal UI visibility or a Backstage permission alone as proof that AAP permits the action.

```ts
interface AapAuthorizationContext {
  backstagePrincipal: string;
  delegationMode: 'user' | 'allowlisted-service' | 'scheduler';
  credentialHandle: string; // Never the token itself in jobs/events/audit.
  correlationId: string;
}
```

## Implementation slices

1. Approve identity mapping, delegation modes, token lifecycle, failure, and audit ADR.
2. Add short-lived credential acquisition/refresh/revocation inside `aap-backend` for all three modes.
3. Add portable authentication/delegation contracts in `aap-common` and the authenticated typed `aap-node` REST client boundary with caller/correlation propagation and no fallback behavior.
4. Integrate the WP-013 pipeline and enforce operation-/subject-specific allowlists plus AAP resource authorization.
5. Add audit correlation, metrics, incident/rotation runbooks, and compatibility rollout.

## Ordered PR series

1. **Delegation and identity ADR:** approve the three execution modes, identity mapping, resource checks, token lifecycle, denial behavior, audit fields, and prerequisite exit evidence; no runtime change.
2. **Provider extraction:** publish `auth-backend-module-aap-provider` with compatibility exports and exact sign-in/profile/token behavior.
3. **Credential manager and client:** publish the portable `aap-common` authentication/delegation contracts, establish plugin ID `aap`, and add short-lived credential acquisition/refresh/revocation exclusively in `aap-backend` plus the caller/correlation-carrying `aap-node` client, initially behind compatibility adapters.
4. **Operation authorization:** integrate WP-013 and operation-/subject-specific policy, then enable representative user, service, and scheduler paths independently after denial tests pass.
5. **Security and operational certification:** complete adversarial token-race/outage/multi-replica tests, audit and metrics, rotation/incident runbooks, compatibility evidence, and guarded rollout.

Each PR must pass its applicable tests below, leave a releasable deny-safe path, and be revertible without moving credential ownership outside plugin ID `aap`.

## Required tests

- Valid/expired/revoked/stale identity, role changes, user deletion, service fallback prohibition, and resource-level denial.
- Portal allow/AAP deny and portal deny/AAP allow both produce no unauthorized effect.
- Token refresh races, long-running jobs, cancellation, AAP outage, and multi-replica behavior.
- No token in database, job payload, outbox, browser storage, log, metric, trace, or audit.
- Existing OAuth/service integrations remain compatible through approved migration paths.
- Scheduler-owned integration identity, allowlists, audit identities, and denial behavior are covered independently from service execution.
- Architecture tests allow only the portable `IAAPService` declaration and authenticated REST-client contract in `aap-node`; they reject Controller client implementations, credential resolution, and `ansibleServiceRef` use outside `aap-backend`.

### Acceptance criteria

- Given portal permission but AAP denial, no upstream request with mutation effect succeeds.
- Given service identity mode, each resource action performs the approved authoritative AAP check and records both identities.
- Given scheduler mode, only approved scheduled operations/subjects execute and audit records the scheduler integration identity plus initiating schedule.
- Given credential expiry during a job, behavior follows the approved refresh/fail policy without persisting a reusable token.
- Given plugin/module inspection, operation modules reach plugin ID `aap` only through the typed authenticated `aap-node` client.

## Rollback and completion

Disable affected privileged operations; do not fall back to broader service credentials. Done means security approves delegation and adversarial authorization/token-handling tests pass.
