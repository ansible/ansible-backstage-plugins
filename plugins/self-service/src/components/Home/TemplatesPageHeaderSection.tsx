import type { ReactNode } from 'react';
import { Typography } from '@material-ui/core';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { PageHeaderSection } from '../common';
import type { SyncProgressEntry } from '../common';
import { TEMPLATE_TOOLTIP, TEMPLATE_DESCRIPTION } from './constants';

interface TemplatesPageHeaderSectionProps {
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
  actions?: ReactNode;
}

export const TemplatesPageHeaderSection = ({
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress,
  actions,
}: TemplatesPageHeaderSectionProps) => (
  <PageHeaderSection
    title="Templates"
    tooltip={TEMPLATE_TOOLTIP}
    description={TEMPLATE_DESCRIPTION}
    onSyncClick={onSyncClick}
    syncDisabled={syncDisabled}
    syncDisabledReason={syncDisabledReason}
    syncInProgress={syncInProgress}
    syncProgress={syncProgress}
    actions={actions}
    descriptionExtra={
      <Typography
        component="a"
        href="https://red.ht/self-service-launch-template"
        target="_blank"
        rel="noopener noreferrer"
        variant="body2"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          color: 'inherit',
          textDecoration: 'underline',
        }}
      >
        Learn more <OpenInNewIcon style={{ fontSize: '0.875rem' }} />
      </Typography>
    }
  />
);
