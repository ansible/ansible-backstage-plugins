import type { PluginManifest } from '@ansible/portal-extension-api';
import { EXPERIENCE_IDS } from '@ansible/portal-extension-api';
import {
  complianceScanLaunchOperation,
  complianceRemediationLaunchOperation,
  complianceProfileSaveOperation,
  complianceProfileDeleteOperation,
  scanLaunchPermission,
  profileManagePermission,
} from '@ansible/compliance-common';

/**
 * The host contract version compliance was built against.
 * Must match the `hostApiVersion` passed into `DynamicExtensionDiscovery`
 * (see `portal-extension-host`). Matches the convention used by
 * `apmeManifest.ts`'s `APME_API_VERSION`.
 */
export const COMPLIANCE_API_VERSION = '0.1.0';

/**
 * Compliance plugin manifest — declares every capability this plugin
 * contributes to the Automation Portal.
 *
 * Compliance is a host-owned experience in its own right
 * (`EXPERIENCE_IDS.COMPLIANCE`), not a Content Quality
 * capability or a new content type. Its subjects are AAP inventories and
 * hosts, not catalog content types, so every capability below uses
 * `appliesToContentTypes: '*'`.
 *
 * The four capabilities map onto the six tabs `ComplianceRouter` already
 * renders (`CORE_TABS`): Overview, New Scan, and Results fold into
 * `compliance.scan-and-assess`; Remediations becomes `compliance.remediation`;
 * Inventories becomes `compliance.inventory-management`; Settings becomes
 * `compliance.settings`.
 *
 * `targetSlot` values (e.g. `'compliance.overview'`) are a documented
 * convention for a future slot-based rendering path — no runtime slot
 * registry exists yet for any experience, including this one (Tier 1 profile
 * tabs are declared per ADR-040). Today, `ComplianceRouter` still owns its
 * own internal tab routing; this manifest is the declarative, host-validated
 * compliance contributes, registered via `registerManifest()` in
 * `alpha.tsx`.
 */
