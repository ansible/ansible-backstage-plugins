# User stories

Acceptance-oriented stories for the APME Quality experience on
`feat/apme-eap-next-ui-workflow` (thin host + `@apme/ui-workflow`).
Verify via the [apme-rhdh-dev](https://github.com/cidrblock/apme-rhdh-dev) local loop
and/or `yarn start` / `make react`. Each file is one story: status, narrative, workflow
coverage, and how to verify.

**Journey index:** [user-journeys.md](user-journeys.md) maps Craig’s J1–J13
([ansible-rhdh-plugins#687](https://github.com/ansible/ansible-rhdh-plugins/pull/687))
to these `US-*` files.

**Convention:** add or update a story when starting a gap; mark **Complete** only
after verified in the local loop (`make react` and/or RHDH dynamic plugins).

| Status | Meaning |
|--------|---------|
| Planned | Agreed gap; not started or in progress |
| In progress | Implementation underway; not yet verified |
| Complete | Acceptance criteria met and verified locally |
| Deferred | Explicitly out of current scope |

| ID | Story | Journey | Status |
|----|--------|---------|--------|
| [US-001](US-001-quality-tab-scan-with-ai.md) | Run a scan from the Quality tab (AI on/off) | J2/J3 (partial) | Complete |
| [US-002](US-002-git-repos-chrome.md) | Git Repos chrome: status chips + Run quality scan | J1 | Complete |
| [US-003](US-003-register-without-aap-oauth.md) | Register a repository from Git Repos | J7 | Complete |
| [US-004](US-004-admin-quality-settings.md) | Admin / Quality settings | J6 | Complete |
| [US-005](US-005-fleet-quality.md) | Fleet Quality overview | J4 | Complete |
| [US-006](US-006-overview-quality-card.md) | Overview Quality card (above About) | J1 | Complete |
| [US-007](US-007-scan-triage-acknowledge.md) | Scan triage: filter, acknowledge, Quality activity | J2 | Done |
| [US-008](US-008-remediate-and-ship.md) | Remediate and ship (canonical E2E) | J3 | Planned |
| [US-009](US-009-dependency-risk.md) | Dependency risk (Collections / Dependencies) | J5 | Planned |
| [US-010](US-010-background-estate-scan.md) | Background estate scan | J8 | Deferred |
| [US-011](US-011-quick-actions-dev-spaces.md) | Quick actions (Dev Spaces, header shortcuts) | J9 | Planned |
| [US-012](US-012-entity-catalog-health.md) | Entity catalog health (legacy layout) | J10 | Planned |
| [US-013](US-013-content-health-dashboard.md) | Content Health dashboard | J11 | Deferred |
| [US-014](US-014-message-inbox.md) | Message inbox | J12 | Deferred |
| [US-015](US-015-eap-feedback.md) | Submit EAP feedback | J13 | Planned |
| [US-016](US-016-abbenay-providers-quality-settings.md) | Abbenay AI providers on Quality settings | J6 | Complete |
