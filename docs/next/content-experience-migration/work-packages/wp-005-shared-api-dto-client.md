# WP-005 — Shared API data-transfer-object client

| Field        | Value                                                                      |
| ------------ | -------------------------------------------------------------------------- |
| Phase        | 1 — Common contracts                                                       |
| Depends on   | WP-003                                                                     |
| Repositories | Portal and proof of concept (PoC)                                          |
| Target       | `content-primitives-client`                                                |
| Outcome      | One browser/Node-safe authenticated client for normalized content services |

## Human summary

**Why this matters:** Browser and backend callers need one consistent, secure way to use normalized content services. Sharing request, response, error, and streaming behavior prevents wrappers in different repositories from drifting apart.

**What will change:** A browser- and Node.js-safe `content-primitives-client` package will provide typed calls for content, evidence, search, operations, jobs, and Server-Sent Events (SSE), with host-provided discovery, authentication, tracing, and retry policy.

**PR scope:** Freeze current data and error fixtures, implement schema-validated requests and responses, add pagination and abortable streaming helpers, and replace one frontend and one backend wrapper for parity testing.

**Not in this PR:** The client will not own React bindings, backend services, databases, source adapters, or protocol servers. It will not obtain or store credentials independently of the host.

**Success looks like:** Old and new callers receive equivalent results and errors, cancellation stops work cleanly, malformed responses produce safe typed errors, and the same package works in browsers and Node.js.

## Scope and changes

Move duplicated request/response data transfer objects (DTOs) into common schemas and implement a typed client for content, primitive, provenance, search, intent, operation discovery/invocation, jobs, and SSE. Discovery, identity/caller credentials, fetch, tracing, and retry policy are injected by the host. The package owns no React binding, backend service, database, adapter, or Model Context Protocol (MCP) protocol.

```ts
// Illustrative public surface.
interface ContentPrimitivesClient {
  listContent(
    request: ListContentRequest,
    options?: RequestOptions,
  ): Promise<Page<ContentSummary>>;
  getContent(
    subject: ContentSubjectRef,
    options?: RequestOptions,
  ): Promise<ContentDetail>;
  watchJob(id: string, options?: StreamOptions): AsyncIterable<JobEvent>;
}

interface RequestOptions {
  signal?: AbortSignal;
  correlationId?: string;
  credentials?: 'include' | 'require';
}
```

## Implementation slices

1. Freeze existing DTO fixtures and error categories.
2. Build schema-validated request/response and pagination helpers.
3. Add injected discovery/auth and correlation propagation.
4. Add abortable SSE/job helpers with bounded reconnect behavior.
5. Replace one PoC frontend and backend wrapper, then compare results.

## Required tests

- **Contract:** URLs, methods, encoding, pagination, errors, and additional-field compatibility.
- **Runtime:** browser and Node builds contain no incompatible dependencies.
- **Auth/security:** credentials originate only from injected providers; logs/errors redact headers and bodies.
- **Resilience:** cancellation, timeout, SSE reconnect/last-event ID, malformed response, and retry policy.
- **Parity:** migrated PoC callers receive unchanged responses.

### Acceptance criteria

- Given the same principal and request, old and new callers decode equivalent results and errors.
- Given cancellation, network work and SSE iteration terminate promptly without leaked listeners.
- Given a malformed response, the client returns a typed safe decode error with correlation metadata.
- Given a package graph inspection, no backend implementation, React, adapter, or MCP dependency exists.

## Rollback and completion

Keep current wrappers delegating to the new client behind a per-consumer switch. Done means one client is used from both runtimes/repositories and schema/OpenAPI drift is enforced.
