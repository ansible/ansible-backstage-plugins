# APME user journeys → stories

Upstream journeys from Craig’s productization plan
([ansible-rhdh-plugins#687](https://github.com/ansible/ansible-rhdh-plugins/pull/687)
→ [`prototypes/apme/references/user-journeys.md`](https://github.com/ansible/ansible-rhdh-plugins/blob/docs/apme-productization/prototypes/apme/references/user-journeys.md)).

Acceptance-oriented work lives in `US-*.md`. This file is the journey index and
crosswalk — not a second source of acceptance criteria.

## Scope tags (from upstream)

| Tag | Meaning |
|-----|---------|
| **EAP only** | Early Access welcome pack only; retire or replace at GA |
| **EAP + GA** | Core path in both EAP and productized release |
| **GA only** | Not in EAP default; productization backlog |

## Crosswalk

| Journey | Scope | Story | Status |
|---------|-------|-------|--------|
| J1 Discover and prioritize | EAP + GA | [US-002](US-002-git-repos-chrome.md), [US-006](US-006-overview-quality-card.md) | Complete |
| J2 Scan and triage | EAP + GA | [US-001](US-001-quality-tab-scan-with-ai.md), [US-007](US-007-scan-triage-acknowledge.md) | Partial → Planned |
| J3 Remediate and ship | EAP + GA | [US-001](US-001-quality-tab-scan-with-ai.md), [US-008](US-008-remediate-and-ship.md) | Partial → Planned |
| J4 Oversight across fleet | EAP + GA | [US-005](US-005-fleet-quality.md) | Complete |
| J5 Dependency risk | EAP + GA | [US-009](US-009-dependency-risk.md) | Planned |
| J6 Quality administration | EAP + GA | [US-004](US-004-admin-quality-settings.md) | Complete |
| J7 Register a repository | EAP + GA | [US-003](US-003-register-without-aap-oauth.md) | Complete |
| J8 Background estate scan | GA only | [US-010](US-010-background-estate-scan.md) | Deferred |
| J9 Quick actions | EAP + GA | [US-011](US-011-quick-actions-dev-spaces.md) | Planned |
| J10 Entity catalog health | EAP + GA | [US-012](US-012-entity-catalog-health.md) | Planned |
| J11 Content Health dashboard | GA only | [US-013](US-013-content-health-dashboard.md) | Deferred |
| J12 Message inbox | GA only | [US-014](US-014-message-inbox.md) | Deferred |
| J13 Submit EAP feedback | EAP only | [US-015](US-015-eap-feedback.md) | Planned |
