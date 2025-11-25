import { useMemo, useState, useEffect, useCallback } from 'react';
import { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { EntityPickerFieldExtension } from '@backstage/plugin-scaffolder';
import {
  ScaffolderFieldExtensions,
  SecretsContextProvider,
} from '@backstage/plugin-scaffolder-react';
import { useApi } from '@backstage/core-plugin-api';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';

import {
  Button,
  Paper,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@material-ui/core';
import { rhAapAuthApiRef } from '../../apis';
import { formExtraFields } from './formExtraFields';
import { ScaffolderForm } from './ScaffolderFormWrapper';

interface StepFormProps {
  steps: Array<{
    title: string;
    schema: Record<string, any>;
  }>;
  submitFunction: (formData: Record<string, any>) => Promise<void>;
}

export const StepForm = ({ steps, submitFunction }: StepFormProps) => {
  // Filter out steps that only contain a "token" field
  const filteredSteps = useMemo(() => {
    return steps.filter(step => {
      const properties = step.schema?.properties || {};
      const propertyKeys = Object.keys(properties);

      // Skip step if it only has "token" field or no fields at all
      if (propertyKeys.length === 0) return false;
      if (propertyKeys.length === 1 && propertyKeys[0] === 'token')
        return false;

      return true;
    });
  }, [steps]);

  // If no form steps, start directly at review step
  const [activeStep, setActiveStep] = useState(
    filteredSteps.length === 0 ? filteredSteps.length : 0,
  );
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);

  // Check if there are any meaningful fields to show (non-token fields with values)
  const hasDisplayableFields = useMemo(() => {
    return steps.some(step =>
      Object.entries(step.schema.properties || {}).some(
        ([key, property]: [string, any]) => {
          if (key === 'token') return false;
          // Check if field has a default value or user input
          const hasDefault = property?.default !== undefined;
          const hasUserValue = formData[key] !== undefined;
          return hasDefault || hasUserValue;
        },
      ),
    );
  }, [steps, formData]);

  const aapAuth = useApi(rhAapAuthApiRef);

  const extensions = useMemo(() => {
    return Object.fromEntries(
      formExtraFields.map(({ name, component }) => [name, component]),
    );
  }, []);
  const fields = useMemo(() => ({ ...extensions }), [extensions]);

  const handleNext = () => {
    setActiveStep(prevActiveStep => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep(prevActiveStep => prevActiveStep - 1);
  };

  const handleFormSubmit = (data: IChangeEvent<any>) => {
    setFormData(prev => ({
      ...prev,
      ...data.formData,
    }));
    handleNext();
  };

  const handleFinalSubmit = useCallback(async () => {
    const authToken = await aapAuth.getAccessToken();
    const finalData = { ...formData, token: authToken };
    try {
      await submitFunction(finalData);
    } catch (error) {
      console.error('Error during final submission:', error); // eslint-disable-line no-console
    }
  }, [formData, submitFunction, aapAuth]);

  // Auto-execute if no form steps and no displayable fields
  useEffect(() => {
    if (
      filteredSteps.length === 0 &&
      !hasDisplayableFields &&
      !isAutoExecuting
    ) {
      setIsAutoExecuting(true);
      // Use existing handleFinalSubmit function
      handleFinalSubmit().catch(error => {
        console.error('Error during auto-execution:', error); // eslint-disable-line no-console
        setIsAutoExecuting(false);
      });
    }
  }, [
    filteredSteps.length,
    hasDisplayableFields,
    isAutoExecuting,
    handleFinalSubmit,
  ]);

  const getLabel = (key: string, stepIndex: number) => {
    const stepSchema = steps[stepIndex].schema.properties || {};
    return stepSchema[key]?.title || key;
  };

  // Don't return early if no filtered steps - we still want to show the review step

  const extractProperties = (step: any) => {
    // Check if step.schema exists and has a properties field
    if (step?.schema?.properties) {
      return step.schema.properties;
    }

    // Return an empty object if no properties are found
    return {};
  };

  const getReviewValue = (
    key: any,
    stepIndex?: number,
  ): string | JSX.Element => {
    const value = formData[key];
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.map(el => el.name).join(', ');
      }
      return value.name ?? JSON.stringify(value);
    }
    if (stepIndex !== undefined) {
      const stepSchema = steps[stepIndex].schema.properties || {};
      if (stepSchema[key]?.type === 'boolean')
        return value ? (
          <CheckIcon color="primary" />
        ) : (
          <CloseIcon color="error" />
        );
    }
    return String(value || '');
  };

  return (
    <div>
      <SecretsContextProvider>
        <Stepper activeStep={activeStep} orientation="vertical">
          {filteredSteps.map((step, index) => (
            <Step key={index}>
              <StepLabel>{step.title}</StepLabel>
              <StepContent>
                <ScaffolderForm
                  schema={{
                    ...step.schema,
                    title: '',
                  }}
                  uiSchema={extractProperties(step)}
                  formData={formData}
                  fields={fields}
                  onSubmit={handleFormSubmit}
                  validator={validator}
                >
                  <ScaffolderFieldExtensions>
                    <EntityPickerFieldExtension />
                  </ScaffolderFieldExtensions>
                  <div>
                    {index > 0 && (
                      <Button
                        onClick={handleBack}
                        style={{ marginRight: '10px' }}
                        variant="outlined"
                      >
                        Back
                      </Button>
                    )}
                    {index < filteredSteps.length && (
                      <Button type="submit" variant="contained" color="primary">
                        Next
                      </Button>
                    )}
                  </div>
                </ScaffolderForm>
              </StepContent>
            </Step>
          ))}
          {/* Review Step */}
          <Step>
            <StepLabel>Review</StepLabel>
            <StepContent>
              <p>Please review if all information below is correct.</p>
              <TableContainer
                component={Paper}
                style={{ marginBottom: '10px' }}
              >
                <Table style={{ border: 0 }}>
                  <TableBody style={{ border: 0 }}>
                    {steps.flatMap((step, stepIndex) => [
                      <TableRow key={`${stepIndex}-title`}>
                        <TableCell colSpan={2} style={{ border: 0 }}>
                          <strong>{step.title}</strong>
                        </TableCell>
                      </TableRow>,
                      ...Object.entries(step.schema.properties || {}).flatMap(
                        ([key, _]) => {
                          if (key === 'token') {
                            return [];
                          }
                          const label = getLabel(key, stepIndex);
                          return (
                            <TableRow key={`${stepIndex}-${key}`}>
                              <TableCell style={{ border: 0 }}>
                                {label}
                              </TableCell>
                              <TableCell style={{ border: 0 }}>
                                {getReviewValue(key, stepIndex)}
                              </TableCell>
                            </TableRow>
                          );
                        },
                      ),
                    ])}
                  </TableBody>
                </Table>
              </TableContainer>
              <div>
                {filteredSteps.length > 0 && (
                  <Button
                    onClick={handleBack}
                    style={{ marginRight: '10px' }}
                    variant="outlined"
                  >
                    Back
                  </Button>
                )}
                <Button
                  onClick={handleFinalSubmit}
                  variant="contained"
                  color="secondary"
                >
                  Create
                </Button>
              </div>
            </StepContent>
          </Step>
        </Stepper>
        {activeStep === filteredSteps.length + 1 && (
          <Typography variant="h6" style={{ marginTop: '20px' }}>
            All steps completed!
          </Typography>
        )}
      </SecretsContextProvider>
    </div>
  );
};