export const complianceManifest: PluginManifest = {
  id: 'compliance',
  version: '0.1.0',
  apiVersion: COMPLIANCE_API_VERSION,

  capabilities: [
    // ── Scan & assess ───────────────────────────────────────────────────
    // Overview, New Scan, and Results — launching and reviewing compliance
    // scans against AAP inventories.
    {
      id: 'compliance.scan-and-assess',
      ownerPlugin: 'compliance',
      experienceId: EXPERIENCE_IDS.COMPLIANCE,
      displayName: 'Compliance Scanning & Assessment',
      description:
        'Launch compliance scans against AAP inventories and review scan ' +
        'results and findings.',
      appliesToContentTypes: '*',
      entryPoints: [
        {
          id: 'compliance.scan-and-assess.overview-tab',
          kind: 'page-tab',
          surface: 'experience-slot',
          appliesToContentTypes: ['*'],
          label: 'Overview',
          order: 10,
          launches: {
            type: 'slot',
            targetSlot: 'compliance.overview',
          },
        },
        {
          id: 'compliance.scan-and-assess.scan-tab',
          kind: 'page-tab',
          surface: 'experience-slot',
          appliesToContentTypes: ['*'],
          label: 'New Scan',
          order: 20,
          requiredPermission: complianceScanLaunchOperation.permission,
          launches: {
            type: 'slot',
            targetSlot: 'compliance.scan',
          },
        },
        {
          id: 'compliance.scan-and-assess.results-tab',
          kind: 'page-tab',
          surface: 'experience-slot',
          appliesToContentTypes: ['*'],
          label: 'Results',
          order: 30,
          requiredPermission: scanLaunchPermission,
          launches: {
            type: 'slot',
            targetSlot: 'compliance.results',
          },
        },
        // The server-side effect behind the "New Scan" tab's launch button.
        // Registered with `PortalOperations` as `compliance.scan.launch`
        // (see `compliance-backend/src/operations.ts`'s
        // `registerComplianceOperations()`) — this is the entry point that
        // declares it as a legitimate, host-validated trigger, distinct
        // from the `scan-tab` slot above (which only mounts the form UI
        // that calls it). `followOn` opens the Results tab once the scan
        // is dispatched, mirroring `apmeManifest.ts`'s
        // `apme.quality-assessment.scan-action`.
        {
          id: 'compliance.scan-and-assess.launch-scan-action',
          kind: 'overlay',
          surface: 'experience-slot',
          appliesToContentTypes: ['*'],
          label: 'Launch compliance scan',
          order: 21,
          requiredPermission: complianceScanLaunchOperation.permission,
          launches: {
            type: 'operation',
            operationId: complianceScanLaunchOperation.id,
            followOn: { type: 'slot', targetSlot: 'compliance.results' },
          },
        },
        // Re-expression of ADR-027 Tier 1 (see ADR-040): a profile may
        // declare a `display.tab` layout in its `compliance-profile.yml`,
        // composed at render time from a fixed widget vocabulary
        // (`WidgetType` in `@ansible/compliance-common`'s `display.ts` —
        // summary_card, severity_breakdown, findings_table, trend_chart,
        // gauge, host_breakdown, score_grid, action_table,
        // host_risk_heatmap). This single entry point is the declared,
        // host-validated surface for that mechanism; `ComplianceRouter`
        // still injects one tab per active profile with a `display.tab`
        // configured, mounted at `/compliance/profile-tab/:profileId`.
        // There is intentionally no per-widget entry point — a widget is
        // a layout primitive composed within this one tab, not an
        // independently launchable capability.
        {
          id: 'compliance.scan-and-assess.profile-tab',
          kind: 'page-tab',
          surface: 'experience-slot',
          appliesToContentTypes: ['*'],
          label: 'Profile-specific assessment view',
          description:
            'Per-profile dashboard tab composed from the Tier 1 widget ' +
            "vocabulary declared in a profile's compliance-profile.yml.",
          order: 40,
          launches: {
            type: 'slot',
            targetSlot: 'compliance.profile-tab',
          },
        },
      ],
      minimumHostApiVersion: COMPLIANCE_API_VERSION,
    },

    // ── Remediation ─────────────────────────────────────────────────────
    // Selective remediation of findings surfaced by a scan.
    {
      id: 'compliance.remediation',
      ownerPlugin: 'compliance',
      experienceId: EXPERIENCE_IDS.COMPLIANCE,
      displayName: 'Compliance Remediation',
      description:
        'Launch selective remediation jobs for findings surfaced by a ' +
        'compliance scan, and track remediation execution history.',
      appliesToContentTypes: '*',
      entryPoints: [
        {
          id: 'compliance.remediation.remediations-tab',
          kind: 'page-tab',
          surface: 'experience-slot',
          appliesToContentTypes: ['*'],
          label: 'Remediations',
          order: 10,
          requiredPermission: complianceRemediationLaunchOperation.permission,
          launches: {
            type: 'slot',
            targetSlot: 'compliance.remediations',
          },
        },
        // The server-side effect behind the Remediations tab's launch
        // button. Registered with `PortalOperations` as
        // `compliance.remediation.launch` (see
        // `compliance-backend/src/operations.ts`'s
        // `registerComplianceOperations()`) — distinct from the
        // `remediations-tab` slot above (which only mounts the selection
        // UI that calls it). `followOn` re-opens the same tab so the newly
        // launched execution shows up in its history list.
        {
          id: 'compliance.remediation.launch-remediation-action',
          kind: 'overlay',
          surface: 'experience-slot',
          appliesToContentTypes: ['*'],
          label: 'Launch remediation',
          order: 11,
          requiredPermission: complianceRemediationLaunchOperation.permission,
          launches: {
            type: 'operation',
            operationId: complianceRemediationLaunchOperation.id,
            followOn: { type: 'slot', targetSlot: 'compliance.remediations' },
          },
        },
      ],
      minimumHostApiVersion: COMPLIANCE_API_VERSION,
    },

    // ── Inventory management ────────────────────────────────────────────
    // Browsing the AAP inventories compliance can scan.
    {
      id: 'compliance.inventory-management',
      ownerPlugin: 'compliance',
      experienceId: EXPERIENCE_IDS.COMPLIANCE,
      displayName: 'Compliance Inventory Management',
      description:
        'Browse AAP inventories available for compliance scanning and ' +
        'review per-host compliance posture.',
      appliesToContentTypes: '*',
      entryPoints: [
        {
          id: 'compliance.inventory-management.inventories-tab',
          kind: 'page-tab',
          surface: 'experience-slot',
          appliesToContentTypes: ['*'],
          label: 'Inventories',
          order: 10,
          launches: {
            type: 'slot',
            targetSlot: 'compliance.inventories',
          },
        },
      ],
      minimumHostApiVersion: COMPLIANCE_API_VERSION,
    },

    // ── Settings ────────────────────────────────────────────────────────
    // Compliance profile management and data retention. Per-profile
    // dashboard widget layout is declared here (compliance-profile.yml)
    // but *rendered* through the scan-and-assess capability's
    // `profile-tab` entry point above — see ADR-040.
    {
      id: 'compliance.settings',
      ownerPlugin: 'compliance',
      experienceId: EXPERIENCE_IDS.COMPLIANCE,
      displayName: 'Compliance Settings',
      description:
        'Manage compliance profiles, their data-retention policy, and ' +
        'their declared dashboard widget layout.',
      appliesToContentTypes: '*',
      entryPoints: [
        {
          id: 'compliance.settings.settings-tab',
          kind: 'settings-section',
          surface: 'experience-slot',
          appliesToContentTypes: ['*'],
          label: 'Settings',
          order: 10,
          requiredPermission: profileManagePermission,
          launches: {
            type: 'slot',
            targetSlot: 'compliance.settings',
          },
        },
      ],
      minimumHostApiVersion: COMPLIANCE_API_VERSION,
    },
  ],

  entitlements: [],

  operations: [
    complianceScanLaunchOperation,
    complianceRemediationLaunchOperation,
    complianceProfileSaveOperation,
    complianceProfileDeleteOperation,
  ],
};
