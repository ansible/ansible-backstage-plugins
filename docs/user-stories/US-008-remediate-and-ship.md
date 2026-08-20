# US-008 — Remediate and ship (canonical E2E)

| Field | Value |
|-------|--------|
| **Status** | Work in progress |
| **Persona** | Repo owner |
| **Surface** | Entity **Quality** tab |
| **Craig journey** | [J3](user-journeys.md) (canonical E2E) |
| **Depends on** | [US-001](US-001-quality-tab-scan-with-ai.md) |

## Story

> As a repo owner, I want to generate fixes, review patches, push a branch,
> and open a pull request from the Quality tab, so I can remediate and ship
> without leaving the portal.

## Acceptance criteria

- [ ] **Generate fixes** remediates autofixes in one activity (all-or-nothing;
      no per-violation selection in current product shape).
- [ ] Optional **Include AI** when `ansible.apme.enableAi` and Abbenay are
      configured (off by default in EAP welcome-pack configs).
- [ ] Flow: Generate fixes → optional **View patches** (read-only) → **Push
      branch** → **Open in Dev Spaces** (when configured) → **Create pull
      request**.
- [ ] Verified against upstream canonical E2E (contributor-guide on
      docs/apme-productization).

## Out of scope

- Editable branch name before push (upstream DEV-21).
- Portal-side SCM commit publisher — Gateway owns SCM.

## Notes

- Upstream: ansible-rhdh-plugins
  [`user-journeys.md` J3](https://github.com/ansible/ansible-rhdh-plugins/blob/docs/apme-productization/prototypes/apme/references/user-journeys.md).
- Overlaps US-001 workflow stages; this story tracks the full remediate→PR
  acceptance path as a distinct close-the-gap item.
- JIRA link - https://redhat.atlassian.net/browse/AAP-88786
