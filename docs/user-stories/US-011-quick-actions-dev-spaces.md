# US-011 — Quick actions (Add repo, Dev Spaces, scan shortcuts)

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Repo owner |
| **Surface** | Git Repos catalog header; repo detail header menu |
| **Craig journey** | [J9](user-journeys.md) |
| **Depends on** | [US-002](US-002-git-repos-chrome.md), [US-003](US-003-register-without-aap-oauth.md) |

## Story

> As a repo owner, I want catalog and detail header quick actions (Add
> repository, Open in Dev Spaces, scan shortcuts) so common next steps are one
> click away.

## Acceptance criteria

- [ ] Catalog header **Add repository** remains available when APME is enabled
      ([US-003](US-003-register-without-aap-oauth.md)).
- [ ] Detail header includes **Open in Dev Spaces** when
      `ansible.devSpaces.baseUrl` is set; URL resolves correctly.
- [ ] Scan shortcuts stay on ADR-010 extension points
      (`ApmeRepositoryHeaderActions`); zero-footprint when
      `ansible.apme.enabled: false`.

## Out of scope

- Full remediate→PR flow ([US-008](US-008-remediate-and-ship.md)).

## Notes

- Upstream: ansible-rhdh-plugins
  [`user-journeys.md` J9](https://github.com/ansible/ansible-rhdh-plugins/blob/docs/apme-productization/prototypes/apme/references/user-journeys.md).
- US-002 covered Run quality scan; this story tracks Dev Spaces + remaining
  header menu completeness.
