---
title: "ADR-031: Private Automation Hub for Execution Environment Images"
description: "Compliance profile Execution Environments (EEs) are OCI container images built via GitHub Actions (`"
type: adr
status: accepted
date: 2026-06-25
product: "AAP Compliance Dashboard"
---
# ADR-031: Private Automation Hub for Execution Environment Images

**Status:** Accepted  
**Date:** 2026-06-25  
**Deciders:** Massimo Ferrari  

## Context

Compliance profile Execution Environments (EEs) are OCI container images built via GitHub Actions (`.github/workflows/build-ee.yml`). Each profile has its own EE containing scanner-specific tools:

| Profile | EE Contents | Controller EE ID |
|---------|------------|-----------------|
| STIG RHEL 9 | scap-security-guide, openscap-scanner | 8 |
| CIS L1 RHEL 9 | scap-security-guide, openscap-scanner | 10 |
| CIS L2 RHEL 9 | scap-security-guide, openscap-scanner | 11 |
| Supply Chain | Syft 1.20.0, Grype 0.90.0 (pre-cached CVE DB) | 16 |

Previously, EE images were pushed to GitHub Container Registry (GHCR) at `ghcr.io/cross-logic/compliance-*:latest`. This required:

1. A Container Registry credential (`GHCR-cross-logic`, ID 8) attached to each EE on Controller.
2. The GHCR packages to be either public or the credential to have `read:packages` scope.
3. Token rotation when GHCR PATs expired.
4. An external dependency on GitHub's container registry for job execution.

AAP 2.6 ships with Private Automation Hub (PAH), which includes a built-in container registry at the Gateway hostname. Controller trusts PAH natively — no separate credential is needed to pull EE images.

## Decision

All compliance EE images are hosted in Private Automation Hub (PAH) at `aap-netrunner.demoredhat.com/compliance-*:latest`. GHCR is retained as a build artifact but PAH is the source of truth for Controller.

### Build and distribution flow

```
GitHub Actions (build-ee.yml)
  │
  ├─ Build EE with ansible-builder + docker
  ├─ Push to ghcr.io/cross-logic/compliance-*:latest  (build artifact)
  │
  └─ Mirror to PAH (post-build step or manual):
       skopeo copy \
         --src-creds <ghcr-user>:<token> \
         --dest-creds <pah-user>:<password> \
         --dest-tls-verify=false \
         docker://ghcr.io/cross-logic/compliance-<profile>:latest \
         docker://aap-netrunner.demoredhat.com/compliance-<profile>:latest
```

### Controller configuration

EEs on Controller reference PAH images directly:

```
image: aap-netrunner.demoredhat.com/compliance-stig-rhel9:latest
credential: null  (PAH is trusted natively)
```

No Container Registry credential is attached. Controller pulls from PAH using its built-in trust relationship with the platform's Hub component.

### PAH push mechanics

`podman push` to PAH fails on cross-repository blob mount checks (PAH 2.6 known behavior). Use `skopeo copy` instead — it streams blobs directly without blob mount negotiation.

### Authentication

PAH container registry uses Gateway user credentials (username/password), not API tokens. Any Gateway user with EE admin permissions can push. The `--tls-verify=false` flag is required on the Netrunner lab because the demo environment uses a self-signed certificate.

## Consequences

- Controller no longer depends on external registries for job execution. If GitHub is unreachable, existing PAH images still work.
- The GHCR Container Registry credential (ID 8) can be removed from EE configurations. It may be retained for other purposes (pulling GHCR images for non-compliance workflows).
- EE image updates require an explicit mirror step after CI builds. This can be automated in CI or run manually via the skopeo command above.
- For production deployments, PAH would use proper TLS certificates and the `--tls-verify=false` flag would be removed.

## Related

- ADR-003: Single Assessment JT with 2 Plays
- ADR-008: Agentless OpenSCAP Pattern
- ADR-029: CycloneDX Normalizer Pattern
