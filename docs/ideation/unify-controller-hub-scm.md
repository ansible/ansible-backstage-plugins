# Ideation: Unify Controller, Hub, and SCM under Projects

| Field | Value |
|-------|--------|
| **Status** | Ideation (not scheduled) |
| **Audience** | Product / UX / Portal + APME |
| **Related** | Self-service Git Repositories, Collections, Catalog sync, APME Quality, AAP Projects |

## Problem

From an **Ansible operator** perspective, content already has a clear shape:

```text
SCM (git)  →  Controller Project  →  Job Templates / jobs
                ↓
           publish / promote
                ↓
         Hub Collection(s)  →  consume in playbooks / EEs
```

Those pieces are **interconnected**. A Project is how Controller uses a repo. A Collection is often what that same SCM content becomes when published. Quality (APME) cares about the SCM side of that lifecycle.

The Portal today presents **sibling surfaces** that do not model those links:

| Portal / RHDH surface | What it feels like | Ansible mental model |
|-----------------------|--------------------|----------------------|
| **Catalog** | Generic inventory of “software things” | Not an Ansible concept |
| **Git Repositories** | List of SCM repos for browse / Quality | Closer to **Projects**, wrong name |
| **Collections** | Hub / PAH artifacts | Collections (correct name, unlinked) |
| **Job Templates** (synced) | Runnable automation | Consumers of Projects |
| **Execution Environments** | Runtime images | Often consume collections |

Registering a repo for Quality and browsing a collection do not create a relationship. Two UIs can show the “same” content with no edge between them. Operators who live in Controller do not know what a Catalog is — and should not need to.

## Desired framing

**Primary UX noun: Projects** (Controller-aligned).

A Project in the Portal should mean roughly what it means in AAP:

- SCM URL + default branch (and org / credential identity as needed)
- **Editable** after create — wrong branch / metadata is a settings change, not “unregister and re-register”
- Optional link to **published collection(s)** on Hub
- Optional link to **Job Templates** that use this project
- Quality / APME as a capability **on the project** (scan, violations, remediate), not a separate “catalog entity hobby”

**Edit belongs in the Project model**, not as a bolt-on to today’s write-once git-repo register. In Controller, operators update project SCM fields; the Portal Project surface should offer the same expectation (at least for Portal-owned fields, and ideally with a clear story when AAP is SoT).

Catalog (Backstage) can remain the **platform store** (entities, annotations, relations). It should not be the product vocabulary users see for this domain.

```text
                    ┌─────────────────────────────┐
                    │         Project (UX)        │
                    │  SoT candidate: AAP Project │
                    └─────────────┬───────────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                      ▼
     SCM / git              Hub Collection(s)      Job Template(s)
   (Quality / APME)         (publish / consume)    (run in Controller)
```

## Why pull Projects from Controller?

Controller is where Projects are **actually used**:

- Already has SCM URL, branch, org, credentials
- Job Templates already point at Projects
- Operators already manage this inventory in AAP

Portal today can talk to Controller projects via `AAPClient` (create/get/delete for scaffolder flows), and syncs job templates / orgs / EEs / Hub collections — but **does not** treat AAP Projects as the source of truth for the Git Repositories / Quality list. Manual register (and APME-oriented templates) create a parallel inventory.

**Ideation direction:** prefer **sync AAP Projects → Portal Projects** as the default list for “content we care about,” with an optional “register for Quality only” path for repos not yet in Controller.

## Gaps today (summary)

1. **Naming** — “Git Repositories” + “Catalog” vs Ansible “Projects.”
2. **No link** — Git repo entity and Collection entity are siblings, not a lifecycle.
3. **Split SoT** — AAP Projects vs manually registered repos vs Hub collections.
4. **Quality attachment** — APME keys off SCM annotations on catalog entities; the product story is “project quality,” not “catalog Resource chrome.”
5. **Write-once register** — Add repository stamps `spec.repository_default_branch` (and related SCM fields) via `ansible:register:git-repository` / `ManualGitRepositoryProvider` (delta **add** only). No product **edit** UI; wrong branch today means unregister + re-register or hand-edit catalog YAML. That is incompatible with a Project mental model.

## Project lifecycle (ideation)

| Capability | Today (Git Repos) | Unified Project |
|------------|-------------------|-----------------|
| Discover / list | Git Repositories page | **Projects** (prefer sync from Controller) |
| Create / register | Scaffolder template (write-once) | Create project (Portal-only and/or push/link to AAP) |
| **Edit** (branch, SCM URL, links) | Not supported | First-class **Edit project** / settings |
| Quality | Entity Quality tab + list chrome | Capabilities on the project |
| Remove | Catalog unregister (awkward) | Remove / unlink with clear SoT rules |
| Relate | None | Collections, Job Templates, EEs |

Edit is not a separate micro-feature for APME demos — it is part of treating the thing as a **Project**.

## Open questions

1. **One Project entity or many?** Map 1:1 to Controller Project ID, or allow Portal-only projects that later bind to AAP?
2. **Multi-collection repos** — One SCM project publishing multiple collections; how does the UI show that?
3. **Credentials** — Portal must not become a second PAT store; prefer AAP / `integrations` / Gateway token injection for SCM.
4. **Hub-only collections** — Collections with no known SCM Project (vendor / upstream); still list under Collections, or attach as “unlinked”?
5. **Rename vs new IA** — Relabel Git Repositories → Projects first, or redesign nav around Projects + Collections + EEs with relations?
6. **APME Gateway “project”** — Already uses `/projects` in the Gateway API; align Portal naming with that and with Controller, carefully.
7. **Edit ownership when AAP is SoT** — Does Portal edit PATCH Controller project fields, edit only Portal/APME overlays (e.g. Quality defaults), or deep-link to AAP for SCM changes?
8. **Scan-time branch override** — Even with a default branch on the project, should Quality allow choosing another ref per scan without changing the project default?

## Non-goals (for this note)

- Implementing sync or rename in the current EAP UI workflow stories
- Replacing Backstage Catalog as the persistence/discovery mechanism
- Merging Hub and Controller into one product surface

## Suggested follow-ups

- Product decision: **Projects as primary nav** for SCM + Quality, including **create / edit / remove**
- Spike: sync Controller `/api/controller/v2/projects/` into catalog entities with stable AAP IDs + SCM annotations APME already expects
- Spike: **update** path for manually registered (or Portal-owned) projects — provider mutation or Catalog entity update API; UI on Project detail / settings (related to US-004 admin quality settings)
- Model relations: `Project` → `providesCollection` / `usedByJobTemplate` (Catalog relations or annotations)
- Keep **Collections** and **EEs** as first-class, but always reachable **from** a Project when a link exists

## References (in-repo)

- Self-service sidebar: Execution Environments, Collections, Git Repositories
- Catalog providers: job templates, PAH collections, Ansible git contents crawlers, manual git register (`ManualGitRepositoryProvider` add-only)
- User stories: US-001 Quality tab, US-002 Git Repos chrome, US-003 register without AAP OAuth, US-004 admin quality settings
- APME Gateway project APIs (scan / violations / operation) — product language already says “project”
