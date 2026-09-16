export const PAGE_SIZE = 20;

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/** Coerce catalog limit to a supported page size for the UI control. */
export function resolvePageLimit(limit?: number): number {
  const candidate = limit ?? PAGE_SIZE;
  return PAGE_SIZE_OPTIONS.includes(candidate) ? candidate : PAGE_SIZE;
}

export const TEMPLATE_TOOLTIP =
  'A template provides a guided experience to get your automation running.';

export const TEMPLATE_DESCRIPTION =
  'Browse available templates. Each template provides a guided experience to get your automation running. Select "Start" to begin the guided task.';
