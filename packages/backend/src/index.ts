/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-gitlab'));
backend.add(import('@backstage/plugin-techdocs-backend'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('./authModuleGithubProvider'));
backend.add(
  import('@ansible/backstage-plugin-auth-backend-module-rhaap-provider'),
);
// backend.add(import('@backstage/plugin-auth-backend-module-github-provider'));
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// See https://backstage.io/docs/auth/guest/provider

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// See https://backstage.io/docs/permissions/getting-started for how to create your own permission policy
//
// Enhanced RBAC with External System Integration (Ansible Fork)
// ==============================================================
// The RBAC plugin is a MODULE that extends the permission backend.
// We must load BOTH:
// 1. Base permission backend (provides extension points)
// 2. RBAC module (registers policy and UI)
//
// Features:
// - RBAC UI for user-created entities (catalog, templates, scaffolder, etc.) ✅
// - AAP RBAC for job templates (single source of truth: AAP) ✅
// - Ready for GitHub/GitLab RBAC integration in future ✅

backend.add(import('@backstage/plugin-permission-backend'));      // Base permission backend
backend.add(import('@ansible/plugin-rbac-backend-ansible'));       // RBAC module with AAP integration

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search engine
// See https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// kubernetes
backend.add(import('@backstage/plugin-kubernetes-backend'));

backend.add(import('@ansible/backstage-plugin-catalog-backend-module-rhaap'));
backend.add(
  import('@ansible/plugin-scaffolder-backend-module-backstage-rhaap'),
);
backend.start();
