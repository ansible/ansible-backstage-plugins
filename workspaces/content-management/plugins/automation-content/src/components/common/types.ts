import type { ReactNode } from 'react';

/** Route-owned empty state; callers distinguish missing sources from filtered results. */
export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Source facts and authorization are supplied by the page, never inferred. */
  hasConfiguredSources?: boolean;
  repositoryFilter?: string;
  canSync?: boolean;
  onSyncClick?: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  syncInProgress?: boolean;
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
  descriptionExtra?: ReactNode;
  /** Supplying the callback opts into the caller-authorized sync action. */
  onSyncClick?: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  syncInProgress?: boolean;
}
