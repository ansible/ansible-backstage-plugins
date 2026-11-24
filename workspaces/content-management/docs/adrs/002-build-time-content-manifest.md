# ADR-002: Build-Time Content Manifest

**Status**: Accepted
**Date**: 2026-09-14
**Deciders**: Content management team
**Scope**: How the contents of an execution environment are determined.

## Context

Portal has to answer "what is inside this execution environment" — which collections, which
modules, which plugins, with documentation good enough to search and to resolve a
`requirements.yml` against. An execution environment is a container image of a few hundred
megabytes to a few gigabytes, and the question is asked for every image in a registry, on
every reconcile.

Two properties are in tension. **Cost**: pulling images to introspect them does not scale
to a catalog. **Correctness**: an execution environment ships a specific `ansible-core`,
and extracting documentation from outside the image with a _different_ core resolves
documentation fragments, plugin loading and argument specs differently. The output is not
merely approximate — it can be quietly wrong, which is worse.

## Alternatives Considered

| Alternative                                              | Why rejected                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Pull each image and run `ansible-doc` inside it          | Correct, and roughly four orders of magnitude too expensive at consumption time. Reserved as ladder level 4 and deliberately not built. |
| Extract from outside using the portal's own ansible-core | Cheaper, and silently wrong whenever the image's core differs. A wrong answer presented confidently is the worst outcome available.     |
| Labels only, no manifest                                 | Labels are size-limited and cannot carry per-plugin documentation. Good as a fallback, insufficient as the target state.                |
| A separate metadata service alongside the registry       | Adds a component to deploy, and creates a second source of truth that can drift from the image it describes.                            |

## Decision

**The content inventory is generated at build time, by the image's own `ansible-core`, and
published alongside the image as an OCI referrer.**

1. A generator runs **inside the image** during the build and writes a content manifest to
   `/usr/share/ansible/content-manifest.json`. It records `generatedBy.ansibleCore`, so a
   consumer can always tell build-time extraction from external introspection.
2. The manifest is pushed as a separate OCI artifact whose `subject` is the image manifest.
   Reading it costs a few HTTP calls instead of a pull.
3. Consumption reads the manifest from the registry. Measured against a live Quay: a
   563 MB image's complete inventory — 5 collections, 200 plugins, 19 EDA plugins,
   15 rulebooks, with nested suboptions and examples — read in **80 ms**. Generation costs
   **3.6 s** once, at build time, where it belongs.
4. Where no manifest exists, determination falls back down an **enumeration ladder**:
   referrer manifest → config-blob labels → selective blob fetch → full pull →
   `unknown`. Every level records its `source` and fidelity.
5. **`unknown` is a first-class state, not an error.** "Contains no collections" and
   "contents could not be determined" are different facts and must never render the same.

No change to `ansible-builder` was required to prove this: `additional_build_files` plus
`additional_build_steps.append_final` are sufficient, so the upstream ask is "promote this
to built-in", not "make this possible".

## Consequences

- Fidelity is a property of the data, not an assumption. Externally-derived enumerations
  must never be presented as authoritative.
- Images built before this convention existed still work, one rung down the ladder.
- The manifest must be published by whatever builds the image; a build that skips it
  produces a correct but less informative catalog entry.
