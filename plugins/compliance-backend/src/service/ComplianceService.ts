/**
 * Core compliance service — the single entry point for all compliance operations.
 *
 * Checks `ansible.compliance.dataSource` in app-config.yaml:
 * - 'mock' (default) → returns mock data, no AAP connection needed
 * - 'live'           → calls Controller API via ControllerClient
 *
 * Delegates to focused classes for:
 * - FindingsParser    — parsing, mapping, grouping, aggregating findings
 * - RemediationPlanBuilder — building optimized remediation plans
 * - DashboardAggregator    — dashboard stats, posture history, baselines
 */
import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';

import type {
  ComplianceProfile,
  MultiHostFinding,
  StoredFinding,
  DashboardStats,
  LaunchScanRequest,
  LaunchScanResponse,
  LaunchRemediationRequest,
  LaunchRemediationResponse,
  PostureSnapshot,
  RemediationProfile,
  SaveRemediationProfileRequest,
  WorkflowJobStatus,
  WorkflowNode,
  JobEvent,
  RemediationSelection,
  RemediationPlan,
  IngestFinding,
} from '@ansible/backstage-compliance-common';

import { ControllerClient } from './ControllerClient';
import { ComplianceDatabase } from '../database/ComplianceDatabase';
import { MockDataProvider } from './MockDataProvider';
import { FindingsParser, buildRuleMetadataRecords } from './FindingsParser';
import { RemediationPlanBuilder } from './RemediationPlanBuilder';
import { DashboardAggregator } from './DashboardAggregator';

export { buildRuleMetadataRecords } from './FindingsParser';

export type DataSource = 'mock' | 'live';

export class ComplianceService {
  private readonly dataSource: DataSource;
  private readonly controllerClient: ControllerClient | null;
  private readonly logger: LoggerService;
  private readonly config: Config;
  private database: ComplianceDatabase | null = null;

  // ─── Delegates ─────────────────────────────────────────────────────
  private findingsParser: FindingsParser;
  private readonly remediationPlanBuilder: RemediationPlanBuilder;
  private dashboardAggregator: DashboardAggregator | null = null;

  constructor(config: Config, logger: LoggerService) {
    this.config = config;
    this.logger = logger;

    // Read the toggle flag — default to 'mock' for safe demos
    const rawSource =
      config.getOptionalString('ansible.compliance.dataSource') ?? 'mock';
    this.dataSource = rawSource === 'live' ? 'live' : 'mock';

    this.logger.info(
      `ComplianceService initialized with dataSource=${this.dataSource}`,
    );

    // Only construct the Controller client when in live mode
    if (this.dataSource === 'live') {
      const ansibleConfig = config.getOptionalConfig('ansible');
      const baseUrl = ansibleConfig?.getOptionalString('rhaap.baseUrl') ?? '';
      const token = ansibleConfig?.getOptionalString('rhaap.token') ?? '';
      const checkSSL =
        ansibleConfig?.getOptionalBoolean('rhaap.checkSSL') ?? true;

      if (!baseUrl || !token) {
        throw new Error(
          'ansible.compliance.dataSource is "live" but ansible.rhaap.baseUrl / ansible.rhaap.token are not configured',
        );
      }

      this.controllerClient = new ControllerClient(
        { baseUrl, token, checkSSL },
        logger,
      );
    } else {
      this.controllerClient = null;
    }

    // Initialize delegates
    this.findingsParser = new FindingsParser(logger, null);
    this.remediationPlanBuilder = new RemediationPlanBuilder(logger);
  }

  getDataSource(): DataSource {
    return this.dataSource;
  }

  /**
   * Inject the database reference after construction.
   * Called from plugin.ts — avoids a circular constructor dependency.
   */
  setDatabase(db: ComplianceDatabase): void {
    this.database = db;
    // Re-create delegates that depend on DB
    this.findingsParser = new FindingsParser(this.logger, db);
    this.dashboardAggregator = new DashboardAggregator(this.logger, db, this);
  }

  // @ts-expect-error TS6133
  private requireDatabase(): ComplianceDatabase {
    if (!this.database)
      throw new Error(
        'ComplianceDatabase not initialized — call setDatabase() first',
      );
    return this.database;
  }

  // ─── Profiles ───────────────────────────────────────────────────────

  async getProfiles(): Promise<ComplianceProfile[]> {
    if (this.dataSource === 'mock') {
      if (this.database) {
        const dbProfiles = await this.database.listProfiles();
        if (dbProfiles.length > 0) return dbProfiles;
      }
      return MockDataProvider.getProfiles();
    }
    return [];
  }

  // ─── Inventories ────────────────────────────────────────────────────

  // Inventories are Controller-managed resources, not in the local DB — always use MockDataProvider in mock mode
  async getInventories(
    token?: string,
  ): Promise<Array<{ id: number; name: string; hostCount: number }>> {
    if (this.dataSource === 'mock') {
      return MockDataProvider.getInventories().map(inv => ({
        id: inv.id,
        name: inv.name,
        hostCount: inv.total_hosts,
      }));
    }

    const result = await this.controllerClient!.listInventories(token);
    return result.results.map(inv => ({
      id: inv.id,
      name: inv.name,
      hostCount: inv.total_hosts,
    }));
  }

