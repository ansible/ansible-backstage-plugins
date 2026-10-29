# ADR-007: Agent Skills Location

**Audience:** `host` — see [ADR index](../index.md).

**Date:** 2026-06-23
**Status:** Accepted
**Related features:** All features involving AI agent workflows

## Context

AI agent skills (Claude Code, Cursor, and future agents) encode project-specific workflows, design standards, and automation patterns. These skills need to be:

1. **Discoverable** by any agent, not locked to one vendor's directory structure
2. **Shareable** across the team via git, not siloed in per-developer config
3. **Consistent** with the repo's convention of clear top-level directories for different artifact types

Skills were initially placed in `.cursor/skills/` (Cursor-specific) and `.claude/skills/` (Claude-specific). This forced each agent to look in its own directory and required symlinks for cross-agent use.

## Decision

This decision applies to the team's private process material, not this public
plugin repository. This checkout has no `skills/` directory at the
repository root.

Agent skills are maintained outside this repository, one directory per skill with
a `SKILL.md` entry point plus optional examples and evaluation cases. Developers
link them into each agent's expected directory on their own machine, so the same
skill serves Claude Code, Cursor, and other agents without a per-vendor copy in
git.

Do not add a `skills/` directory here, and do not check in symlink recipes that
only work from a private checkout.

## Alternatives Considered

### `.claude/skills/` (Claude-specific)

Skills live in Claude Code's native directory. Other agents need symlinks or copies.

Rejected: Vendor lock-in. Cursor users don't know to look in `.claude/`. Skills are project artifacts, not agent configuration.

### `.cursor/skills/` (Cursor-specific)

Same problem in reverse. Claude Code users don't know to look in `.cursor/`.

Rejected: Same vendor lock-in issue.

### Per-agent directories with shared symlinks

Keep `.claude/skills/` and `.cursor/skills/` as the canonical locations, with shared content via symlinks.

Rejected: Git doesn't track symlinks well across platforms. Windows users hit path issues. Two sources of truth.

## Consequences

### Positive

- Agent-agnostic: any AI tool can read the shared skill tree without vendor-specific path knowledge
- Single source of truth: no per-vendor copies or duplicate content
- Discoverable: the process repository has one obvious place to add a skill
- Bounded: this repository documents where skills are _not_ kept, so contributors stop guessing

### Negative

- Requires initial symlink setup per developer, documented in the skill index
- Agents that auto-discover skills from their native directory need that symlink
- Adding a new agent means adding one more symlink command to the team's setup notes
