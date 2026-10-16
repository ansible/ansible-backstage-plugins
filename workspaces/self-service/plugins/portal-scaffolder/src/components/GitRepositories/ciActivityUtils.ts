import { Entity } from '@backstage/catalog-model';
import { getSourceUrl } from '../CollectionsCatalog/utils';
import { getProjectDisplayName } from './scmUtils';

export type CIActivityRow = {
  id: string;
  status:
    | 'success'
    | 'failure'
    | 'cancelled'
    | 'in_progress'
    | 'queued'
    | 'skipped'
    | 'unknown';
  project: string;
  projectUrl?: string;
  event: string;
  eventDisplay: string;
  trigger: string;
  time: string;
  runUrl?: string;
};

export const STATUS_LABELS: Record<CIActivityRow['status'], string> = {
  success: 'Success',
  failure: 'Failure',
  cancelled: 'Cancelled',
  in_progress: 'In Progress',
  queued: 'Queued',
  skipped: 'Skipped',
  unknown: 'Unknown',
};

function normalizeGitLabStatus(
  s: string | undefined | null,
): CIActivityRow['status'] {
  const status = (s ?? 'unknown').toLowerCase();
  const map: Record<string, CIActivityRow['status']> = {
    success: 'success',
    failed: 'failure',
    canceled: 'cancelled',
    cancelled: 'cancelled',
    running: 'in_progress',
    pending: 'in_progress',
    skipped: 'skipped',
  };
  return map[status] ?? 'unknown';
}

function normalizeGitHubStatus(raw: string): CIActivityRow['status'] {
  const valid: CIActivityRow['status'][] = [
    'success',
    'failure',
    'cancelled',
    'in_progress',
    'queued',
    'skipped',
  ];
  const s = raw.toLowerCase();
  return valid.includes(s as CIActivityRow['status'])
    ? (s as CIActivityRow['status'])
    : 'unknown';
}

export function parseGitHubRuns(
  key: string,
  data: unknown,
  entity: Entity,
): CIActivityRow[] {
  const ghData = data as Record<string, unknown> | undefined;
  const runs = (
    Array.isArray(ghData?.workflow_runs) ? ghData.workflow_runs : []
  ) as Record<string, unknown>[];
  const repoUrl = getSourceUrl(entity);
  const baseUrl = (repoUrl ?? '').replace(/\.git$/i, '');
  const projectUrl = baseUrl ? `${baseUrl}/actions` : undefined;
  const projectName = getProjectDisplayName(entity);

  return runs.map((r: Record<string, unknown>) => {
    const run = r as Record<string, string | number | undefined>;
    return {
      id: `gh-${key}-${run.id}`,
      status: normalizeGitHubStatus(
        String(run.conclusion ?? run.status ?? 'unknown'),
      ),
      project: projectName,
      projectUrl,
      event: String(run.name ?? 'Workflow'),
      eventDisplay: `${run.name ?? 'Workflow'} #${run.run_number ?? run.id}`,
      trigger: String(run.event ?? 'unknown').replaceAll('_', ' '),
      time: String(run.created_at ?? ''),
      runUrl: run.html_url ? String(run.html_url) : undefined,
    };
  });
}

export function parseGitLabPipelines(
  key: string,
  data: unknown,
  entity: Entity,
): CIActivityRow[] {
  const pipelines = (Array.isArray(data) ? data : []) as Record<
    string,
    unknown
  >[];
  const repoUrl = getSourceUrl(entity);
  const baseUrl = (repoUrl ?? '').replace(/\.git$/i, '');
  const projectUrl = baseUrl ? `${baseUrl}/-/pipelines` : undefined;
  const projectName = getProjectDisplayName(entity);

  return pipelines.map((p: Record<string, unknown>) => {
    const pipeline = p as Record<string, string | number | undefined>;
    return {
      id: `gl-${key}-${pipeline.id}`,
      status: normalizeGitLabStatus(
        pipeline.status !== null && pipeline.status !== undefined
          ? String(pipeline.status)
          : undefined,
      ),
      project: projectName,
      projectUrl,
      event: 'Pipeline',
      eventDisplay: `Pipeline #${pipeline.id}`,
      trigger: String(pipeline.source ?? 'unknown').replaceAll('_', ' '),
      time: String(pipeline.created_at ?? ''),
      runUrl: pipeline.web_url ? String(pipeline.web_url) : undefined,
    };
  });
}

export function buildRowsFromResults(
  results: Record<
    string,
    { status: number; data: unknown } | { error: string }
  >,
  entityMap: Map<string, { entity: Entity; provider: string }>,
): CIActivityRow[] {
  const allRows: CIActivityRow[] = [];

  for (const [key, result] of Object.entries(results)) {
    if ('error' in result) continue;
    const entry = entityMap.get(key);
    if (!entry) continue;

    if (entry.provider === 'github') {
      allRows.push(...parseGitHubRuns(key, result.data, entry.entity));
    } else if (entry.provider === 'gitlab') {
      allRows.push(...parseGitLabPipelines(key, result.data, entry.entity));
    }
  }

  allRows.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );
  return allRows.slice(0, 150);
}
