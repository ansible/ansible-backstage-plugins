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
import CheckIcon from '@material-ui/icons/Check';
import type { RemediationStep } from '../RemediationStepper';
import React from 'react';

const STEPS: { id: RemediationStep; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'generate', label: 'Generate' },
  { id: 'review', label: 'Review' },
  { id: 'push', label: 'Push branch' },
  { id: 'pr', label: 'Create PR' },
  { id: 'verify', label: 'Verify' },
];

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

function stepIndex(step: RemediationStep): number {
  return STEPS.findIndex(s => s.id === step);
}

function badgeClassName(
  classes: ReturnType<typeof useStyles>,
  isComplete: boolean,
  isActive: boolean,
): string {
  if (isComplete) {
    return `${classes.badge} ${classes.badgeComplete}`;
  }
  if (isActive) {
    return `${classes.badge} ${classes.badgeActive}`;
  }
  return `${classes.badge} ${classes.badgePending}`;
}

function labelClassName(
  classes: ReturnType<typeof useStyles>,
  isActive: boolean,
  isPending: boolean,
): string {
  if (isActive) {
    return `${classes.label} ${classes.labelActive}`;
  }
  if (isPending) {
    return `${classes.label} ${classes.labelPending}`;
  }
  return classes.label;
}

function renderBadgeContent(
  isComplete: boolean,
  isSpinning: boolean,
  index: number,
): React.ReactNode {
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
}

export const QualityWorkflowStepper = ({
  activeStep,
}: QualityWorkflowStepperProps) => {
  const classes = useStyles();
  const activeIndex = stepIndex(activeStep);

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
          (step.id === 'generate' || step.id === 'push' || step.id === 'pr');

        return (
          <Box key={step.id} className={classes.step} component="span">
            {index > 0 && (
              <span className={classes.arrow} aria-hidden>
                →
              </span>
            )}
            <span className={badgeClassName(classes, isComplete, isActive)}>
              {renderBadgeContent(isComplete, isSpinning, index)}
            </span>
            <span className={labelClassName(classes, isActive, isPending)}>
              {step.label}
            </span>
          </Box>
        );
      })}
    </Box>
  );
};