  async getInventoryHostFacts(
    inventoryId: number,
    token?: string,
  ): Promise<
    Array<{
      hostname: string;
      ansible_os_family?: string;
      ansible_distribution_major_version?: string;
      device_type?: string;
    }>
  > {
    if (this.dataSource === 'mock') {
      return [];
    }
    return this.controllerClient!.getInventoryHostFacts(inventoryId, token);
  }

  // ─── Workflow job templates ─────────────────────────────────────────

  async getWorkflowTemplates(
    nameFilter?: string,
    token?: string,
  ): Promise<Array<{ id: number; name: string; description: string }>> {
    if (this.dataSource === 'mock') {
      return MockDataProvider.getWorkflowTemplates(nameFilter);
    }

    const result = await this.controllerClient!.listWorkflowJobTemplates(
      nameFilter,
      token,
    );
    return result.results;
  }

  async getJobTemplates(
    nameFilter?: string,
    token?: string,
  ): Promise<Array<{ id: number; name: string; description: string }>> {
    if (this.dataSource === 'mock') {
      return MockDataProvider.getWorkflowTemplates(nameFilter);
    }
    const result = await this.controllerClient!.listJobTemplates(
      nameFilter,
      token,
    );
    return result.results;
  }

  // ─── Job template detail ─────────────────────────────────────────────

