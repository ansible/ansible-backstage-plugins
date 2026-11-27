/**
 * Types for the compliance backend REST API and Controller integration.
 */

import type { FindingParameter } from './findings';
import type { RemediationSelection } from './profiles';
import type { ProfileDisplayConfig } from './display';
import type { ProfileConnectionStatus, ProfileVersion } from './lifecycle';

/**
 * Scanner certification status for a compliance profile.
 *
 * - certified: Scanner is validated by the framework authority
 *   (e.g. OpenSCAP is NIST SCAP 1.2 validated for DISA STIG assessments)
 * - conformant: Scanner uses official benchmark content but is not the
 *   authority-certified tool (e.g. OpenSCAP with CIS content — accurate
 *   results but CIS-CAT Pro is the CIS-certified scanner)
 * - uncertified: Custom scanner or homegrown checks with no formal validation
 */
export type CertificationStatus = 'certified' | 'conformant' | 'uncertified';

export interface ScanCertification {
  status: CertificationStatus;
  authority: string;
  validationId: string;
  disclaimer: string;
}

/** Request to launch a compliance scan via the backend. */
export interface LaunchScanRequest {
  profileId: string;
  inventoryId: number;
  evaluateOnly?: boolean;
  scanType?: 'assessment' | 'verification';
  limit?: string;
  workflowTemplateId?: number;
  gatherFacts?: boolean;
}

/** Response from launching a scan. */
export interface LaunchScanResponse {
  scanId: string;
  workflowJobId: number;
  status: string;
}

/** Request to launch remediation via the backend. */
export interface LaunchRemediationRequest {
  profileId: string;
  inventoryId: number;
  selections: RemediationSelection[];
  limit?: string;
  /** Scan ID for display context and tracking only. Host scoping always uses latest findings. */
  scanId?: string;
  /** Remediation profile UUID for execution tracking (ADR-014). */
  remediationProfileId?: string;
}

/** Response from launching remediation. */
export interface LaunchRemediationResponse {
  remediationId: string;
  workflowJobId: number;
  status: string;
  /** All job IDs when remediation splits into multiple groups (per host-set). */
  allJobIds?: number[];
  /** Execution record ID for tracking this launch (ADR-014). */
  executionId: string;
}

/** Finding lifecycle state — tracks history across consecutive scans (ADR-016 Layer 2, Tenable pattern). */
export type FindingState = 'new' | 'active' | 'fixed' | 'resurfaced';

/** Remediation profile lifecycle status (ADR-014 §2). */
export type RemediationProfileStatus = 'draft' | 'saved' | 'archived';

/** Remediation execution status — system-derived from Controller job state (ADR-014 §2). */
export type RemediationExecutionStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/** A remediation execution record — one row per launch (ADR-014 §1). */
export interface RemediationExecution {
  id: string;
  remediationProfileId: string;
  inventoryId: number;
  informingScanId: string | null;
  primaryJobId: number | null;
  allJobIds: number[];
  status: RemediationExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  elapsedSeconds: number | null;
  rulesApplied: number | null;
  rulesFailed: number | null;
  hostsTargeted: number | null;
  hostsSucceeded: number | null;
  hostsFailed: number | null;
  planSummary: RemediationPlan | null;
  verificationScanId: string | null;
  createdBy: string | null;
}

/** Chain view response — assessment → remediation → verification (ADR-016 Layer 3). */
export interface ChainScanStats {
  pass: number;
  fail: number;
  rules: number;
  hosts: number;
}

export interface ChainResponse {
  execution: RemediationExecution;
  assessmentScan: ComplianceScan | null;
  assessmentStats: ChainScanStats | null;
  verificationScan: ComplianceScan | null;
  verificationStats: ChainScanStats | null;
  delta: { fixed: number; regressed: number; unchanged: number } | null;
}

/** Lightweight remediation event for trend chart annotations. */
export interface RemediationEvent {
  id: string;
  completedAt: string;
  inventoryId: number;
  rulesApplied: number | null;
  status: string;
}

/** Per-host compliance posture within an inventory (ADR-023 §2). */
export interface HostPosture {
  hostname: string;
  os?: string;
  passCount: number;
  failCount: number;
  naCount: number;
  catIFail: number;
  catIIFail: number;
  catIIIFail: number;
  compliancePct: number;
}

/** Response from GET /inventory/:id/host-posture. */
export interface HostPostureResponse {
  hosts: HostPosture[];
  scanId: string;
  scanTimestamp: string;
  scanType: 'assessment' | 'verification' | 'remediation';
  profileId: string;
  inventoryId: number;
}

/** Individual finding for a specific host, used in the host detail drawer. */
export interface HostFindingSummary {
  ruleId: string;
  stigId: string;
  title: string;
  severity: 'CAT_I' | 'CAT_II' | 'CAT_III';
  status: 'pass' | 'fail' | 'not_applicable' | 'error';
  findingState: FindingState | null;
}

/** Response from GET /inventory/:id/host/:hostname/findings. */
export interface HostFindingsResponse {
  hostname: string;
  scanId: string;
  profileId: string;
  findings: HostFindingSummary[];
  totalCount: number;
}

