import type { ReactNode } from 'react';

/** Route-owned empty state; callers distinguish missing sources from filtered results. */
export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}

/** Content heading, not a second portal header. Permissions belong to the caller. */
export interface PageHeaderSectionProps {
  title: string;
  description?: string;
  /** Optional prototype-style help tooltip beside the page title. */
  tooltip?: string;
  help?: string;
  actions?: ReactNode;
  status?: ReactNode;
}
