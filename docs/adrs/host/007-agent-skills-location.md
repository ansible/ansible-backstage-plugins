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

This decision applies to the Portal team's **private process repository**, not this public plugin repository. This checkout has no `skills/` directory; `portal-design` is **not published here**. Do not run the symlink commands below from `ansible-backstage-plugins`.

All agent skills live under the top-level `skills/` directory of the process repository:

```
skills/
├── README.md                          Setup instructions and skill index
├── portal-design/                     Portal design system skill
│   ├── SKILL.md                       Skill definition (read by agents)
│   ├── reference.md                   Extended examples
│   ├── README.md                      Human-readable usage guide
│   └── eval/                          Evaluation test cases
└── ansible-portal-helm-dev-testing/   Helm dev testing skill
    ├── SKILL.md
    └── eval/
        └── eval.json
```

Developers symlink skills into their agent's expected directory:

```bash
mkdir -p ~/.claude/skills ~/.cursor/skills
ln -sf $(pwd)/skills/portal-design ~/.claude/skills/portal-design
ln -sf $(pwd)/skills/portal-design ~/.cursor/skills/portal-design
```

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

- Agent-agnostic: any AI tool can read `skills/` without vendor-specific path knowledge
- Single source of truth: no symlink chains or duplicate content
- Visible at repo root: new contributors discover skills naturally
- Consistent with ADR-006 (clear top-level directories by artifact type)

### Negative

- Requires initial symlink setup per developer (documented in `skills/README.md`)
- Agents that auto-discover skills from their native directory need the symlink
- Adding a new agent means adding one more symlink command to the README
