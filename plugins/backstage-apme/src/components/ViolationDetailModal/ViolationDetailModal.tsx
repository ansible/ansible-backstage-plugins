/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  Box,
  Dialog,
  IconButton,
  Typography,
  makeStyles,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import type { Violation } from '@ansible/backstage-apme-common/types';
import {
  SEVERITY_STYLES,
  normalizeSeverity,
  categoryLabel,
} from '@ansible/backstage-apme-common/severity';
import { getViolationCategory } from '../../utils/violationAnalytics';
import { DiffView } from '../DiffView';

const useStyles = makeStyles(theme => ({
  dialogPaper: {
    maxWidth: 680,
    width: '100%',
    borderRadius: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '20px 24px 16px',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  body: {
    padding: '0 24px 24px',
    maxHeight: '60vh',
    overflowY: 'auto',
  },
  violationRow: {
    padding: '12px 0',
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': { borderBottom: 'none' },
  },
  severityChip: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  ruleId: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: theme.palette.text.secondary,
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
    padding: '1px 5px',
    borderRadius: 3,
  },
}));

export interface ViolationDetailModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  violations: Violation[];
  onClose: () => void;
}

export const ViolationDetailModal = ({
  open,
  title,
  subtitle,
  violations,
  onClose,
}: ViolationDetailModalProps) => {
  const classes = useStyles();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      classes={{ paper: classes.dialogPaper }}
    >
      <Box className={classes.header}>
        <Box>
          <Typography variant="h6" style={{ fontSize: 16, fontWeight: 600 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="textSecondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </Box>
      <Box className={classes.body}>
        {violations.map(v => {
          const sev = normalizeSeverity(v.level);
          const style = SEVERITY_STYLES[sev];
          return (
            <Box key={v.id} className={classes.violationRow}>
              <Box
                display="flex"
                alignItems="center"
                style={{ gap: 8, flexWrap: 'wrap' }}
              >
                <span
                  className={classes.severityChip}
                  style={{
                    backgroundColor: style.background,
                    color: style.text,
                  }}
                >
                  {style.label}
                </span>
                <span className={classes.ruleId}>{v.rule_id}</span>
                <Typography variant="body2" style={{ flex: 1 }}>
                  {v.message}
                </Typography>
              </Box>
              <Typography
                variant="caption"
                color="textSecondary"
                display="block"
              >
                {categoryLabel(getViolationCategory(v))} · {v.file}
                {v.line ? `:${v.line}` : ''}
              </Typography>
              {(v.original_yaml || v.fixed_yaml) && (
                <Box mt={1}>
                  <DiffView
                    before={v.original_yaml ?? ''}
                    after={v.fixed_yaml ?? v.original_yaml ?? ''}
                  />
                </Box>
              )}
            </Box>
          );
        })}
        {violations.length === 0 && (
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ padding: '16px 0' }}
          >
            No violations to display.
          </Typography>
        )}
      </Box>
    </Dialog>
  );
};
