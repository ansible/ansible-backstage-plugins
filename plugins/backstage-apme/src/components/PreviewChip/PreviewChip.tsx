/*
 * Copyright Red Hat
 */

import { Box, Chip, Link, makeStyles } from '@material-ui/core';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { DEFAULT_APME_FEEDBACK_FORM_URL } from '../../constants/previewFeedback';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';

/** ADR-012 label for non-GA Plugin Factory surfaces. */
export const PREVIEW_CHIP_LABEL = 'Early access preview';

export const PREVIEW_NOTICE_TITLE = 'Ansible content modernization';

const useChipStyles = makeStyles(theme => ({
  chip: {
    marginLeft: theme.spacing(1),
    height: 22,
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  chipProminent: {
    marginLeft: 0,
    height: 24,
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(250, 120, 120, 0.22)'
        : theme.palette.error.light,
    color:
      theme.palette.type === 'dark'
        ? theme.palette.error.light
        : theme.palette.error.dark,
    border: `1px solid ${
      theme.palette.type === 'dark'
        ? 'rgba(250, 120, 120, 0.45)'
        : theme.palette.error.main
    }`,
    '& .MuiChip-label': {
      paddingLeft: theme.spacing(1.25),
      paddingRight: theme.spacing(1.25),
      lineHeight: 1.2,
    },
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  feedbackLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '0.8125rem',
    whiteSpace: 'nowrap',
  },
  feedbackIcon: {
    fontSize: 12,
    width: 12,
    height: 12,
  },
}));

export type PreviewChipVariant = 'default' | 'prominent';

export interface PreviewChipProps {
  variant?: PreviewChipVariant;
}

/** Resolves feedback form URL from config (default EAP form; empty string hides link). */
export function usePreviewFeedbackUrl(): string | null {
  const configApi = useApi(configApiRef);
  const enabled = useApmeEnabled();
  if (!enabled) {
    return null;
  }
  const configured = configApi.getOptionalString('ansible.apme.feedbackFormUrl');
  if (configured === '') {
    return null;
  }
  const trimmed = configured?.trim();
  if (trimmed) {
    return trimmed;
  }
  return DEFAULT_APME_FEEDBACK_FORM_URL;
}

/** ADR-012 — labels non-GA Plugin Factory surfaces (UI only, not a config toggle). */
export const PreviewChip = ({ variant = 'default' }: PreviewChipProps) => {
  const classes = useChipStyles();
  const prominent = variant === 'prominent';

  return (
    <Chip
      label={PREVIEW_CHIP_LABEL}
      size="small"
      variant={prominent ? 'default' : 'outlined'}
      className={prominent ? classes.chipProminent : classes.chip}
      data-testid="preview-chip"
    />
  );
};

export const PreviewFeedbackLink = () => {
  const classes = useChipStyles();
  const feedbackUrl = usePreviewFeedbackUrl();
  if (!feedbackUrl) {
    return null;
  }
  return (
    <Link
      href={feedbackUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={classes.feedbackLink}
      data-testid="preview-feedback-link"
    >
      Share your feedback
      <OpenInNewIcon className={classes.feedbackIcon} fontSize="inherit" />
    </Link>
  );
};

export interface PreviewLabelRowProps {
  variant?: PreviewChipVariant;
}

/** Early-access chip plus optional feedback link (ADR-012 placement). */
export const PreviewLabelRow = ({ variant = 'default' }: PreviewLabelRowProps) => {
  const classes = useChipStyles();
  return (
    <Box className={classes.labelRow}>
      <PreviewChip variant={variant} />
      <PreviewFeedbackLink />
    </Box>
  );
};

/** Top-of-tab early-access label (ADR-012). */
export const PreviewNotice = () => (
  <Box
    marginBottom={2}
    role="status"
    aria-label={`${PREVIEW_NOTICE_TITLE} ${PREVIEW_CHIP_LABEL}`}
  >
    <PreviewLabelRow variant="prominent" />
  </Box>
);
