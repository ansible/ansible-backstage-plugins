/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { Project } from './types';
import { projectNeedsSeverityEnrichment } from './severity';

/**
 * Gateway list_projects returns totals without severity_breakdown; enrich rows
 * that have violations so portal consumers (Violations column, fleet rollups)
 * can colorize by worst severity instead of defaulting to medium/amber.
 */
export async function enrichProjectsWithSeverityBreakdown(
  projects: Project[],
  fetchDetail: (
    projectId: string,
  ) => Promise<Pick<Project, 'severity_breakdown'>>,
): Promise<Project[]> {
  return Promise.all(
    projects.map(async project => {
      if (!projectNeedsSeverityEnrichment(project)) {
        return project;
      }
      try {
        const detail = await fetchDetail(project.id);
        if (!detail.severity_breakdown) {
          return project;
        }
        return {
          ...project,
          severity_breakdown: detail.severity_breakdown,
        };
      } catch {
        return project;
      }
    }),
  );
}
