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

import { Box, CircularProgress, makeStyles } from '@material-ui/core';
import type { ReactNode } from 'react';
import CheckIcon from '@material-ui/icons/Check';
import type { RemediationStep } from '../RemediationStepper';

const STEPS = [
  { id: 'select', label: 'Select' },
  { id: 'generate', label: 'Generate' },
  { id: 'review', label: 'Review' },
  { id: 'push-act', label: 'Push & Act' },
] as const;

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
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
    color: theme.palette.text.primary,
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
}));

/** Maps internal remediation steps to the 4-step design stepper. */
export function workflowStepIndex(step: RemediationStep): number {
  if (step === 'select') return 0;
  if (step === 'generate') return 1;
  if (step === 'review') return 2;
  return 3;
}

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
  creatingPr?: boolean;
}

export const QualityWorkflowStepper = ({
  activeStep,
  creatingPr = false,
}: QualityWorkflowStepperProps) => {
  const classes = useStyles();
  const activeIndex = workflowStepIndex(activeStep);

  return (
    <Box
      className={classes.root}
      role="navigation"
      aria-label="Remediation workflow"
    >
      {STEPS.map((step, index) => {
        const isComplete = index < activeIndex;
        const isActive = index === activeIndex;
        const isPending = index > activeIndex;
        const isSpinning =
          isActive &&
          (activeStep === 'generate' ||
            activeStep === 'push' ||
            creatingPr ||
            activeStep === 'pr');

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
  );
};
