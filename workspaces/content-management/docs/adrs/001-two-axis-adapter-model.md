# ADR-001: Two-Axis Adapter Model

**Status**: Accepted
**Date**: 2026-09-14
**Deciders**: Content management team
**Scope**: The whole plugin set — how storage backends and content types are extended.

## Context

Content management in Automation Platform today is coupled to a single backend. Adding a
storage backend and adding a content type are different kinds of change, but a coupled
design makes them the same change: every new content type has to learn every backend, and
every new backend has to learn every content type. The cost of the Nth addition grows with
N, which is how a stack becomes closed in practice while remaining open on paper.

The outcome this work serves requires both axes to move independently: any OCI-compliant
registry (and later an SCM, a filesystem, a bundled registry) must work, and new content
types — skills, policies, whatever comes next — must be addable without touching the core.

## Alternatives Considered

| Alternative                                                    | Why rejected                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| One adapter per (backend × content type) pair                  | Quadratic. Five backends and five content types is twenty-five adapters, each a place for behaviour to diverge.           |
| A single content service that branches on backend and type     | The branches _are_ the coupling. Every addition edits shared code, and "no core change" becomes untestable.               |
| Backend-specific content models (an OCI model, a Galaxy model) | Forces the UI and any consumer to know where content came from, which pushes the coupling outward instead of removing it. |

## Decision

**Storage backend and content type are independent plug-in axes, joined by a universal
content object.**

1. **`BackendAdapter`** knows a protocol and nothing about Ansible. The OCI implementation
   knows HTTP and the Distribution v2 API; it has never heard of an execution environment.
2. **`ContentTypeAdapter`** knows content semantics and nothing about transport. It
   receives a `BackendAdapter` and uses only the interface.
3. **`ContentObject`** (in `@ansible/content-model`) is the universal shape both produce
   and every consumer reads. It imports nothing — no Backstage, no storage, no UI — so it
   cannot acquire a dependency on either axis.

### The rule that keeps the axes apart

**A content-type adapter must never branch on backend identity.** A `backend.id === 'oci'`
check collapses the two axes into one and defeats the design, however locally convenient
it is. Where behaviour must vary, it varies on a **capability** (ADR-003), which is a
property of the backend that the adapter can ask about without knowing which backend it is.

### How the decision is tested

Adding a second content type must require a new adapter and no core change. This is the
extensibility claim the whole outcome rests on, and it is the one criterion that cannot be
retrofitted: if it fails, the failure is in the model, not the implementation.

## Consequences

- Package structure enforces the separation rather than convention doing it:
  `content-model` imports nothing, `automation-content-common` knows OCI and not Ansible,
  and content semantics live only in adapters.
- An adapter can be written against the interfaces before any backend supports it.
- The cost is one indirection on every path, and a `ContentObject` that is occasionally
  more general than a single content type needs.
