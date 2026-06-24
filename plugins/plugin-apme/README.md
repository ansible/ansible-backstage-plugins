# @ansible/plugin-apme

Backstage frontend plugin for **APME** (Ansible Policy & Modernization Engine).

Provides a full scanning, remediation, and analytics dashboard integrated into
the Ansible self-service automation portal.

## Pages

- **Dashboard** — Summary stats, project rankings
- **Analytics** — Top violations, remediation rates, AI acceptance stats
- **Projects** — List and manage registered projects
- **Project Detail** — Violations, trends, dependencies, operations
- **Activity** — Scan history across all projects
- **Activity Detail** — Per-scan violations, patches, proposals
- **Sessions** — Engine session tracking
- **Session Detail** — Per-session scan history
- **Health** — APME service health status
- **Rules** — Rule catalog with filtering and overrides
- **Collections** — Ansible collection dependency tracking
- **Collection Detail** — Per-collection project usage
- **Python Packages** — Python dependency tracking
- **Package Detail** — Per-package project usage
- **Playground** — Ad-hoc file upload and check/remediate (WebSocket)
- **Settings** — Galaxy server management, AI model preferences

## Installation

```tsx
// packages/app/src/App.tsx
import { ApmePage } from '@ansible/plugin-apme';

<Route path="/apme" element={<ApmePage />} />;
```

## Configuration

Requires the `@ansible/plugin-apme-backend` backend plugin to proxy
requests to the APME Gateway.
