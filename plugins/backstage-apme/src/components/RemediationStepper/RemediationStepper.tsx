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
 * See the License for the applicable License.
 */

import { Box, Step, StepLabel, Stepper, makeStyles } from '@material-ui/core';

export type RemediationStep =
  'select' | 'generate' | 'review' | 'push' | 'pr' | 'verify';

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
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1, 0),
  },
}));

export interface RemediationStepperProps {
  activeStep: RemediationStep;
}

export const RemediationStepper = ({ activeStep }: RemediationStepperProps) => {
  const classes = useStyles();
  const activeIndex = STEPS.findIndex(s => s.id === activeStep);

  return (
    <Box className={classes.root}>
      <Stepper activeStep={activeIndex} alternativeLabel>
        {STEPS.map(step => (
          <Step key={step.id}>
            <StepLabel>{step.label}</StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};