  async getJobTemplateDetail(
    id: number,
    token?: string,
  ): Promise<{
    id: number;
    name: string;
    description: string;
    extra_vars: string;
    execution_environment: number | null;
  }> {
    if (this.dataSource === 'mock') {
      return {
        id,
        name: `Mock JT ${id}`,
        description: '',
        extra_vars: '{}',
        execution_environment: null,
      };
    }
    if (!this.controllerClient) {
      throw new Error('Controller client not available');
    }
    const raw = await this.controllerClient.getJobTemplateDetail(id, token);
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      extra_vars: raw.extra_vars,
      execution_environment: raw.execution_environment ?? null,
    };
  }

  // ─── Execution environments ─────────────────────────────────────────

  async getExecutionEnvironments(
    token?: string,
  ): Promise<Array<{ id: number; name: string; image: string }>> {
    if (this.dataSource === 'mock') {
      return MockDataProvider.getExecutionEnvironments();
    }

    const result = await this.controllerClient!.listExecutionEnvironments(
      token,
    );
    return result.results;
  }

  // ─── Scan ───────────────────────────────────────────────────────────

  async launchScan(
    request: LaunchScanRequest,
    token?: string,
    scanId?: string,
    ingestToken?: string,
  ): Promise<LaunchScanResponse> {
    if (this.dataSource === 'mock') {
      return MockDataProvider.launchScan(request.profileId);
    }

    // ── Resolve the workflow template ID ──────────────────────────────
    const resolvedTemplateId = await this.resolveWorkflowTemplateId(
      request.profileId,
      request.workflowTemplateId,
      token,
    );

    // ── Build extra_vars for the workflow launch ─────────────────────
    // backstage_api_url and scan_id enable the playbook to POST findings
    // directly to the plugin API after normalization (Direct POST pattern).
    const backstageUrl =
      this.config?.getOptionalString('backend.baseUrl') || '';
    const pahRegistry =
      this.config?.getOptionalString('ansible.compliance.pahRegistry') ||
      process.env.AAP_HOST_URL?.replace(/^https?:\/\//, '') ||
      '';
    const extraVars: Record<string, unknown> = {
      compliance_profile: request.profileId,
      inventory_id: request.inventoryId,
      backstage_api_url: backstageUrl,
      scan_id: scanId || '',
      ingest_token: ingestToken || '',
      _gather_facts: request.gatherFacts || false,
      pah_registry: pahRegistry,
      pah_username: process.env.AAP_REGISTRY_USER || '',
      pah_password: process.env.AAP_REGISTRY_PASSWORD || '',
    };

    // ── Launch the workflow ──────────────────────────────────────────
    this.logger.info(
      `Launching workflow template ${resolvedTemplateId} for profile=${
        request.profileId
      } inventory=${request.inventoryId}${
        request.limit ? ` limit=${request.limit}` : ''
      }`,
    );

    let launch: { id: number; workflow_job?: number; status: string };
    try {
      launch = await this.controllerClient!.launchWorkflow(
        resolvedTemplateId,
        extraVars,
        token,
        request.limit,
        undefined,
        request.inventoryId,
      );
    } catch (wftError) {
      // Fallback: template might be a JT, not a WJT
      const is404 =
        wftError instanceof Error && wftError.message.includes('404');
      if (!is404) throw wftError;
      this.logger.info(
        `Template ${resolvedTemplateId} is not a WJT, trying as JT`,
      );
      const jtLaunch = await this.controllerClient!.launchJobTemplate(
        resolvedTemplateId,
        extraVars,
        token,
        request.limit,
        undefined,
        request.inventoryId,
      );
      launch = { ...jtLaunch, workflow_job: undefined };
    }

    const workflowJobId = launch.workflow_job ?? launch.id;

    this.logger.info(
      `Workflow job ${workflowJobId} launched (status=${launch.status})`,
    );

    return {
      scanId: `scan-${workflowJobId}`,
      workflowJobId,
      status: launch.status,
    };
  }

  /**
   * Resolve the workflow job template ID to use for a scan.
   *
   * Resolution order:
   *   1. Explicit `workflowTemplateId` from the scan request (user override)
   *   2. Profile registry in the database (mapped per compliance profile)
   *   3. Name-based search on the Controller (fallback for unconfigured profiles)
   */
  private async resolveWorkflowTemplateId(
    profileId: string,
    requestTemplateId?: number,
    token?: string,
  ): Promise<number> {
    // (1) Explicit from request — highest priority
    if (requestTemplateId) {
      this.logger.info(
        `Using workflow template ${requestTemplateId} from scan request`,
      );
      return requestTemplateId;
    }

    // (2) Look up the profile in the DB
    if (this.database) {
      const profile = await this.database.getProfile(profileId);
      if (profile?.workflowTemplateId) {
        this.logger.info(
          `Using workflow template ${profile.workflowTemplateId} from profile registry (profile=${profileId})`,
        );
        return profile.workflowTemplateId;
      }
    }

    // (3) Name-based search on the Controller
    this.logger.info(
      `No workflow template configured for profile=${profileId} — searching Controller by name`,
    );
    const templates = await this.controllerClient!.listWorkflowJobTemplates(
      'compliance',
      token,
    );
    const template =
      templates.results.find(t =>
        t.name.toLowerCase().includes(profileId.replace(/-/g, '_')),
      ) ?? templates.results[0];

    if (!template) {
      throw new Error(
        `No compliance workflow job template found for profile ${profileId}. ` +
          `Register one in the profile registry or provide workflowTemplateId in the scan request.`,
      );
    }

    this.logger.info(
      `Resolved workflow template ${template.id} ("${template.name}") by name search`,
    );
    return template.id;
  }

  /**
   * Resolve the remediate job template ID.
   *
   * Looks up the workflow template from the profile registry, finds
   * the remediate node within it, and returns that node's JT ID.
   * Falls back to searching for a JT named "compliance-remediate".
   */
  private async resolveRemediateJobTemplateId(
    profileId: string,
    token?: string,
  ): Promise<number> {
    // Resolution order:
    // 1. Profile registry — explicit remediate JT ID stored per profile
    // 2. Name-based search on Controller (fallback for single-profile setups)
    if (this.database) {
      const profile = await this.database.getProfile(profileId);
      if (profile?.remediateJtId) {
        this.logger.info(
          `Resolved remediate JT ${profile.remediateJtId} from profile registry`,
        );
        return profile.remediateJtId;
      }
    }

    const result = await this.controllerClient!.listJobTemplates(
      'compliance-remediate',
      token,
    );
    if (result.results.length > 0) {
      this.logger.warn(
        `Profile has no remediateJtId set — falling back to name search. This may pick the wrong JT in multi-profile deployments. Resolved remediate JT ${result.results[0].id}`,
      );
      return result.results[0].id;
    }

    throw new Error(
      'No compliance remediate job template found. Set the Remediate Job Template on the profile, or ensure a JT named "compliance-remediate" exists.',
    );
  }

  // ─── Remediation ────────────────────────────────────────────────────

  async launchRemediation(
    request: LaunchRemediationRequest,
    findings: MultiHostFinding[],
    token?: string,
  ): Promise<LaunchRemediationResponse> {
    if (this.dataSource === 'mock') {
      return MockDataProvider.launchRemediation();
    }

    // Build the optimized remediation plan from selections + findings.
    // The plan groups rules by their target host set — rules that fail on
    // the same hosts are grouped together into one JT launch.
    const plan = this.buildRemediationPlan(request.selections, findings);

    const resolvedJtId = await this.resolveRemediateJobTemplateId(
      request.profileId,
      token,
    );

    // If plan produced 0 groups, the selected rules have no failing hosts
    // in the latest findings for this profile. Fail with a clear message
    // instead of launching against incorrect hosts.
    if (plan.groups.length === 0) {
      const enabledCount = request.selections.filter(s => s.enabled).length;
      throw new Error(
        `No failing hosts found for the ${enabledCount} selected rule(s). ` +
          `Run a new scan for this profile before launching remediation.`,
      );
    }

    // Launch one JT per plan group. Each group has its own scoped host
    // limit and rule tags, so hosts only get remediated for the rules
    // they actually failed.
    const launches: Array<{ id: number; status: string }> = [];
    for (const group of plan.groups) {
      const jobTags = group.tags.join(',');
      const limit = group.limit || request.limit;

      this.logger.info(
        `Launching remediate JT ${resolvedJtId} group ${launches.length + 1}/${
          plan.groups.length
        }` +
          ` (${group.ruleCount} rules, ${group.hostCount} hosts)` +
          ` limit=${limit} job_tags=${jobTags}`,
      );

      const launch = await this.controllerClient!.launchJobTemplate(
        resolvedJtId,
        group.extraVars,
        token,
        limit,
        jobTags,
        request.inventoryId,
      );
      launches.push({ id: launch.id, status: launch.status });
    }

    // Return the first job ID for frontend tracking. When there's only
    // one group (the common case), this is the sole job. When there are
    // multiple, the frontend tracks the first and the rest run in parallel.
    const primary = launches[0];
    if (launches.length > 1) {
      this.logger.info(
        `Launched ${launches.length} remediation jobs: ${launches
          .map(l => l.id)
          .join(', ')}`,
      );
    }

    return {
      remediationId: `remediation-${primary.id}`,
      workflowJobId: primary.id,
      status: primary.status,
      allJobIds: launches.map(l => l.id),
      executionId: '',
    };
  }

  // ─── Findings (delegated to FindingsParser) ─────────────────────────

  async getFindings(
    scanId?: string,
    profileId?: string,
    inventoryId?: number,
  ): Promise<MultiHostFinding[]> {
    if (this.dataSource === 'mock' && !this.database) {
      return MockDataProvider.getFindings();
    }

    if (!scanId) {
      if (this.database) {
        const latest = await this.database.getLatestFindings(
          profileId,
          inventoryId,
        );
        if (latest.length > 0)
          return this.findingsParser.aggregateFindingsWithMetadata(latest);
      }
      return [];
    }

    if (this.database) {
      const dbFindings = await this.database.getFindingsByScanId(scanId);
      if (dbFindings.length > 0) {
        return this.findingsParser.aggregateFindingsWithMetadata(dbFindings);
      }
    }

    return [];
  }

  // ─── Scan result fetching & parsing ────────────────────────────────

  /**
   * Fetch scan results from the Controller API, parse them, and persist
   * to the database.
   *
   * Called when a scan job completes and Direct POST findings are not
   * available. Falls back to parsing job events from the normalize node.
   * Supports Track B (normalize_xccdf output) and legacy Track A
   * (compliance_evaluate module, deprecated -- see ADR-004).
   *
   * Returns the parsed StoredFinding[] (without the id field -- the DB
   * generates IDs on insert).
   */
  async fetchAndParseResults(
    workflowJobId: number,
    scanId: string,
    token?: string,
  ): Promise<Array<Omit<StoredFinding, 'id'>>> {
    if (!this.controllerClient) {
      throw new Error(
        'Cannot fetch results in mock mode — no Controller client',
      );
    }

    // Check if findings were already saved by Direct POST from the playbook.
    // If so, skip event parsing entirely — the data is already in the DB.
    if (this.database) {
      const existing = await this.database.getFindingsByScanId(scanId);
      if (existing.length > 0) {
        this.logger.info(
          `Found ${existing.length} findings already in DB for scan ${scanId} (via Direct POST). Skipping event parsing.`,
        );
        return existing;
      }
    }

    this.logger.info(
      `Fetching results for workflow job ${workflowJobId} (scan ${scanId}) via event parsing (fallback)`,
    );

    // Step 1: Get workflow nodes to find the normalize job.
    // For JT-launched scans (no workflow), use the job ID directly.
    let normalizeJobId = workflowJobId;
    try {
      const nodesResponse = await this.controllerClient.getWorkflowNodes(
        workflowJobId,
        token,
      );
      const nodes = nodesResponse.results;

      const normalizeNode = nodes.find(
        n =>
          n.identifier?.toLowerCase().includes('run-oscap') ||
          n.summary_fields?.job?.name?.toLowerCase().includes('run-oscap') ||
          n.identifier?.toLowerCase().includes('normaliz') ||
          n.summary_fields?.job?.name?.toLowerCase().includes('normaliz') ||
          n.identifier?.toLowerCase().includes('evaluat') ||
          n.summary_fields?.job?.name?.toLowerCase().includes('evaluat'),
      );

      if (normalizeNode?.summary_fields?.job?.id) {
        normalizeJobId = normalizeNode.summary_fields.job.id;
        this.logger.info(
          `Found normalize job ${normalizeJobId} (node: ${normalizeNode.identifier})`,
        );
      } else {
        this.logger.warn(
          `No normalize/evaluate node found in workflow ${workflowJobId}. Using job ID directly.`,
        );
      }
    } catch {
      this.logger.info(
        `Job ${workflowJobId} is not a workflow — using as direct JT for event parsing`,
      );
    }

    // Step 2: Fetch runner_on_ok events from the normalize job
    const eventsResponse = await this.controllerClient.getRunnerOkEvents(
      normalizeJobId,
      token,
    );
    const events = eventsResponse.results;
    this.logger.info(
      `Retrieved ${events.length} runner_on_ok events from normalize job ${normalizeJobId}`,
    );

    // Step 3: Parse findings from job events (delegated to FindingsParser)
    const findings = this.findingsParser.parseJobEvents(events, scanId);
    this.logger.info(
      `Parsed ${findings.length} findings from normalize job ${normalizeJobId}`,
    );

    // Step 4: Try to persist to the database (non-fatal if it fails)
    if (this.database && findings.length > 0) {
      try {
        await this.database.saveFindingsForScan(scanId, findings);
        await this.database.updateScanStatus(
          scanId,
          'completed',
          new Date().toISOString(),
        );
        this.logger.info(
          `Persisted ${findings.length} findings for scan ${scanId}`,
        );

        // Extract and upsert rule metadata from the parsed events
        try {
          const allRawFindings: Array<Record<string, unknown>> = [];
          for (const event of events) {
            const res = (event.event_data as Record<string, unknown>)?.res as
              | Record<string, unknown>
              | undefined;
            if (!res) continue;
            const factsSource =
              (res.ansible_facts as Record<string, unknown>) ?? {};
            const rawFindings: Array<Record<string, unknown>> | undefined =
              (res.findings as Array<Record<string, unknown>>) ??
              (factsSource.findings as Array<Record<string, unknown>>) ??
              ((factsSource.compliance_results as Record<string, unknown>)
                ?.findings as Array<Record<string, unknown>>) ??
              ((factsSource.compliance_report as Record<string, unknown>)
                ?.findings as Array<Record<string, unknown>>);
            if (rawFindings && Array.isArray(rawFindings)) {
              allRawFindings.push(...rawFindings);
            }
          }
          const hasFullMetadata = allRawFindings.some(
            f =>
              (typeof f.fix_text === 'string' && f.fix_text.length > 0) ||
              (typeof f.description === 'string' && f.description.length > 0),
          );
          if (allRawFindings.length > 0 && hasFullMetadata) {
            const metadataRecords = buildRuleMetadataRecords(allRawFindings);
            const metaCount = await this.database.upsertRuleMetadata(
              metadataRecords,
            );
            this.logger.info(
              `Upserted ${metaCount} rule metadata records from event parsing`,
            );
          } else if (allRawFindings.length > 0) {
            this.logger.info(
              'Skipped metadata upsert — event findings are slim format (no fix_text/description)',
            );
          }
        } catch (metaErr) {
          this.logger.warn(
            `Rule metadata upsert from events failed (non-fatal): ${
              metaErr instanceof Error ? metaErr.message : String(metaErr)
            }`,
          );
        }
      } catch (persistError) {
        this.logger.warn(
          `Could not persist findings to DB (scan ${scanId}): ${
            persistError instanceof Error
              ? persistError.message
              : String(persistError)
          }`,
        );
      }
    }

    return findings;
  }

  /**
   * Convert flat StoredFinding[] rows into aggregated MultiHostFinding[]
   * for the frontend. Groups findings by ruleId and collects per-host
   * status into the hosts array.
   */
  aggregateFindings(
    stored: Array<Omit<StoredFinding, 'id'>>,
  ): MultiHostFinding[] {
    return this.findingsParser.aggregateFindings(stored);
  }

  async aggregateFindingsWithMetadata(
    stored: Array<Omit<StoredFinding, 'id'>>,
  ): Promise<MultiHostFinding[]> {
    return this.findingsParser.aggregateFindingsWithMetadata(stored);
  }

  /**
   * Map a single raw finding from the Ansible module output to our
   * StoredFinding format. Public wrapper for the ingest endpoint.
   */
  mapRawFindingPublic(
    raw: IngestFinding,
    host: string,
    scanId: string,
  ): Omit<StoredFinding, 'id'> {
    return this.findingsParser.mapRawFindingPublic(raw, host, scanId);
  }

  // ─── Private delegates for backward compatibility ───────────────────
  // Tests access these via `(service as any).parseJobEvents(...)`.

  // @ts-expect-error TS6133
  private parseJobEvents(
    events: JobEvent[],
    scanId: string,
  ): Array<Omit<StoredFinding, 'id'>> {
    return this.findingsParser.parseJobEvents(events, scanId);
  }

  // @ts-expect-error TS6133
  private mapRawFinding(
    raw: Record<string, unknown>,
    host: string,
    scanId: string,
  ): Omit<StoredFinding, 'id'> {
    return this.findingsParser.mapRawFinding(raw as any, host, scanId);
  }

  // ─── Scan error details ─────────────────────────────────────────────

  /**
   * Fetch real error details from the Controller for a failed scan.
   *
   * Resolution order:
   *   1. Try fetching workflow nodes — find the failed child job
   *      and extract its result_traceback.
   *   2. If no workflow nodes (single JT per ADR-003), try getting
   *      the job status directly from the workflowJobId.
   *
   * Returns null on any error (best-effort, never breaks the scan flow).
   * Truncates result at 2000 chars.
   */
  async fetchScanErrorDetails(
    workflowJobId: number,
    token?: string,
  ): Promise<string | null> {
    if (!this.controllerClient) {
      return null;
    }

    try {
      // Step 1: Try workflow nodes to find the failed child job
      let childJobId: number | null = null;
      try {
        const nodes = await this.getWorkflowNodes(workflowJobId, token);
        if (nodes.length > 0) {
          const failedNode = nodes.find(
            n =>
              n.summary_fields?.job?.status === 'failed' ||
              n.summary_fields?.job?.status === 'error',
          );

          if (failedNode?.summary_fields?.job?.id) {
            childJobId = failedNode.summary_fields.job.id;
            const jobStatus = await this.controllerClient.getJobStatus(
              childJobId,
              token,
            );
            if (jobStatus.result_traceback) {
              this.logger.info(
                `Fetched error traceback for workflow ${workflowJobId} from child job ${childJobId}`,
              );
              return jobStatus.result_traceback.slice(0, 2000);
            }
          }
        }
      } catch {
        // Not a workflow job or workflow nodes unavailable — continue to Step 2
      }

      // Step 2: No traceback — extract error from job events (failed tasks / unreachable hosts)
      const targetJobId = childJobId ?? workflowJobId;
      const failureEvents = await this.controllerClient.getJobFailureEvents(
        targetJobId,
        token,
      );
      if (failureEvents.results.length > 0) {
        const lines: string[] = [];
        for (const ev of failureEvents.results.slice(0, 10)) {
          const data = ev.event_data as Record<string, unknown> | undefined;
          const res = data?.res as Record<string, unknown> | undefined;
          const host = (data?.host as string) ?? 'unknown';
          const task = (data?.task as string) ?? 'unknown';
          const msg = (res?.msg as string) ?? ev.event ?? 'unknown error';
          lines.push(`${host}: [${task}] ${msg}`);
        }
        if (failureEvents.count > 10) {
          lines.push(`... and ${failureEvents.count - 10} more`);
        }
        const details = lines.join('\n');
        this.logger.info(
          `Fetched ${failureEvents.results.length} failure events for job ${targetJobId}`,
        );
        return details.slice(0, 2000);
      }

      // Step 3: No traceback, no events — fetch stdout as last resort
      // (catches Ansible parse errors that fail before the play starts)
      try {
        const stdout = await this.controllerClient.getJobStdout(
          targetJobId,
          token,
        );
        if (stdout.content) {
          this.logger.info(
            `Fetched stdout for job ${targetJobId} as error detail`,
          );
          return stdout.content.slice(0, 2000);
        }
      } catch {
        // stdout fetch failed — best-effort
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch error details for workflow ${workflowJobId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  // ─── Dashboard (delegated to DashboardAggregator) ──────────────────

  async getBaselineScoresForProfile(remediationProfileId: string): Promise<
    Array<{
      inventoryId: number;
      passRate: number;
      passCount: number;
      failCount: number;
    }>
  > {
    if (!this.database || !this.dashboardAggregator) return [];
    return this.dashboardAggregator.getBaselineScoresForProfile(
      remediationProfileId,
    );
  }

  /**
   * Fetch error details for a failed remediation execution.
   * Iterates allJobIds, collects failure events from each, aggregates.
   * Same best-effort pattern as fetchScanErrorDetails.
   */
  async fetchRemediationErrorDetails(
    allJobIds: number[],
    token?: string,
  ): Promise<string | null> {
    if (!this.controllerClient || allJobIds.length === 0) {
      return null;
    }

    try {
      const capped = allJobIds.slice(0, 20);

      const perJobLines = await Promise.all(
        capped.map(async (jobId): Promise<string[]> => {
          try {
            const jobStatus = await this.controllerClient!.getJobStatus(
              jobId,
              token,
            );
            if (jobStatus.result_traceback) {
              return [jobStatus.result_traceback];
            }

            if (!jobStatus.failed) return [];

            const failureEvents =
              await this.controllerClient!.getJobFailureEvents(jobId, token);
            if (failureEvents.results.length > 0) {
              const eventLines: string[] = [];
              for (const ev of failureEvents.results.slice(0, 10)) {
                const data = ev.event_data as
                  | Record<string, unknown>
                  | undefined;
                const res = data?.res as Record<string, unknown> | undefined;
                const host = (data?.host as string) ?? 'unknown';
                const task = (data?.task as string) ?? 'unknown';
                const msg = (res?.msg as string) ?? ev.event ?? 'unknown error';
                eventLines.push(`${host}: [${task}] ${msg}`);
              }
              if (failureEvents.count > 10) {
                eventLines.push(
                  `... and ${
                    failureEvents.count - 10
                  } more failure events in job ${jobId}`,
                );
              }
              return eventLines;
            } else if (jobStatus.job_explanation) {
              return [`Job ${jobId}: ${jobStatus.job_explanation}`];
            }
            // Fallback: extract error lines from stdout (e.g. pre-runner failures)
            try {
              const stdout = await this.controllerClient!.getJobStdout(
                jobId,
                token,
              );
              if (stdout.content) {
                const errorLines = stdout.content
                  .split('\n')
                  .filter((l: string) =>
                    /ERROR|FATAL|fatal:|FAILED|Could not match|no hosts to target/i.test(
                      l,
                    ),
                  )
                  // eslint-disable-next-line no-control-regex
                  .map((l: string) => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
                  .filter(Boolean)
                  .slice(0, 5);
                if (errorLines.length > 0) {
                  return [`Job ${jobId}:`, ...errorLines];
                }
              }
            } catch {
              /* stdout not available */
            }
            return [];
          } catch {
            return [`Unable to fetch details for job ${jobId}`];
          }
        }),
      );

      const lines = perJobLines.flat();
      if (lines.length === 0) return null;

      const details = lines.join('\n');
      this.logger.info(
        `Fetched remediation error details for ${capped.length} jobs`,
      );
      // 2x scan error limit — remediations aggregate failures across multiple jobs
      return details.slice(0, 4000);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch remediation error details: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  // ─── Workflow status (for polling) ──────────────────────────────────

  async getWorkflowJobStatus(
    jobId: number,
    token?: string,
  ): Promise<WorkflowJobStatus> {
    if (this.dataSource === 'mock') {
      // Simulate a job that progresses to completion
      return {
        id: jobId,
        status: 'successful',
        finished: new Date().toISOString(),
        failed: false,
        elapsed: 45.2,
        name: 'compliance-scan-mock',
      };
    }

    return this.controllerClient!.getWorkflowJobStatus(jobId, token);
  }

  async getInventoryHostnames(
    inventoryId: number,
    token?: string,
  ): Promise<string[]> {
    if (this.dataSource === 'mock') {
      return ['nm-rhel01', 'nm-rhel02', 'nm-rhel03'];
    }
    return this.controllerClient!.getInventoryHostnames(inventoryId, token);
  }

  async getJobStatus(
    jobId: number,
    token?: string,
  ): Promise<WorkflowJobStatus> {
    if (this.dataSource === 'mock') {
      return {
        id: jobId,
        status: 'successful',
        finished: new Date().toISOString(),
        failed: false,
        elapsed: 30.0,
        name: 'compliance-remediate-mock',
      };
    }
    const result = await this.controllerClient!.getJobStatus(jobId, token);
    return {
      id: result.id,
      status: result.status,
      finished: result.finished,
      failed: result.failed,
      elapsed: result.elapsed,
      name: `job-${result.id}`,
      job_tags: result.job_tags || undefined,
    };
  }

  async getWorkflowNodes(
    jobId: number,
    token?: string,
  ): Promise<WorkflowNode[]> {
    if (this.dataSource === 'mock') {
      return [];
    }

    const result = await this.controllerClient!.getWorkflowNodes(jobId, token);
    return result.results;
  }

  async getJobEvents(jobId: number, token?: string): Promise<JobEvent[]> {
    if (this.dataSource === 'mock') {
      return [];
    }

    const result = await this.controllerClient!.getJobEvents(jobId, token);
    return result.results;
  }

  // ─── Remediation plan (delegated to RemediationPlanBuilder) ─────────

  buildRemediationPlan(
    selections: RemediationSelection[],
    findings: MultiHostFinding[],
  ): RemediationPlan {
    return this.remediationPlanBuilder.buildRemediationPlan(
      selections,
      findings,
    );
  }

  // ─── Dashboard (delegated to DashboardAggregator) ──────────────────

  async getDashboardStats(): Promise<DashboardStats> {
    if (this.dataSource === 'mock' && !this.dashboardAggregator) {
      return MockDataProvider.getDashboardStats();
    }
    if (!this.dashboardAggregator) {
      // No database set yet — return empty stats
      return {
        hostsScanned: 0,
        criticalFindings: 0,
        pendingRemediation: 0,
        activeProfiles: 0,
        recentScans: [],
        frameworkScores: [],
        postureStatus: [],
        byInventory: [],
      };
    }
    return this.dashboardAggregator.getDashboardStats();
  }

  // ─── Posture history ────────────────────────────────────────────────

  async getPostureHistory(
    profileId?: string,
    days?: number,
    inventoryId?: number,
  ): Promise<PostureSnapshot[]> {
    if (this.database) {
      const snapshots = await this.database.getPostureHistory(
        profileId,
        days,
        inventoryId,
      );
      if (snapshots.length > 0) return snapshots;
    }
    if (this.dataSource === 'mock') {
      return MockDataProvider.getPostureHistory(profileId, days);
    }
    return [];
  }

  async getHostPosture(
    inventoryId: number,
    profileId: string,
    req?: any,
    options?: { baselineView?: boolean },
  ): Promise<
    import('@ansible/backstage-compliance-common').HostPostureResponse
  > {
    if (!this.database) {
      if (this.dataSource === 'mock')
        return MockDataProvider.getHostPosture(inventoryId, profileId);
      throw new Error('Database not available');
    }

    let scan = await this.database.getAuthoritativeScan(profileId, inventoryId);
    if (!scan) {
      const fallback = await this.database.getLatestCompletedScan(
        profileId,
        inventoryId,
      );
      if (!fallback) {
        return {
          hosts: [],
          scanId: '',
          scanTimestamp: '',
          scanType: 'assessment',
          profileId,
          inventoryId,
        };
      }
      scan = fallback;
    }

    let hosts: import('@ansible/backstage-compliance-common').HostPosture[];
    if (options?.baselineView) {
      const targets = await this.database.getBaselineTargetsForProfile(
        profileId,
      );
      const target = targets.find(t => t.inventoryId === inventoryId);
      if (target) {
        const remProfile = await this.database.getRemediationProfile(
          target.remediationProfileId,
        );
        const ruleIds =
          remProfile?.selections
            .filter((s: any) => s.enabled !== false)
            .map((s: any) => s.ruleId) ?? [];
        hosts =
          ruleIds.length > 0
            ? await this.database.getHostPostureBaseline(scan.id, ruleIds)
            : await this.database.getHostPosture(scan.id);
      } else {
        hosts = await this.database.getHostPosture(scan.id);
      }
    } else {
      hosts = await this.database.getHostPosture(scan.id);
    }

    let hostFacts: Array<{
      hostname: string;
      ansible_os_family?: string;
      ansible_distribution_major_version?: string;
    }> = [];
    try {
      const token = req?.headers?.['x-aap-token'] as string | undefined;
      hostFacts = await this.getInventoryHostFacts(inventoryId, token);
    } catch {
      /* Controller unavailable — proceed without OS data */
    }

    const factsMap = new Map(hostFacts.map(f => [f.hostname, f]));
    for (const host of hosts) {
      const facts = factsMap.get(host.hostname);
      if (facts) {
        host.os =
          [facts.ansible_os_family, facts.ansible_distribution_major_version]
            .filter(Boolean)
            .join(' ') || undefined;
      }
    }

    return {
      hosts,
      scanId: scan.id,
      scanTimestamp: scan.completedAt || scan.startedAt,
      scanType: scan.scanType || 'assessment',
      profileId,
      inventoryId,
    };
  }

  async getHostFindings(
    inventoryId: number,
    hostname: string,
    profileId: string,
    limit: number = 50,
  ): Promise<
    import('@ansible/backstage-compliance-common').HostFindingsResponse
  > {
    if (!this.database) {
      if (this.dataSource === 'mock')
        return MockDataProvider.getHostFindings(
          inventoryId,
          hostname,
          profileId,
        );
      throw new Error('Database not available');
    }

    let scan = await this.database.getAuthoritativeScan(profileId, inventoryId);
    if (!scan) {
      const fallback = await this.database.getLatestCompletedScan(
        profileId,
        inventoryId,
      );
      if (!fallback) {
        return { hostname, scanId: '', profileId, findings: [], totalCount: 0 };
      }
      scan = fallback;
    }

    const findings = await this.database.getHostFindings(
      scan.id,
      hostname,
      limit,
    );
    return {
      hostname,
      scanId: scan.id,
      profileId,
      findings,
      totalCount: findings.length,
    };
  }

  async getRemediationEventsForTrend(
    days: number = 90,
    inventoryId?: number,
  ): Promise<
    import('@ansible/backstage-compliance-common').RemediationEvent[]
  > {
    if (!this.database) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return this.database.getExecutionsInTimeRange(
      cutoff.toISOString(),
      inventoryId,
    );
  }

  // ─── Remediations (saved rule selections) ──────────────────────────

  async getRemediationProfiles(
    statusFilter?: 'draft' | 'saved' | 'archived' | 'all',
  ): Promise<RemediationProfile[]> {
    if (this.database) {
      return this.database.listRemediationProfiles(statusFilter);
    }
    if (this.dataSource === 'mock') {
      const profiles = MockDataProvider.getRemediationProfiles();
      if (!statusFilter || statusFilter === 'all') return profiles;
      return profiles.filter(p => p.status === statusFilter);
    }
    return [];
  }

  async getRemediationProfile(id: string): Promise<RemediationProfile | null> {
    if (this.database) {
      return this.database.getRemediationProfile(id);
    }
    if (this.dataSource === 'mock') {
      const profiles = await MockDataProvider.getRemediationProfiles();
      return profiles.find(p => p.id === id) ?? null;
    }
    return null;
  }

  async saveRemediationProfile(
    request: SaveRemediationProfileRequest,
  ): Promise<RemediationProfile> {
    // In live mode with a database, persist to the DB
    if (this.dataSource === 'live' && this.database) {
      const saved = await this.database.saveRemediationProfile({
        id: request.id,
        name: request.name,
        description: request.description,
        profileId: request.complianceProfileId,
        creationScanId: request.creationScanId ?? request.scanId,
        selections: request.selections,
        status: request.status,
      });
      return {
        id: saved.id,
        name: request.name,
        description: request.description,
        complianceProfileId: request.complianceProfileId,
        creationScanId: request.creationScanId ?? request.scanId,
        targetInventory: '',
        status: request.status ?? 'saved',
        selections: request.selections,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // In mock mode (or live mode without DB), use the in-memory mock store
    const profile: RemediationProfile = {
      id: '',
      name: request.name,
      description: request.description,
      complianceProfileId: request.complianceProfileId,
      creationScanId: request.creationScanId ?? request.scanId,
      targetInventory: '',
      status: request.status ?? 'saved',
      selections: request.selections,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return MockDataProvider.saveRemediationProfile(profile);
  }

  async deleteRemediationProfile(id: string): Promise<boolean> {
    if (this.dataSource === 'live' && this.database) {
      return this.database.deleteRemediationProfile(id);
    }
    return MockDataProvider.deleteRemediationProfile(id);
  }
}
