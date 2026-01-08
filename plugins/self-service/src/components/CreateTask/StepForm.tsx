import { useMemo, useState, useEffect, useCallback } from 'react';
import { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { EntityPickerFieldExtension } from '@backstage/plugin-scaffolder';
import {
  ScaffolderFieldExtensions,
  SecretsContextProvider,
} from '@backstage/plugin-scaffolder-react';
import { useApi } from '@backstage/core-plugin-api';

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
  initialFormData?: Record<string, any>;
}

export const StepForm = ({
  steps,
  submitFunction,
  initialFormData,
}: StepFormProps) => {
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
  const [formData, setFormData] = useState<Record<string, any>>(
    initialFormData || {},
  );
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);

  useEffect(() => {
    if (initialFormData) {
      setFormData(initialFormData);
    }
  }, [initialFormData]);

  // Check if there are any meaningful fields to show (non-token fields with values)
  const hasDisplayableFields = useMemo(() => {
    return steps.some(step =>
      Object.entries(step.schema?.properties || {}).some(
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

  const getAllProperties = (step: any): Record<string, any> => {
    const allProperties: Record<string, any> = {};

    if (step?.schema?.properties) {
      Object.assign(allProperties, step.schema.properties);
    }

    if (step?.schema?.dependencies) {
      for (const depKey of Object.keys(step.schema.dependencies)) {
        const dependency = step.schema.dependencies[depKey];
        if (dependency.oneOf && Array.isArray(dependency.oneOf)) {
          for (const branch of dependency.oneOf) {
            if (branch.properties) {
              for (const key of Object.keys(branch.properties)) {
                if (key !== depKey && !allProperties[key]) {
                  allProperties[key] = branch.properties[key];
                }
              }
            }
          }
        }
      }
    }
    return allProperties;
  };

  const getLabel = (key: string, stepIndex: number) => {
    const allProperties = getAllProperties(steps[stepIndex]);
    return allProperties[key]?.title || key;
  };

  // Don't return early if no filtered steps - we still want to show the review step

  const extractUiSchema = (
    properties: Record<string, any>,
    dependencies?: Record<string, any>,
  ): Record<string, any> => {
    const uiSchema: Record<string, any> = {};

    if (!properties) return uiSchema;

    const extractUiFromProperty = (
      property: any,
    ): Record<string, any> | null => {
      if (!property) return null;

      const ui: Record<string, any> = {};
      let hasUiProperties = false;

      for (const key of Object.keys(property)) {
        if (key.startsWith('ui:')) {
          ui[key] = property[key];
          hasUiProperties = true;
        }
      }

      if (property.ui && typeof property.ui === 'object') {
        for (const uiKey of Object.keys(property.ui)) {
          const uiPropertyKey = `ui:${uiKey}`;
          if (!ui[uiPropertyKey]) {
            ui[uiPropertyKey] = property.ui[uiKey];
            hasUiProperties = true;
          }
        }
      }
      return hasUiProperties ? ui : null;
    };

    for (const key of Object.keys(properties)) {
      const ui = extractUiFromProperty(properties[key]);
      if (ui) {
        uiSchema[key] = ui;
      }
    }

    if (dependencies) {
      for (const depKey of Object.keys(dependencies)) {
        const dependency = dependencies[depKey];
        if (dependency.oneOf && Array.isArray(dependency.oneOf)) {
          for (const branch of dependency.oneOf) {
            if (branch.properties) {
              for (const key of Object.keys(branch.properties)) {
                if (key !== depKey) {
                  const ui = extractUiFromProperty(branch.properties[key]);
                  if (ui) {
                    uiSchema[key] = ui;
                  }
                }
              }
            }
          }
        }
      }
    }

    return uiSchema;
  };

  const extractProperties = (step: any) => {
    if (!step?.schema) {
      return {};
    }

    const schema = step.schema;
    const properties = schema.properties || {};
    const dependencies = schema.dependencies;

    // Extract and return the ui schema
    return extractUiSchema(properties, dependencies);
  };

  const decodeBase64FileContent = (dataUrl: string): string | null => {
    if (
      typeof dataUrl === 'string' &&
      dataUrl.startsWith('data:text/plain;base64,')
    ) {
      try {
        const base64Content = dataUrl.split(',')[1];
        if (base64Content) {
          return atob(base64Content);
        }
      } catch {
        // If decoding fails, return null to fall back to default display
      }
    }
    return null;
  };

  const getReviewValue = (
    key: any,
    stepIndex?: number,
  ): string | JSX.Element => {
    const value = formData[key];
    if (
      typeof value === 'string' &&
      value.startsWith('data:text/plain;base64,')
    ) {
      const decodedContent = decodeBase64FileContent(value);
      if (decodedContent) {
        return (
          <pre
            style={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              padding: '8px',
              backgroundColor: 'rgba(128, 128, 128, 0.1)',
              border: '1px solid rgba(128, 128, 128, 0.4)',
              borderRadius: '4px',
              maxHeight: '200px',
              overflow: 'auto',
            }}
          >
            {decodedContent}
          </pre>
        );
      }
    }

    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'string') {
          return value.join(', ');
        }
        if (value.length > 0 && typeof value[0] === 'object' && value[0].name) {
          return value.map(el => el.name).join(', ');
        }
        return value
          .map(el =>
            typeof el === 'object' && el !== null
              ? el.name || JSON.stringify(el)
              : String(el),
          )
          .join(', ');
      }
      return value.name ?? JSON.stringify(value);
    }
    if (stepIndex !== undefined) {
      const stepSchema = steps[stepIndex].schema.properties || {};
      if (stepSchema[key]?.type === 'boolean') {
        return value ? 'Yes' : 'No';
      }
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
                  <div style={{ marginTop: '25px' }}>
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
                    {steps.flatMap((step, stepIndex) => {
                      const allProperties = getAllProperties(step);
                      const propertyRows = Object.entries(
                        allProperties,
                      ).flatMap(([key, _]) => {
                        if (key === 'token') {
                          return [];
                        }
                        const value = formData[key];
                        if (
                          value === undefined ||
                          value === null ||
                          value === ''
                        ) {
                          return [];
                        }
                        if (Array.isArray(value) && value.length === 0) {
                          return [];
                        }
                        const label = getLabel(key, stepIndex);
                        return (
                          <TableRow key={`${stepIndex}-${key}`}>
                            <TableCell style={{ border: 0 }}>{label}</TableCell>
                            <TableCell style={{ border: 0 }}>
                              {getReviewValue(key, stepIndex)}
                            </TableCell>
                          </TableRow>
                        );
                      });

                      const hasNoValues = propertyRows.length === 0;

                      return [
                        <TableRow key={`${stepIndex}-title`}>
                          <TableCell style={{ border: 0 }}>
                            <strong>{step.title}</strong>
                          </TableCell>
                          <TableCell
                            style={{
                              border: 0,
                              color: hasNoValues
                                ? 'rgba(128, 128, 128, 0.8)'
                                : 'inherit',
                              fontStyle: hasNoValues ? 'italic' : 'normal',
                            }}
                          >
                            {hasNoValues ? 'None' : ''}
                          </TableCell>
                        </TableRow>,
                        ...propertyRows,
                      ];
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <div style={{ marginTop: '25px' }}>
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
