/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Box, CircularProgress, Tooltip, makeStyles } from '@material-ui/core';
import type { ReactNode } from 'react';
import CheckIcon from '@material-ui/icons/Check';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import type { RemediationStep } from '../RemediationStepper';

/** Generate fixes → Push branch → Open pull request. */
const STEPS: { id: string; label: string }[] = [
  { id: 'prepare', label: 'Generate fixes' },
  { id: 'push', label: 'Push branch' },
  { id: 'pr', label: 'Open pull request' },
];

const DEFAULT_HELP =
  'Generate automated fixes for eligible findings, review patches if needed, push a remediation branch, then open a pull request.';

function remediationStepToIndex(step: RemediationStep): number {
  if (step === 'select' || step === 'generate') return 0;
  if (step === 'review' || step === 'push') return 1;
  if (step === 'pr') return 2;
  if (step === 'verify') return 3;
  return 0;
}

function stepIsSpinning(
  step: RemediationStep,
  stepIndex: number,
  busy: boolean,
): boolean {
  const activeIndex = remediationStepToIndex(step);
  if (stepIndex !== activeIndex || !busy) return false;
  if (stepIndex === 0) {
    return step === 'generate';
  }
  if (stepIndex === 1) {
    return step === 'push';
  }
  if (stepIndex === 2) {
    return step === 'pr';
  }
  return false;
}

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1.5, 2),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.03)'
        : theme.palette.background.paper,
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    transition: 'all 0.2s',
  },
  badgePending: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.grey[800]
        : theme.palette.grey[200],
    color: theme.palette.text.secondary,
    border: `2px solid ${theme.palette.divider}`,
  },
  badgeActive: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    border: `2px solid ${theme.palette.primary.main}`,
  },
  badgeComplete: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
    border: `2px solid ${theme.palette.success.main}`,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  labelActive: {
    color: theme.palette.primary.main,
    fontWeight: 600,
  },
  labelPending: {
    color: theme.palette.text.secondary,
  },
  arrow: {
    color: theme.palette.text.disabled,
    fontSize: 18,
    margin: '0 4px',
    userSelect: 'none',
  },
  help: {
    color: theme.palette.text.secondary,
    fontSize: 18,
    flexShrink: 0,
    cursor: 'help',
  },
}));

function stepBadgeClassName(
  base: string,
  complete: string,
  active: string,
  pending: string,
  isComplete: boolean,
  isActive: boolean,
): string {
  if (isComplete) return `${base} ${complete}`;
  if (isActive) return `${base} ${active}`;
  return `${base} ${pending}`;
}

function stepLabelClassName(
  base: string,
  active: string,
  pending: string,
  isActive: boolean,
  isPending: boolean,
): string {
  if (isActive) return `${base} ${active}`;
  if (isPending) return `${base} ${pending}`;
  return base;
}

function stepBadgeContent(
  isComplete: boolean,
  isSpinning: boolean,
  index: number,
): ReactNode {
  if (isComplete) {
    return <CheckIcon style={{ fontSize: 16 }} />;
  }
  if (isSpinning) {
    return <CircularProgress size={14} style={{ color: 'inherit' }} />;
  }
  return index + 1;
}

export interface QualityWorkflowStepperProps {
  activeStep: RemediationStep;
  /** True while remedia, push, or create-PR work is running. */
  busy?: boolean;
  helpText?: string;
}

export const QualityWorkflowStepper = ({
  activeStep,
  busy = false,
  helpText = DEFAULT_HELP,
}: QualityWorkflowStepperProps) => {
  const classes = useStyles();
  const activeIndex = remediationStepToIndex(activeStep);

  return (
    <Box
      className={classes.root}
      role="navigation"
      aria-label="Remediation workflow"
    >
      <Box className={classes.steps}>
        {STEPS.map((step, index) => {
          const isComplete = index < activeIndex;
          const isActive = index === activeIndex;
          const isPending = index > activeIndex;
          const isSpinning = stepIsSpinning(activeStep, index, busy);

          return (
            <Box key={step.id} className={classes.step} component="span">
              {index > 0 && (
                <span className={classes.arrow} aria-hidden>
                  →
                </span>
              )}
              <span
                className={stepBadgeClassName(
                  classes.badge,
                  classes.badgeComplete,
                  classes.badgeActive,
                  classes.badgePending,
                  isComplete,
                  isActive,
                )}
              >
                {stepBadgeContent(isComplete, isSpinning, index)}
              </span>
              <span
                className={stepLabelClassName(
                  classes.label,
                  classes.labelActive,
                  classes.labelPending,
                  isActive,
                  isPending,
                )}
              >
                {step.label}
              </span>
            </Box>
          );
        })}
      </Box>
      <Tooltip title={helpText}>
        <HelpOutlineIcon className={classes.help} aria-label="Workflow help" />
      </Tooltip>
    </Box>
  );
};
