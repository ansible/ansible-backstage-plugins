# Speckit Workflow Guide

This guide documents how we use [Speckit](https://speckit.dev) to drive feature development from specification through implementation. It covers the commands available, the workflow we followed for ANSTRAT-1806 (Portal Admin Onboarding), and conventions for team members to follow.

## What is Speckit?

Speckit is a specification-driven development toolkit that integrates with Claude Code. It provides slash commands (`/speckit.*`) that generate and maintain structured design artifacts — specs, plans, tasks, checklists — and then drive implementation from those artifacts.

**Version**: 0.4.2 (see `.specify/init-options.json`)

## Project Setup

Speckit was initialized in this repo with the following structure:

```
.specify/                          # Speckit configuration
  init-options.json                # Init settings (AI provider, branch numbering)
  scripts/bash/                    # Helper scripts (prerequisite checks)
  templates/                       # Templates for plan, tasks, checklists

.claude/commands/                  # Claude Code slash commands
  speckit.specify.md               # /speckit.specify
  speckit.clarify.md               # /speckit.clarify
  speckit.plan.md                  # /speckit.plan
  speckit.tasks.md                 # /speckit.tasks
  speckit.checklist.md             # /speckit.checklist
  speckit.analyze.md               # /speckit.analyze
  speckit.implement.md             # /speckit.implement
  speckit.taskstoissues.md         # /speckit.taskstoissues
  speckit.constitution.md          # /speckit.constitution
```

## Available Commands

| Command                  | Purpose                               | Input                              | Output                                                          |
| ------------------------ | ------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `/speckit.specify`       | Create or update feature spec         | Natural language description       | `specs/<feature>/spec.md`                                       |
| `/speckit.clarify`       | Find gaps in the spec                 | Existing `spec.md`                 | Up to 5 clarification questions, answers encoded back into spec |
| `/speckit.plan`          | Generate architecture and design plan | `spec.md`                          | `specs/<feature>/plan.md`                                       |
| `/speckit.tasks`         | Break plan into ordered tasks         | `spec.md` + `plan.md`              | `specs/<feature>/tasks.md`                                      |
| `/speckit.checklist`     | Generate quality checklists           | User requirements                  | `specs/<feature>/checklists/*.md`                               |
| `/speckit.analyze`       | Cross-artifact consistency check      | `spec.md` + `plan.md` + `tasks.md` | Analysis report (non-destructive)                               |
| `/speckit.implement`     | Execute all tasks                     | `tasks.md` + `plan.md`             | Code changes, tasks marked `[X]`                                |
| `/speckit.taskstoissues` | Convert tasks to GitHub issues        | `tasks.md`                         | GitHub issues via `gh` CLI                                      |
| `/speckit.constitution`  | Define project principles             | Interactive input                  | `.specify/constitution.md`                                      |

## Feature Directory Structure

Each feature lives under `specs/<feature-id>/`:

```
specs/001-portal-admin-onboarding/
  spec.md                          # Feature specification (what to build)
  plan.md                          # Architecture & design (how to build it)
  tasks.md                         # Task breakdown (ordered implementation steps)
  contracts/
    api-spec.yaml                  # OpenAPI spec (API contracts)
  checklists/                      # Quality checklists (UX, security, etc.)
  adrs/                            # Architecture Decision Records
    README.md                      # ADR index
    001-descriptive-title.md       # Individual ADRs
    002-descriptive-title.md
    ...
```

## Workflow: Step-by-Step

### Step 1: Specify

Create the feature specification from a Jira ticket, user story, or feature description.

```
/speckit.specify specs/001-feature-name
```

**Tips:**

- Reference Figma mockup filenames in the spec so the plan and implementation can trace back to designs
- Include deployment constraints (RHEL vs OpenShift) early — they affect architecture decisions
- Mark the spec version and status at the top for traceability

### Step 2: Clarify

Identify underspecified areas and resolve ambiguities.

```
/speckit.clarify specs/001-feature-name
```

Reads the spec and asks up to 5 targeted clarification questions. Answers are encoded back into the spec.

### Step 3: Plan

Generate the architecture and implementation plan.

```
/speckit.plan specs/001-feature-name
```

**Review the plan before proceeding** — this is the best time to catch architectural issues. The plan is where "extend vs create new package" decisions are made.

### Step 4: Tasks

Generate the ordered task breakdown.

```
/speckit.tasks specs/001-feature-name
```

Tasks are marked `[ ]` (pending) or `[X]` (done). The `[P]` marker indicates tasks that can run in parallel.

### Step 5: Implement

Execute the implementation plan, processing tasks in dependency order.

```
/speckit.implement specs/001-feature-name
```

Can be run multiple times across sessions — it detects which tasks are already `[X]` and only processes remaining ones.

### Step 6: ADRs

After implementation, capture key architectural decisions as ADRs. Use the `/speckit.adr` command or create them manually.

```
/speckit.adr specs/001-feature-name
```

See the [ADR Requirements](#adr-requirements) section below for the expected format and content.

### Step 7: Analyze (optional)

Check consistency across all artifacts.

```
/speckit.analyze specs/001-feature-name
```

### Design Evolution During Implementation

Not all decisions from the original spec survive implementation. Some are changed based on testing feedback. When this happens:

1. Update the relevant spec/plan/tasks files with notes about the change
2. Create an ADR documenting why the original approach was changed
3. Keep the original text in the spec as historical context (strikethrough or notes)

Examples from ANSTRAT-1806:

- **General page removed**: The spec defined a General page with a local admin toggle. Testing showed it created a broken logout flow. Moved to CLI-only per enterprise break-glass patterns.
- **Sign-in modes expanded**: Two modes became three after testing revealed auto-authentication made logout impossible post-setup.
- **Partial secret updates**: Testing showed edit forms couldn't require re-entering secrets the admin didn't have.

## ADR Requirements

Every feature should produce ADRs for decisions that involved trade-offs between alternatives. ADRs are stored in `specs/<feature>/adrs/`.

### When to Write an ADR

Write an ADR when:

- You chose between 2+ viable approaches and the choice isn't obvious
- The decision affects multiple components or deployment modes
- A decision was changed during implementation (document why the original was wrong)
- Future developers might ask "why was it done this way?"

### ADR Format

Each ADR follows this structure:

```markdown
# ADR-NNN: Descriptive Title

**Status**: Accepted | Superseded | Deprecated
**Date**: YYYY-MM-DD
**Deciders**: Team or individuals

## Context

What problem are we solving? What constraints exist?

## Alternatives Considered

### Option 1: Name (Rejected)

Brief description.

**Why rejected:**

- Concrete reasons with specifics (not generic "too complex")
- Reference deployment modes where it fails (e.g., "only works on OpenShift, not RHEL")
- Reference specific technical limitations

### Option 2: Name (Rejected)

...

### Option N: Name (Considered, partially adopted)

If an approach was studied for patterns but not adopted directly, explain what was taken and what was left behind.

## Decision

What we chose and **why this approach wins** over the alternatives. Be specific.

### Diagrams

Include ASCII diagrams showing:

- Data/request flow
- Component relationships
- Decision trees
- Sequence diagrams

Diagrams make ADRs scannable — a reader should understand the decision from the diagram alone.

## Consequences

**Positive:**

- What this enables

**Negative:**

- What this costs, and how the costs are mitigated

## Related

- File paths to implementation
- Links to related ADRs
```

### ADR Index

Each feature's `adrs/README.md` is a one-line-per-ADR index:

```markdown
# Architecture Decision Records

| ADR                 | Title             | Status   |
| ------------------- | ----------------- | -------- |
| [001](001-title.md) | Descriptive title | Accepted |
| [002](002-title.md) | Another title     | Accepted |
```

## Conventions

### Feature Numbering

Features use sequential numbering: `001-feature-name`, `002-feature-name`, etc.

### Spec Lifecycle

```
Draft → /speckit.specify
  ↓
Gaps? → /speckit.clarify (iterate until clear)
  ↓
Architecture → /speckit.plan (review with team)
  ↓
Tasks → /speckit.tasks (review dependency order)
  ↓
Checklists → /speckit.checklist (optional, for quality gates)
  ↓
Implementation → /speckit.implement (can be run incrementally)
  ↓
ADRs → /speckit.adr (capture key decisions)
  ↓
Consistency → /speckit.analyze (verify alignment)
  ↓
Issues → /speckit.taskstoissues (optional, for GitHub tracking)
```

### Context File

For multi-session work, maintain a `.claude/CONTEXT.md` file that captures the current implementation state, remaining work, and key patterns. This is read at the start of each Claude Code session to restore context.

## Quick Reference

```bash
# Start a new feature
/speckit.specify specs/002-my-feature

# Refine the spec
/speckit.clarify specs/002-my-feature

# Design the architecture
/speckit.plan specs/002-my-feature

# Break into tasks
/speckit.tasks specs/002-my-feature

# Add quality gates (optional)
/speckit.checklist specs/002-my-feature

# Verify consistency
/speckit.analyze specs/002-my-feature

# Implement everything
/speckit.implement specs/002-my-feature

# Generate ADRs for key decisions
/speckit.adr specs/002-my-feature

# Create GitHub issues (optional)
/speckit.taskstoissues specs/002-my-feature
```
