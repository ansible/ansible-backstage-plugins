# User stories

Acceptance-oriented stories for the APME Quality experience on
`feat/apme-eap-next-ui-workflow` (thin host + `@apme/ui-workflow`).
Verify via the [apme-rhdh-dev](https://github.com/cidrblock/apme-rhdh-dev) local loop
and/or `yarn start` / `make react`. Each file is one story: status, narrative, workflow
coverage, and how to verify.

**Convention:** add or update a story when starting a gap; mark **Complete** only
after verified in the local loop (`make react` and/or RHDH dynamic plugins).

| Status | Meaning |
|--------|---------|
| Planned | Agreed gap; not started or in progress |
| Complete | Acceptance criteria met and verified locally |
| Deferred | Explicitly out of current scope |

| ID | Story | Status |
|----|--------|--------|
| [US-001](US-001-quality-tab-scan-with-ai.md) | Run a scan from the Quality tab (AI on/off) | Complete |
| [US-002](US-002-git-repos-chrome.md) | Git Repos chrome: status chips + Run quality scan | Complete |
| [US-003](US-003-register-without-aap-oauth.md) | Register a repo without AAP OAuth | Planned |
| [US-004](US-004-admin-quality-settings.md) | Admin / Quality settings | Planned |
| [US-005](US-005-fleet-quality.md) | Fleet Quality overview | Deferred |