/** Golden standard binding — pins a remediation profile as the baseline for an inventory (ADR-014 §7). */
export interface BaselineTarget {
  id: string;
  remediationProfileId: string;
  complianceProfileId: string;
  inventoryId: number;
  pinnedAt: string;
  pinnedBy: string | null;
}

/** Posture snapshot for historical trend tracking. */
export interface PostureSnapshot {
  id: string;
  profileId: string;
  inventoryId?: number;
  scanId?: string;
  workflowJobId?: number;
  timestamp: string;
  totalHosts: number;
  totalRules: number;
  passCount: number;
  failCount: number;
  compliancePct: number;
}

/** A scan that contributes to a profile's posture score. */
export interface ContributingScan {
  scanId: string;
  workflowJobId?: number;
  inventoryId: number;
  inventoryName: string;
  passRate: number;
  passCount: number;
  failCount: number;
  ruleCount: number;
  timestamp: string;
}

/** Scan record stored in the database. */
export interface ComplianceScan {
  id: string;
  profileId: string;
  profileVersion?: string;
  inventoryId: number;
  scanner: string;
  scanType: 'assessment' | 'verification' | 'remediation';
  workflowJobId: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  errorDetails: string | null;
  scanMetadata?: {
    totalPackages?: number;
    totalVulnerabilities?: number;
  } | null;
}

/** A scan artifact stored in PAH as an OCI artifact (ADR-032). */
export interface ScanArtifact {
  id: string;
  scanId: string;
  artifactKey: string;
  ociReference: string;
  artifactName: string;
  mimeType: string;
  createdAt: string;
}

/** Authoritative scan resolution response (ADR-015 §2). */
export interface AuthoritativeScanResponse {
  scan: ComplianceScan;
  passRate: number;
  passCount: number;
  failCount: number;
}

/** Stored finding row (flattened per-host). */
export interface StoredFinding {
  id: string;
  scanId: string;
  ruleId: string;
  stigId: string;
  host: string;
  status: string;
  severity: string;
  actualValue: string;
  expectedValue: string;
  evidence: string | null;
  findingState: FindingState | null;
}

/** Normalized rule metadata stored once per rule_id. */
export interface RuleMetadataRecord {
  ruleId: string;
  stigId: string;
  title: string;
  description: string;
  checkText: string;
  fixText: string;
  category: string;
  disruption: 'low' | 'medium' | 'high';
  aapImpact: 'safe' | 'caution' | 'breaks-connectivity';
  aapImpactReason: string;
  scanner: string;
  updatedAt: string;
}

/** Aggregate state counts for a multi-host finding (ADR-016 Layer 2). */
export interface FindingStateSummary {
  new: number;
  active: number;
  fixed: number;
  resurfaced: number;
}

/** Multi-host aggregated finding used by the frontend. */
export interface MultiHostFinding {
  ruleId: string;
  stigId: string;
  title: string;
  description: string;
  fixText: string;
  checkText: string;
  severity: 'CAT_I' | 'CAT_II' | 'CAT_III';
  category: string;
  disruption: 'low' | 'medium' | 'high';
  aapImpact: 'safe' | 'caution' | 'breaks-connectivity';
  aapImpactReason: string;
  automationAvailable?: boolean;
  evidence?: Record<string, unknown>;
  parameters: FindingParameter[];
  hosts: Array<{
    host: string;
    status: 'pass' | 'fail' | 'error' | 'not_applicable';
    actualValue: string;
    expectedValue: string;
    findingState?: FindingState | null;
  }>;
  passCount: number;
  failCount: number;
  naCount: number;
  totalCount: number;
  stateSummary?: FindingStateSummary;
}

/** Paginated findings response for large result sets (supply chain). */
export interface PaginatedFindings {
  findings: MultiHostFinding[];
  total: number;
  totalFailing?: number;
  limit: number;
  offset: number;
}

/** Controller workflow job status response (subset of AWX API). */
export interface WorkflowJobStatus {
  id: number;
  status: string;
  finished: string | null;
  failed: boolean;
  elapsed: number;
  name: string;
  /** Comma-separated list of Ansible tags applied to this job (e.g. "sshd_set_idle_timeout,no_empty_passwords"). */
  job_tags?: string;
}

/** Controller workflow node (subset of AWX API). */
export interface WorkflowNode {
  id: number;
  summary_fields: {
    job?: {
      id: number;
      name: string;
      status: string;
      type: string;
    };
    unified_job_template?: {
      id: number;
      name: string;
      unified_job_type: string;
    };
  };
  identifier: string;
}

/** Controller job event (subset of AWX API). */
export interface JobEvent {
  id: number;
  event: string;
  event_data: Record<string, unknown>;
  stdout: string;
  host_name: string;
}

/** Saved remediation profile request body. */
export interface SaveRemediationProfileRequest {
  id?: string;
  name: string;
  description: string;
  complianceProfileId: string;
  /** The scan active when this profile was created (renamed from scanId — ADR-014 Q7). */
  creationScanId?: string;
  /** @deprecated Use creationScanId. Accepted for backward compatibility. */
  scanId?: string;
  selections: RemediationSelection[];
  status?: import('./api').RemediationProfileStatus;
}

