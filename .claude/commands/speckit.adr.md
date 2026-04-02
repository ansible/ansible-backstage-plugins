---
description: Generate Architecture Decision Records (ADRs) for key decisions made during feature implementation. Extracts trade-offs from spec, plan, and code to produce structured ADRs with diagrams.
---

## User Input

```text
$ARGUMENTS
```

## Outline

1. **Locate the feature directory**:
   - Parse the argument for the feature path (e.g., `specs/001-feature-name`)
   - If no argument provided, look for the most recently modified `specs/*/` directory
   - Verify `spec.md` and `plan.md` exist in the feature directory

2. **Read design artifacts**:
   - Read `spec.md` for requirements and constraints
   - Read `plan.md` for architecture decisions, alternatives considered, and trade-offs
   - Read `tasks.md` for implementation notes and status
   - Read existing `adrs/` directory if it exists (to avoid duplicates)
   - Scan implementation code for patterns that imply architectural decisions (e.g., custom service factories, auth patterns, deployment-specific logic)

3. **Identify ADR-worthy decisions**:
   A decision deserves an ADR when:
   - Multiple viable approaches were considered and one was chosen
   - The choice affects multiple components or deployment modes
   - The decision was changed during implementation
   - Future developers would likely ask "why was it done this way?"

   Look for these signals in the plan:
   - Sections comparing approaches ("Option A vs Option B")
   - Phrases like "instead of", "rather than", "we chose", "rejected because"
   - Deployment-specific logic (RHEL vs OpenShift vs local)
   - Security decisions (encryption, auth patterns, permission models)
   - Integration patterns (how plugins communicate, config merging)

4. **Generate ADRs** using this format for each decision:

   ```markdown
   # ADR-NNN: Descriptive Title

   **Status**: Accepted
   **Date**: <today>
   **Deciders**: Portal team

   ## Context

   What problem are we solving? What constraints exist?

   ## Alternatives Considered

   ### Option 1: Name (Rejected)

   Brief description.

   **Why rejected:**

   - Specific technical reasons (not generic)
   - Which deployment modes it fails on
   - What breaks or becomes fragile

   ### Option 2: Name (Rejected)

   ...

   ## Decision

   What we chose.

   **Why this approach wins:**

   - Specific advantages over each rejected alternative

   ### Diagrams

   Include at least one ASCII diagram:

   - Data/request flow diagrams for integration decisions
   - Component relationship diagrams for architecture decisions
   - Decision tree diagrams for mode/branching decisions
   - Sequence diagrams for multi-step processes

   ## Consequences

   **Positive:**

   - What this enables

   **Negative:**

   - What this costs and how costs are mitigated

   ## Related

   - Implementation file paths
   - Related ADR references
   ```

5. **Create the ADR files**:
   - Create `specs/<feature>/adrs/` directory if it doesn't exist
   - Number ADRs sequentially: `001-`, `002-`, etc.
   - Use kebab-case descriptive filenames: `001-db-config-source-over-env-vars.md`
   - Create `README.md` index with one line per ADR

6. **Quality checks**:
   - Every ADR MUST have at least one rejected alternative with specific "Why rejected" reasons
   - Every ADR MUST have at least one ASCII diagram
   - Every ADR MUST have both positive and negative consequences
   - "Why rejected" reasons must be specific to the project (not generic like "too complex")
   - Diagrams must be understandable without reading the prose
   - Related section must reference actual file paths that exist in the codebase

7. **Report**:
   - List the ADRs created with their titles
   - For each ADR, show the key trade-off in one sentence
   - If any decisions from the plan were NOT captured as ADRs, explain why (e.g., "obvious choice with no viable alternatives")
