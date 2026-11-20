---
title: 'ADR-002: Two-Tier RBAC (Backstage + AAP Pass-Through)'
description: 'The compliance plugin needs access control that determines who can view, scan, remediate, and configure'
type: adr
status: accepted
date: 2026-05-21
product: 'AAP Compliance Dashboard'
---

# ADR-002: Two-Tier RBAC (Backstage + AAP Pass-Through)

**Status:** Accepted
**Date:** 2026-05-21
**Deciders:** M. Ferrari, architect review

## Context

The compliance plugin needs access control that determines who can view, scan, remediate, and configure. Three options were evaluated:

- **Option A:** Two-tier Backstage permissions (Admin/Operator) using existing `catalogEntityCreatePermission`
- **Option B:** Granular Backstage permissions mapped from AAP orgs/teams (correct long-term, but the plumbing is not wired in any downstream plugin)
- **Option C:** AAP token pass-through for Controller API calls (AAP's native RBAC decides what the user can access)

The downstream `ansible-rhdh-plugins` (self-service, EE build) all use a two-tier model. No existing plugin has implemented granular org/team permission mapping from AAP.

## Decision

**Option A+C:** Two-tier Backstage permissions combined with AAP OAuth2 token pass-through.

**Backstage layer (Option A):**

- **Admins** (users in `aap-admins` group with `catalogEntityCreatePermission`): can scan, remediate, configure profiles, manage settings
- **Operators** (all authenticated users): read-only -- view dashboard, findings, remediations, export

**AAP layer (Option C):**

- Every Controller API call passes the user's AAP OAuth2 token via `x-aap-token` header
- AAP's native RBAC decides what inventories, JTs, and credentials the user can access
- If the user cannot launch a JT in AAP, the scan/remediation fails with 403

**Backstage session (all environments):**

- User-facing API routes require a signed-in Backstage user (guest auth in local dev still creates a session).
- Only `GET /health` is unauthenticated at the Backstage auth-policy layer.
- Mutating endpoints require the appropriate compliance permission (see `@ansible/compliance-common`).

## Consequences

- **Positive:** Matches downstream patterns exactly -- no custom permissions to maintain.
- **Positive:** AAP token pass-through provides implicit org/team scoping without Backstage-level org policies.
- **Positive:** Same auth model in local dev and Portal — no config toggle to bypass RBAC.
- **Negative:** Only two tiers in Backstage -- no per-team or per-inventory scoping at the Backstage layer. AAP layer handles this implicitly.
- **Negative:** Option B (granular mapping) deferred until the downstream wires AAP org/team sync.