/** Recent scan entry for dashboard display. */
export interface RecentScan {
  id: string;
  workflowJobId?: number;
  profileName: string;
  inventoryName: string;
  passRate: number;
  timestamp: string;
  status: string;
  scanType?: 'assessment' | 'verification' | 'remediation';
  /** The scanner that produced this entry (e.g. 'oscap', 'remediation'). */
  scanner?: string;
}

/** Per-profile posture status for the overview card. */
export interface ProfilePostureStatus {
  profileId: string;
  name: string;
  rate: number;
  aboveTarget: boolean;
}

/** Per-inventory posture breakdown for dual-axis view. */
export interface InventoryPosture {
  inventoryId: number;
  inventoryName: string;
  profileScores: Array<{
    profileId: string;
    name: string;
    scanTags?: string;
    rate: number;
    passCount: number;
    failCount: number;
    baseline?: {
      remediationProfileId: string;
      remediationProfileName: string;
      rate: number;
      passCount: number;
      ruleCount: number;
      pinnedAt: string;
    };
  }>;
}

/** Dashboard stats summary. */
export interface DashboardStats {
  hostsScanned: number;
  criticalFindings: number;
  criticalFindingsDelta?: number;
  pendingRemediation: number;
  pendingRemediationDelta?: number;
  activeProfiles: number;
  recentScans: RecentScan[];
  frameworkScores: Array<{
    profileId: string;
    name: string;
    target: string;
    rules: number;
    rate: number;
    passCount: number;
    failCount: number;
    lastScan: string;
    contributingScans: ContributingScan[];
    baseline?: {
      rate: number;
      passCount: number;
      ruleCount: number;
      inventoryCount: number;
    };
  }>;
  postureStatus: ProfilePostureStatus[];
  byInventory: InventoryPosture[];
}

/** A compliance profile maps a standard (e.g., DISA STIG) to Controller resources. */
export interface ComplianceProfile {
  id: string;
  profileSlug: string;
  displayName: string;
  description: string;
  framework: string;
  version: string;
  platform: string;
  platformSpec: PlatformSpec | null;
  workflowTemplateId: number | null;
  remediateJtId: number | null;
  eeId: number | null;
  remediationPlaybookPath: string;
  scanTags: string;
  certification: ScanCertification | null;
  ruleCount?: number;
  displayConfig?: ProfileDisplayConfig;
  connectionStatus?: ProfileConnectionStatus;
  currentVersion?: ProfileVersion;
  createdAt: string;
  updatedAt: string;
}

/** A group of rules targeting the same host set in a remediation plan. */
export interface RemediationPlanGroup {
  tags: string[];
  limit: string;
  extraVars: Record<string, unknown>;
  hostCount: number;
  ruleCount: number;
}

/** A compiled remediation plan — rules grouped by target host set for efficient execution. */
export interface RemediationPlan {
  groups: RemediationPlanGroup[];
  totalRules: number;
  totalHosts: number;
}

/** Request to create or update a compliance profile registration. */
export interface SaveProfileRequest {
  id?: string;
  profileSlug?: string;
  displayName: string;
  description: string;
  framework: string;
  version: string;
  platform: string;
  platformSpec?: PlatformSpec | null;
  workflowTemplateId: number | null;
  remediateJtId?: number | null;
  eeId: number | null;
  remediationPlaybookPath: string;
  scanTags: string;
  certification?: ScanCertification | null;
  displayConfig?: ProfileDisplayConfig;
}

/** Platform requirements for a compliance profile (ADR-011). */
export interface PlatformSpec {
  os_family?: string[];
  os_version?: string[];
  device_type?: string[];
  scanner_validates?: boolean;
}

/** Result of pre-launch platform validation (ADR-011). */
export interface PlatformValidationResult {
  valid: boolean;
  matchedHosts: string[];
  mismatchedHosts: Array<{ hostname: string; reason: string }>;
  factsAvailable: boolean;
}

/** Raw finding shape from playbook Direct POST to /findings/ingest (ADR-007). */
export interface IngestFinding {
  rule_id: string;
  stig_id?: string;
  title?: string;
  severity?: string;
  status?: string;
  host?: string;
  description?: string;
  check_text?: string;
  fix_text?: string;
  evidence?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Per-host risk entry for the host risk heatmap widget. */
export interface HostRiskEntry {
  hostname: string;
  critical: number;
  medium: number;
  low: number;
  total: number;
  score: number;
  scannedPackages: number;
  latestScanId?: string;
}

/** Response from GET /profile-tab-data/:profileId. */
export interface ProfileTabDataResponse {
  findings: Array<Record<string, unknown>>;
  summary: {
    totalPackages: number;
    totalVulnerabilities: number;
    totalScannedPackages: number;
    totalVulnerablePackages: number;
    fixable: number;
    unfixable: number;
    hostsAffected: number;
    criticalHigh: number;
  };
  hostRisk: HostRiskEntry[];
}
