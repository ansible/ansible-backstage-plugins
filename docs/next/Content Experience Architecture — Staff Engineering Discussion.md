# Content Experience Architecture — Working Document for Staff Engineering Discussion

**How do we build a consistent, content-agnostic, backend-agnostic experience that surfaces trust, intent, and quality to humans, large language models (LLMs), and scripted consumers alike?**

References: [ABU | Content Prominence Strategy](https://docs.google.com/document/d/19yPgMPL9HcaDdnB9v6X5-OOQ4g83gAnHDorFgnQSJsw/edit?usp=sharing)

> **Discussion status:** This document records the hypotheses and alternatives that led to the approved architecture. Where exploratory examples conflict with the [Content Experience Architecture Refactoring and Migration Plan](Content%20Experience%20Architecture%20Refactoring%20and%20Migration%20Plan.md), the migration plan and its approved Architecture Decision Records (ADRs) are normative.

## THE TWO QUESTIONS THIS DOCUMENT MUST ANSWER

### Question 1: How do we make the content experience consistent for humans, LLMs, and scripted headless interactions?

All three consumer types — a human browsing the Ansible Portal, an AI agent querying via MCP, and a CI/CD pipeline calling a REST API — must see the same content, the same trust signals, the same relationships, and the same quality indicators. The architecture must treat these as three equal consumption surfaces over a single source of truth, not as a primary UI with bolted-on APIs.

### Question 2: How do we ensure a consistent content-agnostic framework that surfaces trust, intent, and quality independently from (A) the type of content and (B) the backend the customer brings?

Whether the content is a collection, an execution environment, a skill, an agent, an MCP server, or a type that doesn't exist yet — and whether it lives in our managed registry, a customer's container registry, their Git repository, or a network filesystem — the platform must surface the same categories of signals through the same interfaces. The architecture must define an abstraction layer that normalizes these signals regardless of origin.

## DESIGN CONSTRAINTS

1\. The experience is implemented in Ansible Portal, which is based on RHDH (Red Hat Developer Hub) / Backstage.
2\. We ship a managed content backend (the specific technology is an outcome of architecture decisions, not a constraint).
3\. Customers may bring their own backends: container registries, Git repos (GitHub, GitLab, Gitea), SCM systems, or local/network filesystems.
4\. The content type taxonomy will grow over time. Schema-driven types must reuse generic behavior; types with distinct semantics, lifecycle, processing, operations, or user experience use explicit extension packages rather than changes to source adapters or core orchestration.
5\. Headless access (API \+ MCP) has equal architectural weight to UI access.
6\. The enrichment pipeline (trust signals, metadata, AI-generated context) must work regardless of content source.

## THE CONTENT PRIMITIVES MODEL

At the center of this architecture is a content-agnostic abstraction: the Content Primitives. These are the signals that every content item should carry, independent of what it is or where it came from.

### TRUST PRIMITIVES — Is this content reliable?

| Primitive            | Description                                     | Source                                                   |
| :------------------- | :---------------------------------------------- | :------------------------------------------------------- |
| certification_status | Certified / Validated / Org-Managed / Community | Certification pipeline or org policy                     |
| publisher_identity   | Who published this? Verified?                   | Registry metadata \+ verification                        |
| signing_status       | Signed? By whom? Verifiable?                    | Source-appropriate signature or attestation verification |
| provenance_chain     | Where did this come from? Build reproducible?   | SLSA/in-toto attestation                                 |
| security_scan        | CVE status, SBOM available?                     | Scanner output (Grype, Trivy, etc.)                      |
| behavioral_testing   | Tested in real environments? Known outcomes?    | Test harness results                                     |
| dependency_health    | Are all dependencies also healthy/certified?    | Computed from dependency graph                           |
| support_boundary     | Supported? By whom? SLA?                        | Certification metadata                                   |
| content_freshness    | Last updated, last verified, last re-certified  | Registry/pipeline timestamps                             |

### INTENT PRIMITIVES — Does this content solve my problem?

| Primitive              | Description                                    | Source                          |
| :--------------------- | :--------------------------------------------- | :------------------------------ |
| business_use_cases     | What outcomes does this enable?                | AI-generated or manual metadata |
| target_infrastructure  | What endpoints/platforms does this target?     | galaxy.yml, capabilities.yml    |
| compliance_alignment   | SOC2, HIPAA, FedRAMP, PCI-DSS, etc.            | Metadata tags                   |
| capability_definitions | Structured capability-to-outcome mappings      | capabilities.yml or equivalent  |
| content_intent         | What problem does this solve? In what context? | AI-generated classification     |
| industry_verticals     | Financial services, healthcare, manufacturing  | Metadata tags                   |

### QUALITY PRIMITIVES — Is this content production-ready?

| Primitive            | Description                                     | Source                              |
| :------------------- | :---------------------------------------------- | :---------------------------------- |
| code_quality         | Linting, sanity checks, best practice adherence | Pipeline output                     |
| documentation        | Docs exist? Complete? Auto-generated?           | File presence \+ completeness check |
| test_coverage        | Tests exist? Pass? What's covered?              | Test harness output                 |
| structure_compliance | Follows content-type best practices?            | Linter/validator output             |
| maintenance_signals  | Active maintenance? Response time?              | Commit/release history              |
| compatibility_matrix | Tested against which platforms/versions?        | Test matrix output                  |

The key architectural property: these primitives are COMPUTED, not assumed. Different backends will provide different raw inputs. The enrichment layer computes primitives from whatever is available and marks missing signals as "unknown" — never fabricates data.

## ARCHITECTURE HYPOTHESIS

Overview: The architecture is a four-layer stack. Content flows upward from heterogeneous backends through adapters, gets normalized and enriched into content primitives, and is consumed through three equal surfaces.

    LAYER 4 — CONSUMPTION SURFACES
    ┌───────────────────────────────────────────────────────────────────┐
    │                                                                   │
    │   ┌──────────────┐   ┌──────────────┐    ┌──────────────┐         │
    │   │  Portal UI   │   │   REST API   │    │ MCP Endpoint │         │
    │   │  (Backstage  │   │  (Headless / │    │ (AI Agents / │         │
    │   │   Frontend   │   │   Scripted)  │    │    LLMs)     │         │
    │   │   Plugins)   │   │              │    │              │         │
    │   └──────┬───────┘   └──────┬───────┘    └──────┬───────┘         │
    │          │                  │                   │                 │
    │          └──────────────────┼───────────────────┘                 │
    │                             │                                     │
    └─────────────────────────────┼─────────────────────────────────────┘
                                  │
                          Same API contract
                                  │
    LAYER 3 — CONTENT PRIMITIVES SERVICE
    ┌─────────────────────────────┼─────────────────────────────────────┐
    │                             │                                     │
    │   ┌─────────────────────────▼─────────────────────────────┐       │
    │   │           Content Primitives API                      │       │
    │   │                                                       │       │
    │   │  • Discovery (search, filter, resolve-by-intent)      │       │
    │   │  • Trust signals (certification, signing, scans)      │       │
    │   │  • Intent signals (use cases, compliance, targets)    │       │
    │   │  • Quality signals (tests, docs, code quality)        │       │
    │   │  • Relationships (dependencies, composition, chains)  │       │
    │   │  • Content manifest (versions, artifacts, downloads)  │       │
    │   └─────────────────────────┬─────────────────────────────┘       │
    │                             │                                     │
    │   ┌─────────────────────────▼─────────────────────────────┐       │
    │   │           Enrichment Engine                           │       │
    │   │                                                       │       │
    │   │  • Trust Score Computation                            │       │
    │   │  • AI Metadata Generation (business context)          │       │
    │   │  • Relationship Inference (dependency analysis)       │       │
    │   │  • Semantic Index Builder (for intent search)         │       │
    │   │  • Compatibility Matrix Computation                   │       │
    │   │  • Graceful Degradation Handler                       │       │
    │   └─────────────────────────┬─────────────────────────────┘       │
    │                             │                                     │
    │   ┌─────────────────────────▼─────────────────────────────┐       │
    │   │        Canonical Content and Primitive Store          │       │
    │   │                                                       │       │
    │   │  PostgreSQL content and primitive records              │       │
    │   │  Evidence, jobs, relationships, and outbox events      │       │
    │   │  Catalog and search are rebuildable projections        │       │
    │   └─────────────────────────┬─────────────────────────────┘       │
    │                             │                                      │
    └─────────────────────────────┼──────────────────────────────────────┘
                                  │
                       Adapter Interface
                  (Content Provider Contract)
                                  │
    LAYER 2 — BACKEND ADAPTERS
    ┌─────────────────────────────┼────────────────────────────────────┐
    │                             │                                    │
    │   ┌────────────┐  ┌────────┴───┐  ┌────────────┐  ┌────────────┐ │
    │   │  Managed   │  │   OCI      │  │    Git     │  │ Filesystem │ │
    │   │  Registry  │  │  Registry  │  │  Provider  │  │  Scanner   │ │
    │   │  Adapter   │  │  Adapter   │  │  Adapter   │  │  Adapter   │ │
    │   └──────┬─────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘ │
    │          │              │               │               │        │
    └──────────┼──────────────┼───────────────┼───────────────┼────────┘
               │              │               │               │
    LAYER 1 — CONTENT BACKENDS (customer-controlled)
    ┌──────────┼──────────────┼───────────────┼───────────────┼──────┐
    │          │              │               │               │      │
    │   ┌──────▼─────┐  ┌────▼──────┐  ┌─────▼─────┐  ┌─────▼─────┐  │
    │   │   Quay /   │  │ Customer  │  │  GitHub / │  │  NFS /    │  │
    │   │  Managed   │  │   OCI     │  │  GitLab / │  │  Local /  │  │
    │   │  Registry  │  │  Registry │  │  Gitea    │  │  S3       │  │
    │   └────────────┘  └───────────┘  └───────────┘  └───────────┘  │
    │                                                                │
    └────────────────────────────────────────────────────────────────┘

## LAYER 1 — CONTENT BACKENDS

These are the systems where content physically lives. We don't control them (except for the managed registry we ship). The architecture must make no assumptions about which backends exist. The architecture should also assume we would have multiple backends connected, e.g. a customer could have content collections in an SCM, Execution Environments in a container registry and other types of content in the filesystem.

What we ship: A managed content registry (specific technology TBD — could be Quay, could be an OCI-compliant registry). This is the "batteries included" backend for customers who don't bring their own.

What customers bring: Any combination of container registries (Quay, Harbor, ECR, ACR, GAR, GHCR), SCM systems (GitHub, GitLab, Bitbucket, Gitea), or filesystems (NFS, local, S3-backed). We cannot enumerate all possibilities.

Open question: Should backends be opaque to the rest of the stack? If so the architecture never queries a backend directly — it goes through an adapter or a series of adapters.

## LAYER 2 — BACKEND ADAPTERS (Content Provider Contract)

Each backend type gets an adapter that implements a common Content Provider Contract. The adapter is responsible for:

1\. Discovery — Find content items in the backend (list repositories, scan directories, enumerate tags)
2\. Source Metadata Access — Return source-native transport metadata such as references, digests, media types, file paths, sizes, and timestamps without interpreting content semantics
3\. Artifact Access — Provide bounded manifest, blob, file, or download access to the actual content artifact
4\. Change Detection — Know when content changes (webhooks, polling, filesystem watches)
5\. Native Trust Material Access — Return source-native signatures, attestations, certification metadata, or scan references without evaluating their semantic validity. Git commit/tag signing and Open Container Initiative (OCI) artifact signing are distinct capabilities; an adapter declares only the material and mechanisms its source can expose, while trust processors perform verification.

The Content Provider Contract — Minimum Interface:

    interface ContentProvider {
      // Identity
      id: string                          // Unique provider identifier
      type: BackendType                   // 'oci-registry' | 'git' | 'filesystem' | 'custom'

      // Discovery
      listContent(filters?, pagination?): ContentManifest\[\]
      getContent(ref: ContentRef): ContentManifest

      // Artifact access
      getArtifactLocation(ref: ContentRef, version?): ArtifactLocation

      // Native metadata (best-effort — return what's available)
      getNativeMetadata(ref: ContentRef): NativeMetadata
      getNativeTrustSignals(ref: ContentRef): NativeTrustSignal\[\]

      // Change detection
      watch(callback: ChangeCallback): Subscription

      // Capabilities declaration
      getCapabilities(): ProviderCapabilities
    }

The getCapabilities() method is critical: it lets the adapter declare what source-format access it CAN provide. A managed registry adapter might expose manifests, blobs, OCI signature material, attestations, and security-scan references. A filesystem adapter might expose only listing, file reads, timestamps, and integrity metadata. Content-type and trust processors use these declared source capabilities to determine what they can evaluate or must mark as unsupported or unknown.

    interface ProviderCapabilities {
      supportsGitObjectSigning: boolean
      supportsOciArtifactSigning: boolean
      supportsAttestation: boolean
      supportsVersionHistory: boolean
      supportsWebhooks: boolean
      supportsManifestRead: boolean
      supportsBlobRead: boolean
      supportsFileRead: boolean
      supportsSecurityScanning: boolean
    }

In Backstage terms, an adapter is a backend service extension, not inherently an `EntityProvider`. It discovers and reads source artifacts through capability contracts. Only a separate content-type adapter inspects semantic markers such as `galaxy.yml`, README content, or file structure and identifies content types. Canonical records are persisted in the content service, and a dedicated Catalog projector implements the Backstage provider integration. This separation keeps source protocols usable outside Catalog and makes Catalog rebuildable.

Writing a new adapter: When a customer has a backend we haven't anticipated, they (or we) write a new adapter implementing the Content Provider Contract. The contract is designed so that a minimal adapter only needs to implement listContent, getContent, and getArtifactLocation — everything else has sensible defaults or "not supported" responses. The enrichment layer handles the rest.

## LAYER 3 — CONTENT PRIMITIVES SERVICE

This is the core of the architecture — the layer that transforms raw, heterogeneous backend data into normalized content primitives consumable by any surface.

Components:

Canonical Content and Primitive Store:
The content service's PostgreSQL repositories are the single source of truth for normalized content metadata, primitive revisions, evidence, jobs, and events. Every content item, regardless of origin, has canonical records for:

- Core identity (name, namespace, version, content type, source backend)
- Trust primitives (computed from native signals \+ enrichment)
- Intent primitives (from metadata or AI generation)
- Quality primitives (from pipeline outputs or inference)
- Relationship edges (computed from dependency analysis)

The same transaction that changes canonical state writes an outbox event. Catalog and search projectors consume those events to update Backstage entities, annotations, relations, lexical indexes, and vector indexes. These projections can be rebuilt and are not authoritative primitive storage.

Enrichment Engine:
Takes raw metadata from adapters and computes content primitives. This could be a “certification pipeline” that bridges the gap between what a backend provides and what the experience needs.

    ┌─────────────────────────────────────────────────────┐
    │                 ENRICHMENT PIPELINE                 │
    │                                                     │
    │  Raw Metadata ──► Trust Computation                 │
    │  from Adapter     • Verify signatures (cosign)      │
    │                   • Check attestations (in-toto)    │
    │                   • Query scan results              │
    │                   • Compute dependency health       │
    │                   • Determine certification status  │
    │                   • Assign trust score              │
    │                                                     │
    │              ──► Intent Computation                 │
    │                   • Extract from galaxy.yml,        │
    │                     capabilities.yml, README        │
    │                   • AI-generate if missing          │
    │                     (from templates per content     │
    │                     type)                           │
    │                   • Classify intent and use cases   │
    │                   • Map to compliance standards     │
    │                                                     │
    │              ──► Quality Computation                │
    │                   • Check doc completeness          │
    │                   • Validate structure              │
    │                   • Check test presence             │
    │                   • Assess maintenance signals      │
    │                                                     │
    │              ──► Relationship Inference             │
    │                   • Parse dependency files          │
    │                   • Compute compatibility matrix    │
    │                   • Link content to required EEs    │
    │                   • Connect skills to collections   │
    │                   • Infer "composable with" edges   │
    │                                                     │
    │              ──► Semantic Indexing                  │
    │                   • Build vector embeddings from    │
    │                     enriched metadata               │
    │                   • Index for intent-based search   │
    │                                                     │
    │              ──► Primitive records and outbox event │
    │                    ──► Catalog/search projectors     │
    └─────────────────────────────────────────────────────┘

Graceful Degradation Handler:
When a backend can't provide certain signals, the handler:
\- Marks the signal as "unknown" (never fabricates)
\- Records the reason ("source backend does not support signing")
\- Offers remediation where possible ("upload to managed registry to enable signing")
\- Applies the approved versioned trust policy; any aggregate score records evidence, policy version, uncertainty, and missing-signal treatment rather than assigning a fixed value by source type

Content Primitives API:
The unified API that all consumption surfaces use. This is the answer to Question 1 — how consistency is achieved across humans, LLMs, and scripted access.

    ┌─────────────────────────────────────────────────────────────────┐
    │                    CONTENT PRIMITIVES API                       │
    │                                                                 │
    │  DISCOVERY                                                      │
    │  ────────                                                       │
    │  POST /content/search                                           │
    │    • Keyword search across all content types and backends       │
    │    • Semantic/intent search ("automate Cisco router backup")    │
    │    • Faceted filtering (type, certification, backend, tags)     │
    │    • Results ranked by trust score \+ intent relevance           │
    │                                                                 │
    │  POST /content/resolve                                          │
    │    • Intent-based resolution                                    │
    │    • Input: natural language intent \+ context                   │
    │    • Output: ranked content set with relationships explained    │
    │                                                                 │
    │  CONTENT DETAILS                                                │
    │  ───────────────                                                │
    │  GET /content/{ref}                                             │
    │    • Full entity with all primitives                            │
    │    • Trust signals with source attribution                      │
    │    • Intent metadata                                            │
    │    • Quality signals                                            │
    │                                                                 │
    │  GET /content/{ref}/trust                                       │
    │    • Detailed trust breakdown per signal                        │
    │    • Signal source and freshness                                │
    │    • Missing signals with reasons                               │
    │                                                                 │
    │  GET /content/{ref}/relationships                               │
    │    • All related content with relationship type                 │
    │    • Explanation of each relationship                           │
    │    • Actionable next steps per relationship                     │
    │                                                                 │
    │  GET /content/{ref}/chain                                       │
    │    • Full production chain                                      │
    │    • collection → EE → skill → job template → workflow          │
    │    • Trust status of each node in the chain                     │
    │                                                                 │
    │  ARTIFACT ACCESS                                                │
    │  ───────────────                                                │
    │  GET /content/{ref}/artifact                                    │
    │    • Proxied or redirected download from source backend         │
    │    • Signature verification before delivery                     │
    │                                                                 │
    │  CATALOG METADATA                                               │
    │  ────────────────                                               │
    │  GET /content/types                                             │
    │    • Available content types with counts                        │
    │  GET /content/backends                                          │
    │    • Registered backends with capability declarations           │
    │  GET /content/facets                                            │
    │    • Aggregated facet values for building filter UIs            │
    └─────────────────────────────────────────────────────────────────┘

This single API is consumed identically by:
\- Backstage frontend plugins (UI) via internal service calls
\- External REST clients (scripted/CI/CD) via authenticated API gateway
\- MCP endpoint (LLMs/AI agents) via MCP tool wrappers around the same operations

## LAYER 4 — CONSUMPTION SURFACES

Three surfaces, one API, zero divergence.

    ┌──────────────────────────────────────────────────────────────────────┐
    │                       CONSUMPTION SURFACES                           │
    │                                                                      │
    │  PORTAL UI (Backstage Frontend Plugins)                              │
    │  ──────────────────────────────────────                              │
    │  • Content Catalog Plugin — browse, search, filter                   │
    │  • Content Detail Plugin — entity page with trust/intent/quality     │
    │  • Content Graph Plugin — visual relationship explorer               │
    │  • Content Lifecycle Plugin — org certification workflows            │
    │  • Semantic Search Plugin — intent-based discovery UI                │
    │                                                                      │
    │  All plugins call the Content Primitives API.                        │
    │  They NEVER query backends directly.                                 │
    │                                                                      │
    │                                                                      │
    │  REST API (Headless / Scripted)                                      │
    │  ─────────────────────────────                                       │
    │  • Same Content Primitives API exposed through API gateway           │
    │  • Bearer token authentication                                       │
    │  • OpenAPI specification published for client generation             │
    │  • Pagination, filtering, field selection                            │
    │  • Webhook subscriptions for content change events                   │
    │                                                                      │
    │  Use cases: CI/CD pipelines fetching content, custom tooling,        │
    │  integration with external systems, ansible-galaxy CLI               │
    │                                                                      │
    │                                                                      │
    │  MCP ENDPOINT (LLMs / AI Agents)                                     │
    │  ────────────────────────────────                                    │
    │  • MCP Server wrapping Content Primitives API operations             │
    │  • Tools exposed:                                                    │
    │    \- search\_content (keyword \+ semantic)                             │
    │    \- resolve\_intent (NL → ranked content set)                        │
    │    \- get\_content\_details (full primitives)                           │
    │    \- get\_trust\_signals (certification, signing, scans)               │
    │    \- get\_relationships (what goes with what, and why)                │
    │    \- get\_production\_chain (discovery → deployment path)              │
    │  • Same RBAC and audit as UI and API                                 │
    │  • Progressive discovery (tools listed on connect)                   │
    │  • User-scoped access (agent inherits user's permissions)            │
    │                                                                      │
    │  Use cases: Cursor/Claude Code asking "what collection handles       │
    │  Cisco backup?", ChatGPT recommending content, autonomous            │
    │  agents building automation workflows                                │
    └──────────────────────────────────────────────────────────────────────┘

## DATA FLOW — CONCRETE SCENARIO

Scenario: A customer has a Cisco networking collection in their GitLab instance. Another team member searches for "automate Cisco router backup" in the Portal. An AI agent asks the same question via MCP.

    Step 1: REGISTRATION
    Customer registers their GitLab instance as a content backend in the Portal.
    The Git Provider Adapter is configured with credentials and repo paths.

    Step 2: DISCOVERY & INGESTION
    ┌──────────────┐
    │   GitLab     │     Git Adapter enumerates configured repositories
    │   Instance   │──── and refs, resolves an immutable commit, and
    │              │     provides bounded metadata and file reads
    └──────────────┘
           │
           ▼
    ┌──────────────┐
        │ Git Adapter  │    Exposes source-native material:
        │              │     • Immutable commit and file tree
        │              │     • Bounded galaxy.yml and README.md file reads
        │              │     • Commit timestamps and history
        │              │     • Git signature material (if present)
        │              │     Declares file/history/signature-material
        │              │     access capabilities only
    └──────────────┘
          │
          ▼  Resolved artifact + source-native metadata/material
        ┌──────────────────────┐
        │ Collection Type      │    Identifies galaxy.yml/meta markers and
        │ Adapter              │    extracts collection name, version,
        │                      │    dependencies, tags, and documentation
        └──────────────────────┘
          │
          ▼  Normalized collection observation + evidence inputs
    Step 3: ENRICHMENT
    ┌──────────────────────────────────────────────────────┐
    │                ENRICHMENT ENGINE                     │
    │                                                      │
    │  TRUST:                                              │
    │  • certification\_status \= "unknown" (not certified)  │
    │  • signing\_status \= "unknown" when no supported      │
    │    Git commit or tag signature can be verified       │
    │  • security\_scan \= "not\_scanned" (offer to scan)     │
    │  • dependency\_health \= computed from galaxy.yml deps │
    │  • trust evaluation records present, missing, and     │
    │    unknown evidence under a versioned policy         │
    │                                                      │
    │  INTENT:                                             │
    │  • Extracted from galaxy.yml: targets Cisco IOS      │
    │  • AI-generated: business use cases, compliance tags │
    │    (generated from template for networking content)  │
    │  • content\_intent \= "network device management"      │
    │                                                      │
    │  QUALITY:                                            │
    │  • documentation \= "present" (README found)          │
    │  • tests \= "present" (tests/ directory found)        │
    │  • structure \= "valid" (ansible-lint passed)         │
    │                                                      │
    │  RELATIONSHIPS:                                      │
    │  • dependsOn: cisco.ios base collection              │
    │  • requiresEE: derived only from declared or observed │
    │    runtime dependency and compatibility evidence     │
    │  • composableWith: identified from intent similarity │
    └──────────────────────────────────────────────────────┘
           │
           ▼  Normalized entity with all primitives
           │
    Step 4: STORAGE
    Canonical records stored in the content service with:
    \- Full primitive data and evidence (trust/intent/quality)
    \- Relationship records to related content
    \- Transactional outbox events for projection
    Catalog and search projectors then publish selected summaries,
    relationship edges, and semantic embeddings.
    \- Source attribution: "backend: customer-gitlab, repo: infra/cisco-backup"

    Step 5: CONSUMPTION (same data, three surfaces)

    HUMAN (Portal UI):
    User searches "automate Cisco router backup"
    → Semantic search matches intent primitives
    → Results ranked according to the approved, versioned policy and
      disclosed relevance/trust provenance
    → Both shown with trust breakdown:
      cisco.ios: \[Certified ✓\] \[Signed ✓\] \[Scanned ✓\]
      cisco\_backup: \[Not certified\] \[Not signed\] \[Not scanned\]
    → Relationship panel: "cisco\_backup depends on cisco.ios.
      To use in production, you need an EE containing both."

    AI AGENT (MCP):
    Agent calls resolve\_intent("automate Cisco router backup")
    → Same ranked results with same primitives
    → Agent evaluates trust signals programmatically
    → Agent can call get\_provenance\_chain() to understand
      the full path from collection to running automation

    SCRIPT (REST API):
    CI pipeline calls POST /content/search
      {"query": "cisco backup", "trust_status": "verified"}
    → Returns only authorized content meeting the policy-defined filter
    → Pipeline downloads artifact, verifies signature,
      builds EE, deploys

## DATA FLOW — RED HAT CERTIFIED CONTENT (CONTRAST)

For comparison, here's the same flow for content that passes through the Red Hat certification pipeline:

    ┌──────────────┐
    │  Upstream    │     Content enters Red Hat certification pipeline
    │  Collection  │────►
    │  (Partner/RH)│
    └──────────────┘
           │
           ▼
    ┌──────────────────────────────────────────────────────┐
    │            RED HAT CERTIFICATION PIPELINE            │
    │                                                      │
    │  1\. Code review and validation                       │
    │  2\. Automated testing (sanity, integration, linting) │
    │  3\. Security scanning (CVE, SBOM generation)         │
    │  4\. Behavioral testing (real environment execution)  │
    │  5\. Metadata enrichment (AI-generated business       │
    │     context from templates)                          │
    │  6\. Signing (cosign, in-toto attestation)            │
    │  7\. Publication to managed registry                  │
    └──────────────────────────────────────────────────────┘
           │
           ▼
    ┌──────────────┐
    │  Managed     │     Managed Registry Adapter extracts:
    │  Registry    │     • OCI manifest with artifactType
    │  Adapter     │     • Cosign signatures via Referrers API
    │              │     • Attestations (SLSA, behavioral tests)
    │              │     • Full metadata (capabilities.yml, tags)
    │              │     Declares capabilities: ALL supported
    └──────────────┘
           │
           ▼
    ┌──────────────────────────────────────────────────────┐
    │                 ENRICHMENT ENGINE                    │
    │                                                      │
    │  TRUST:                                              │
    │  • certification\_status \= "certified"                │
    │  • signing\_status \= "signed" (cosign verified)       │
    │  • security\_scan \= "clean" (no CVEs, SBOM attached)  │
    │  • behavioral\_testing \= "passed" (attestation)       │
    │  • trust evaluation \= policy output with evidence,     │
    │    provenance, uncertainty, and policy version         │
    │                                                      │
    │  INTENT:                                             │
    │  • Rich metadata from certification pipeline         │
    │  • Full capabilities.yml with business outcomes      │
    │  • Compliance tags from pipeline analysis            │
    │                                                      │
    │  QUALITY:                                            │
    │  • All checks passed in certification pipeline       │
    └──────────────────────────────────────────────────────┘

Result: Red Hat certified content and customer Git-sourced content expose different evidence coverage. The UI, API, and MCP endpoint surface the same evidence and versioned policy output; no fixed score is assigned solely because of the source type.

## CONTENT-TYPE AGNOSTICISM — HOW IT WORKS

The system must handle collections, execution environments, skills, agents, MCP servers, and future types without coupling each type to a source backend. Schema-driven types can use generic behavior; types with distinct semantics, lifecycle, processing, or UI need owned extension packages.

    ┌──────────────────────────────────────────────────────────────────┐
    │                    CONTENT TYPE REGISTRY                         │
    │                                                                  │
    │  A schema-driven content type can be declared as configuration:  │
    │                                                                  │
    │  content\_type:                                                   │
    │    id: "ansible-collection"                                      │
    │    display\_name: "Collection"                                    │
    │    markers:                      \# How content-type adapters identify this type │
    │      \- file: "galaxy.yml"                                        │
    │      \- file: "meta/main.yml"                                     │
    │    metadata\_extractors:          \# How to read native metadata   │
    │      \- source: "galaxy.yml"                                      │
    │        fields: \[name, namespace, version, dependencies, tags\]    │
    │      \- source: "README.md"                                       │
    │        extract: "description"                                    │
    │    relationship\_rules:           \# How to infer relationships    │
    │      \- type: "dependsOn"                                         │
    │        source: "galaxy.yml:dependencies"                         │
    │      \- type: "requiresEE"                                        │
    │        source: "declared_runtime_dependencies"                   │
    │    quality\_checks:               \# What quality signals apply    │
    │      \- "ansible-lint"                                            │
    │      \- "sanity-test"                                             │
    │      \- "doc-completeness"                                        │
    │    ui\_components:                \# Which UI panels to show       │
    │      \- "module-list"                                             │
    │      \- "role-list"                                               │
    │      \- "dependency-tree"                                         │
    │      \- "playbook-examples"                                       │
    │                                                                  │
    │  content\_type:                                                   │
    │    id: "ansible-skill"                                           │
    │    display\_name: "Skill"                                         │
    │    markers:                                                      │
    │      \- file: "skill.yml"                                         │
    │    \# ... same structure, different values                        │
    │                                                                  │
    │  ADDING A NEW CONTENT TYPE:                                      │
    │  1\. Write a content type declaration (YAML)                      │
    │  2\. Register it in the Content Type Registry                     │
    │  3\. Use generic adapter, processor, and UI behavior only when    │
    │     the type's semantics fit those supported contracts           │
    │  4\. Otherwise add owned common/node/frontend extension packages │
    └──────────────────────────────────────────────────────────────────┘

The key property: the enrichment pipeline, the API, and the consumption surfaces use the same content-type contract. Adding a type is configuration only when existing generic behavior can express its schema, relationships, processing, lifecycle, operations, and UI. Distinct behavior requires code in explicitly owned common, Node.js, backend, or frontend packages without changing neutral source adapters.

In Backstage terms, compatible types project to Component entities or an approved custom Kind. The Content Type Registry drives semantic processing before persistence and contributes projection metadata; a separate Catalog projector emits selected entities, relations, and annotations. Frontend contributions determine specialized tabs and panels.

## WHERE THIS LIVES IN BACKSTAGE/RHDH

    ┌─────────────────────────────────────────────────────────────────┐
    │                        ANSIBLE PORTAL (RHDH)                    │
    │                                                                 │
    │  BACKSTAGE FRONTEND                                             │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
    │  │  Content     │  │  Content     │  │  Content     │           │
    │  │  Catalog     │  │  Detail      │  │  Graph       │           │
    │  │  Plugin      │  │  Plugin      │  │  Plugin      │           │
    │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
    │         │                 │                 │                   │
    │         └─────────────────┼─────────────────┘                   │
    │                           │                                     │
    │  BACKSTAGE BACKEND        │                                     │
    │  ┌────────────────────────▼─────────────────────────────┐       │
    │  │            Content Primitives Backend Plugin         │       │
    │  │                                                      │       │
    │  │  ┌─────────────────┐  ┌───────────────────────────┐  │       │
    │  │  │ Primitives API  │  │ Enrichment Engine         │  │       │
    │  │  │ (REST routes    │  │ (Primitive Processors)    │  │       │
    │  │  │  registered in  │  │                           │  │       │
    │  │  │  Backstage      │  │  • TrustSignalProcessor   │  │       │
    │  │  │  backend)       │  │  • IntentMetadataProcessor│  │       │
    │  │  │                 │  │  • QualityCheckProcessor  │  │       │
    │  │  │  Used by the    │  │  • RelationshipProcessor  │  │       │
    │  │  │  MCP translator │  │  • SemanticIndexProcessor │  │       │
    │  │  └─────────────────┘  └───────────────────────────┘  │       │
    │  │                                                      │       │
    │  │  ┌──────────────────────────────────────────────┐    │       │
    │  │  │ Source and Content-Type Adapters             │    │       │
    │  │  │                                              │    │       │
    │  │  │  • ManagedRegistryProvider                   │    │       │
    │  │  │  • OciRegistryProvider                       │    │       │
    │  │  │  • GitRepositoryProvider                     │    │       │
    │  │  │  • FilesystemProvider                        │    │       │
    │  │  │  • GalaxyProvider                            │    │       │
    │  │  │  • (future providers via dynamic plugins)    │    │       │
    │  │  └──────────────────────────────────────────────┘    │       │
    │  └──────────────────────────────────────────────────────┘       │
    │                                                                 │
    │  CANONICAL POSTGRESQL CONTENT DATABASE                          │
    │  ┌──────────────────────────────────────────────────────┐       │
    │  │  Content, primitive, evidence, relation, job, and     │       │
    │  │  transactional outbox records                        │       │
    │  └──────────────────────────────────────────────────────┘       │
    │                                                                 │
    │  REBUILDABLE CATALOG AND SEARCH PROJECTIONS                     │
    │  ┌───────────────────────────────────────────────────────┐      │
    │  │ Backstage entities/relations plus keyword and vector   │      │
    │  │ indexes, all recreated from canonical state            │      │
    │  └───────────────────────────────────────────────────────┘      │
    └─────────────────────────────────────────────────────────────────┘

## GRACEFUL DEGRADATION MODEL

Different backends provide different signal coverage. The architecture must handle this transparently.

| Signal                 | Managed Registry | Customer OCI     | Git Repo         | Filesystem       |
| :--------------------- | :--------------- | :--------------- | :--------------- | :--------------- |
| Certification          | ✓ (full)         | ✗                | ✗                | ✗                |
| Signing                | ✓ (cosign)       | ✓ (if signed)    | ✓ (GPG)          | ✗                |
| Security scan          | ✓ (pipeline)     | ? (if scanned)   | ✗                | ✗                |
| Behavioral test        | ✓ (attestation)  | ✗                | ✗                | ✗                |
| Dependency info        | ✓ (full)         | ✓ (manifest)     | ✓ (files)        | ✓ (files)        |
| Version history        | ✓ (tags)         | ✓ (tags)         | ✓ (git)          | ✗                |
| Metadata (native)      | ✓ (full)         | ✓ (partial)      | ✓ (files)        | ✓ (files)        |
| Metadata (enriched)    | ✓ (AI-generated) | ✗ (can gen)      | ✗ (gen)          | ✗ (gen)          |
| Webhooks               | ✓                | ✓ (maybe)        | ✓                | ✗                |
| Aggregate trust output | Versioned policy | Versioned policy | Versioned policy | Versioned policy |

UX IMPLICATION: Every trust/quality signal displayed in the UI shows its source and availability status:

"Security Scan: Clean (Source: Red Hat Certification Pipeline)"
"Security Scan: Not available (Source backend does not support scanning. Upload to managed registry to enable.)"
"Security Scan: Unknown (Not yet scanned. Request scan.)"

The degradation is TRANSPARENT. Users see exactly which signals are present and which are missing, with the source of each signal and remediation options where available. This builds trust in the system itself — the platform never pretends to know something it doesn't.

## KEY ARCHITECTURAL DECISIONS TO DISCUSS

### Decision 1: Backstage Catalog as Content Store vs. Separate Content Service

**Resolved by the migration plan:** Use a separate canonical content service database with transactional outbox delivery. Backstage Catalog and search remain rebuildable projections. The alternatives below are retained as decision history.

Option A — Use Backstage Catalog directly:

- Pro: No data sync between stores; leverages existing infrastructure
- Pro: Backstage relationships, providers, processors all available
- Con: Catalog may not support the query patterns needed (semantic search, trust-ranked results)
- Con: Content-specific lifecycle (certification workflows) may outgrow catalog capabilities
- Con: Performance at scale with hundreds of content items across many backends

Option B — Separate Content Primitives Service with Backstage frontend:

- Pro: Purpose-built for content queries, trust computation, semantic search
- Pro: Cleaner separation of concerns; MCP/API don't depend on Backstage internals
- Con: Data synchronization between service and Backstage catalog
- Con: More infrastructure to maintain

Option C — Hybrid (historical discussion recommendation):

- Use the content service's PostgreSQL repositories for canonical content, primitives, evidence, jobs, and relationships
- Use a transactional outbox to feed dedicated Catalog and search projectors
- Treat Backstage Catalog and search as rebuildable, queryable projections
- Have UI, REST, Scaffolder, and MCP call the normalized service boundary rather than reading adapters or persistence directly

### Decision 2: API Contract — REST vs. GraphQL vs. Both

REST:

- Pro: Simple, well-understood, easy to consume from CI/CD
- Pro: Backstage natively supports REST backend routes
- Con: Relationship-rich queries require multiple round trips or complex query params

GraphQL:

- Pro: Single query for content \+ relationships \+ trust signals
- Pro: Clients request exactly what they need (mobile, CLI, AI agent have different needs)
- Pro: Federation (Apollo) supports multi-backend subgraphs
- Con: Additional infrastructure (schema, resolvers, gateway)
- Con: Backstage doesn't natively support GraphQL for catalog queries

Recommendation: REST as the primary contract (aligns with Backstage, simpler for CI/CD), with a GraphQL layer as an optional optimization for relationship-heavy queries. MCP tools wrap REST operations.

### Decision 3: Content Type Extension Mechanism

Option A — Backstage Component types: Use Component kind with custom type values (e.g., type: ansible-collection). Lowest risk. Works with existing Backstage plugins.

Option B — Single custom Kind: Create one AutomationContent kind with types for each content category. More expressive. RHDH has precedent (marketplace kinds).

Option C — Multiple custom Kinds: Collection, ExecutionEnvironment, Skill, Agent, MCPServer as separate kinds. Most expressive. Highest maintenance burden.

Recommendation: Start with Option A (Component types \+ rich annotations) for initial validation. Move to Option B if the experience needs stronger content-type semantics in the entity model. Avoid Option C unless the differentiation is worth the maintenance cost.

### Decision 4: Enrichment — Synchronous vs. Asynchronous

Synchronous: Adapter observations pass through bounded primitive processors before the canonical transaction commits. Simple and consistent for lightweight work, but unsuitable for AI metadata generation and security scanning.

Asynchronous: Canonical content is stored immediately, enrichment runs asynchronously, and primitive records plus outbox events update projections. Faster ingestion, but introduces explicit eventual consistency.

Recommendation: Hybrid. Fast enrichments run synchronously in the content service processing loop. Slow enrichments write versioned primitive records and transactional outbox events. The UI shows `partially_enriched` or `in_progress` states from the normalized API while projectors update Catalog and search.

### Decision 5: Semantic Search Infrastructure

Option A — Backstage Search with Elasticsearch: Use Backstage's search plugin with Elasticsearch backend. Add custom collators that index enriched metadata. Keyword \+ basic relevance scoring.

Option B — Dedicated vector database: Use a vector DB (Weaviate, Qdrant, Pinecone) alongside Backstage search. Build embeddings from enriched metadata. Full semantic/intent search.

Option C — Hybrid search service: Elasticsearch for keyword \+ structured queries, vector DB for semantic, merged ranking. Most capable, most complex.

Recommendation: Start with Option A (Backstage Search \+ Elasticsearch) for structured discovery. Add vector search (Option C hybrid) when intent-based discovery becomes a priority. The enriched metadata (capabilities.yml, business context tags) must be indexed regardless of search infrastructure choice.

### Decision 6: How Do Customers Register New Backends?

Self-service UI: Customer adds a new backend through the Portal (provide URL, credentials, backend type). A pre-built adapter handles the rest.

Dynamic plugin: Customer deploys a custom adapter as a RHDH dynamic plugin. More flexible but requires development effort.

Configuration-driven: Backend registrations are defined in YAML configuration. Simple but requires deployment changes.

API-driven: Backend registrations via API call. Enables automation and integration.

Recommendation: Self-service UI for supported backend types (OCI registry, Git, filesystem) using pre-built adapters. Dynamic plugin mechanism for unsupported backends. Configuration-driven for initial setup.

## OPEN QUESTIONS FOR ARCHITECTURE DISCUSSION

1. Should the Content Primitives API be a Backstage backend plugin or a standalone microservice? What are the operational implications of each?

2. How do we handle multi-tenancy? When multiple teams/orgs use the same Portal instance, how are content catalogs scoped? How does org-certified content stay within its org?

3. What's the authentication model for backend adapters? How do customers securely provide credentials for their registries/Git repos? Where are secrets stored?

4. How do we handle content that exists in MULTIPLE backends simultaneously? (e.g., same collection in both Galaxy and a customer's registry). Deduplication? Priority? Which trust signals win?

5. What's the latency budget for the enrichment pipeline? How fast must content appear in the catalog after being pushed to a backend?

6. How do we version the Content Provider Contract? When we add new capabilities, how do existing adapters remain compatible?

7. What's the caching strategy? Content metadata is read-heavy. How aggressively do we cache, and how do we invalidate when content changes?

8. How does this architecture support disconnected/air-gapped environments? Can the enrichment engine and catalog run fully offline?

9. What's the migration path from existing Automation Hub? Can we run both systems during transition with content visible in both?

10. How do we test this architecture? What does a CI pipeline look like for an adapter? How do we integration-test across multiple backend types?

## CONTRIBUTORS

This is a working document for architectural discussion with staff engineering.
Prepared: August 2026

## APPENDIX A: REVIEW OF ANSTRAT-1758 — BUILDING ON TOP, NOT BESIDE

ANSTRAT-1758 (Content Management: Agnostic EE Registry Support) already defines the backend infrastructure layer that our architecture builds upon. This section reviews its approach, assesses alignment, and identifies what our architecture adds on top.

### What ANSTRAT-1758 Defines (and We Should NOT Duplicate)

ANSTRAT-1758 establishes five shared infrastructure pillars:
1\. Registry abstraction — Common interface for any OCI-compliant registry
2\. Sync framework — Scheduling, resilience, pluggable update policies (replaces Pulp sync)
3\. Authentication layer — Per-user tokens, lifecycle management, service accounts, audit
4\. Governance API — Content-type-specific rules through a common interface
5\. Disconnected distribution — Unified export/import across network boundaries

Each pillar has shared API contracts, with content-type-specific adapters:
\- ANSTRAT-1758 \= EE image adapter (first implementation)
\- ANSTRAT-1705 \= Collections adapter (peer consumer)
\- ANSTRAT-2136 \= Agentic content adapter (future consumer)

Key decisions already made:
\- Hybrid backend architecture — separate backends for EEs (OCI/Quay) and collections (distinct solution)
\- Custom storage backend rejected — leverage existing registries (Quay), not build bespoke storage
\- DispatcherD for async task execution (internal AWX component)
\- Portal/Backstage as the experience surface
\- All targeted registries assumed OCI-compliant (Docker v2 API)

Decisions still open (as of Aug 31 2026):
\- Which OCI registry ships as default (Quay vs. Pulp — both considered "heavy")
\- Signing approach: GPG vs. SigStore/Cosign
\- PQC compliance path
\- SDP under review (targeting \~Aug 19, status unclear)

### Assessment: Is ANSTRAT-1758 a Good Foundation?

YES — with extensions. Here's why:

STRENGTHS:

1\. Content-type-agnostic adapter pattern is correct. The shared-framework \+ pluggable-adapters model is the right architecture. It avoids the current Pulp problem (bespoke engineering per content type) while allowing format-specific handling. This aligns exactly with our Content Provider Contract.

2\. Shared API contracts for sync/auth/governance are the right abstraction level. These are infrastructure concerns that should NOT vary per content type. ANSTRAT-1758 gets this right.

3\. Rejecting custom storage was pragmatic. Building a purpose-built storage engine would be an enormous investment with ongoing maintenance liability. Using existing OCI registries (Quay, customer-provided) and letting the framework provide the abstraction layer is the correct trade-off.

4\. Portal/Backstage as experience surface aligns with our architecture. The team has already decided that developer-facing experiences go through Backstage — our architecture extends this with content-specific plugins and the three consumption surfaces.

GAPS OUR ARCHITECTURE FILLS:

1\. No discovery/search layer. ANSTRAT-1758 builds the backend plumbing but does not address how content is discovered. No semantic search, no intent-based resolution, no relevance ranking. Our Content Primitives Service and semantic search infrastructure fill this gap.

2\. No trust signal computation. The framework supports signing and governance, but doesn't define how trust signals are computed, normalized, and surfaced to consumers. Our trust primitives model (certification status, signing, security scan, behavioral testing, dependency health) extends the raw trust data into consumable signals.

3\. No content relationship graph. ANSTRAT-1758 treats content types as independent entities in their respective backends. It does NOT model or surface relationships between them (collection to EE to skill to job template). Our relationship model fills this critical gap.

4\. No metadata enrichment. The framework syncs and governs content but doesn't enrich it with business context metadata, intent classification, or quality signals. Our enrichment engine adds this layer.

5\. No MCP/headless access as first-class surface. The framework assumes Portal UI as the primary consumer. Our architecture elevates API and MCP to equal status through the Content Primitives API.

6\. No intent primitives. The framework stores and syncs content metadata but doesn't classify content by business intent, use cases, or compliance alignment.

RISKS AND CONCERNS:

1\. Hybrid backend decision may complicate federation. Separate backends for EEs and collections means our Content Primitives Service must federate across at least two internal backends plus customer-provided backends. This is feasible (it's what our architecture is designed for) but adds integration complexity.

2\. Signing decisions remain source-specific. Git commit and tag signatures, OCI artifact signatures, and in-toto attestations have different subjects, transport, and verification policy. Sigstore/Cosign with OCI Referrers is a candidate for OCI artifacts; it does not replace Git object signing automatically. The approved ADR must define each supported mechanism and how evidence is normalized.

3\. SDP timing is a risk. If architecture decisions change during SDP review, our architecture may need adjustment. We should coordinate with Ganesh Nalawade and Emily Bock to ensure alignment.

4\. "Research-only" scope means no production API contracts yet. Our architecture should define the content primitives API independently, consuming whatever backend contracts emerge from ANSTRAT-1758's prototyping.

### How Our Architecture Layers On Top

    LAYER 4: CONSUMPTION SURFACES (our architecture)
    Portal UI Plugins | REST API (ANSTRAT-2229) | MCP (aap-mcp-server)
    \---------------------------------------------------------------
    LAYER 3: CONTENT PRIMITIVES SERVICE (our architecture)
    Trust/Intent/Quality signals | Enrichment | Semantic Search
    Content Relationship Graph | Primitives API
    \---------------------------------------------------------------
    LAYER 2: BACKEND ADAPTERS (shared — extends ANSTRAT-1758)
    Our Content Provider Contract extends 1758's adapter model
    with trust signal extraction and metadata enrichment hooks
    \---------------------------------------------------------------
    LAYER 1: BACKEND INFRASTRUCTURE (ANSTRAT-1758 scope)
    Registry Abstraction | Sync | Auth/Token | Governance
    Disconnected Distribution | Content-Type Adapters
    \---------------------------------------------------------------
    LAYER 0: CONTENT BACKENDS (customer-controlled)
    Quay | Customer OCI | Git | Filesystem

Recommendation: Present this layered model in the architecture discussion. ANSTRAT-1758 builds Layers 0-1. Our architecture adds Layers 2-4 (extending the adapter model and adding everything above it). This is complementary, not competing work.

## APPENDIX B: EXISTING PLATFORM COMPONENTS TO BUILD ON

Several existing ANSTRAT features align with our architecture and should be referenced as integration points:

ANSTRAT-2229 (Portal Headless API): Exposes all portal capabilities as REST API. Our Content Primitives API should be part of this broader headless API. Key principle from that feature: "same backend as UI, RBAC parity, consumer-agnostic."

ANSTRAT-2420 (Skills over MCP): Prototype serving skills via the AAP MCP Server (`github.com/ansible/aap-mcp-server`). `content-primitives-mcp` is a package and logical translation boundary, not a mandatory new deployment. It may be composed into that existing server or another supported MCP host, provided it communicates only through `content-primitives-client` and normalized REST and preserves identity, authorization, audit, and compatibility contracts.

ANSTRAT-2346 (API Contract Stability): Platform-wide tooling for breaking change detection, deprecation, and spec-implementation fidelity. Our Content Provider Contract should use these practices.

ANSTRAT-2454 (Content Modernization / APME): Content quality scanning framework. A source of quality primitives — scan results feed into the quality signals our architecture surfaces.

ANSTRAT-1910 (SaaS Backend Modernization): Replacing Pulp on cloud.redhat.com. The decoupled API contract it defines must align with our Content Primitives API.

## APPENDIX C: JIRA DEPENDENCY MAP

ANSTRAT-2457 (Trusted Automation Content Management — THE OUTCOME)
|
|-- ANSTRAT-1758 (Agnostic EE Registry — SHARED FRAMEWORK \+ EE ADAPTER)
| |-- ANSTRAT-1705 (Collections Adapter — peer, shares framework)
| |-- ANSTRAT-2136 (Agentic Content Adapter — peer, shares framework)
| |-- ANSTRAT-1983 (Supply Chain Security — depends on 1758\)
| |-- ANSTRAT-2326 (Pulp PQC upgrade — related)
|
|-- ANSTRAT-1910 (SaaS Backend Modernization — Pulp replacement)
|
|-- ANSTRAT-2229 (Portal Headless API — REST consumption surface)
| |-- ANSTRAT-2230 (MCP Tool Wrappers — MCP consumption surface)
|
|-- ANSTRAT-2420 (Skills over MCP — MCP Resources prototype)
|-- ANSTRAT-2454 (Content Modernization / APME — quality signals source)
|-- ANSTRAT-2346 (API Contract Stability — governance for our contracts)

## APPENDIX D: IMPLEMENTATION BUILDING BLOCKS

Backstage Entity Providers (reference implementations from backstage/backstage monorepo):
\- GithubEntityProvider: Event-driven updates via EventsService, scheduled refresh, full/delta mutations. Best reference for change detection patterns.
\- AwsS3EntityProvider: Generic blob store scanner — most analogous to OCI registry/filesystem provider. Lists objects, creates catalog entries.
\- No OCI registry provider exists today — this would be the first major new implementation.

Custom Kind in Backstage:
\- backstage-plugin-catalog-backend-module-mcp (@mexl): Adds custom MCP entity kind with processor, relation emission, and validation. Best reference for adding automation content entity types.

RHDH MCP Server (existing code):
\- redhat-developer/rhdh-plugins: software-catalog-mcp-extras plugin. Already provides MCP access to Backstage catalog. Starting point for content primitives MCP endpoint.

Existing AAP MCP Server:
\- `github.com/ansible/aap-mcp-server`: An existing supported host candidate for `content-primitives-mcp`. Deployment may extend this server or use another approved MCP host; neither arrangement may import backend implementations or bypass the normalized REST client, identity, authorization, audit, and compatibility boundaries.

ORAS (OCI Registry as Storage):
\- oras-go v2: Stable Go library for pushing/pulling custom OCI artifacts. Used by Helm, Flux, Crossplane, Sigstore tools. The client library for our OCI Registry Provider adapter.

Cosign Verification:
\- Kyverno's cosign driver: Clean Go abstraction over cosign.VerifyImageSignatures for trust gating. Reference for how the enrichment engine verifies signatures.
\- Sigstore Policy Controller: Kubernetes admission controller for automated trust verification at deployment time.

Galaxy NG (what we're replacing):
\- github.com/ansible/galaxy_ng: Django \+ Pulp plugin architecture with dual RBAC, bespoke per content type. Documented as "fragile, tightly coupled, and expensive to maintain."

## APPENDIX E: KEY CONTACTS FOR ARCHITECTURE DISCUSSION

ANSTRAT-1758 (Backend Framework):
\- PM: Emily Bock | Architect: Ganesh Nalawade
\- Tech Lead: Alex Oladele (signing), Henrique Leal (multi-registry), Lucas Cabello (air-gapped)
\- UX: Taufique Rahman

MCP Server (aap-mcp-server):
\- Marty Turner (ANSTRAT-2420, 2408, 2407, 2404, 2345\)

Content Quality / APME (ANSTRAT-2454):
\- Craig Brandt

API Contract Stability (ANSTRAT-2346):
\- Lila Yasin
