import React, { useMemo, useState } from 'react';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import StepContent from '@mui/material/StepContent';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { IChangeEvent } from '@rjsf/core';
import { ScaffolderForm } from './ScaffolderFormWrapper';
import validator from '@rjsf/validator-ajv8';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import { EntityPickerFieldExtension } from '@backstage/plugin-scaffolder';
import {
  ScaffolderFieldExtensions,
  SecretsContextProvider,
} from '@backstage/plugin-scaffolder-react';
import { useApi } from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from '../../apis';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { createTheme, ThemeProvider } from '@material-ui/core/styles';
import { formExtraFields } from '../../constants/formExtraFields';

interface StepFormProps {
  steps: Array<{
    title: string;
    schema: Record<string, any>;
  }>;
  submitFunction: (formData: Record<string, any>) => Promise<void>;
}

const scaffolderTheme = createTheme({
  props: {
    MuiTextField: {
      variant: 'outlined',
    },
    MuiSelect: {
      variant: 'outlined',
    },
    MuiFormControl: {
      variant: 'outlined',
    },
    MuiButton: {
      variant: 'contained',
      color: 'primary',
    },
    MuiCheckbox: {
      color: 'primary',
    },
    MuiRadio: {
      color: 'primary',
    },
    MuiSwitch: {
      color: 'primary',
    },
    MuiDialog: {
      fullWidth: true,
    },
    MuiTypography: {
      variant: 'body1',
    },
    MuiIconButton: {
      color: 'default',
    },
    MuiAppBar: {
      position: 'sticky',
    },
  },
});

export function StepForm({ steps, submitFunction }: StepFormProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  let token: string;
  const aapAuth = useApi(rhAapAuthApiRef);
  aapAuth.getAccessToken().then((t: string) => {
    token = t;
  });

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

  const handleFinalSubmit = async () => {
    formData.token = token;
    try {
      await submitFunction(formData);
    } catch (error) {
      console.error('Error during final submission:', error); // eslint-disable-line no-console
    }
  };

  const getLabel = (key: string, stepIndex: number) => {
    const stepSchema = steps[stepIndex].schema.properties || {};
    return stepSchema[key]?.title || key;
  };

  if (!steps || steps.length === 0) {
    return <p>No steps available</p>;
  }

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
          <CheckIcon color="success" />
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
          {steps.map((step, index) => (
            <Step key={index}>
              <StepLabel>{step.title}</StepLabel>
              <StepContent>
                <ThemeProvider theme={scaffolderTheme}>
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
                      {index < steps.length && (
                        <Button
                          type="submit"
                          variant="contained"
                          color="primary"
                        >
                          Next
                        </Button>
                      )}
                    </div>
                  </ScaffolderForm>
                </ThemeProvider>
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
                <Table sx={{ border: 0 }}>
                  <TableBody sx={{ border: 0 }}>
                    {steps.flatMap((step, stepIndex) => [
                      <TableRow
                        key={`${stepIndex}-title`}
                        sx={{ backgroundColor: '#F8F8F8' }}
                      >
                        <TableCell colSpan={2} sx={{ border: 0 }}>
                          <strong>{step.title}</strong>
                        </TableCell>
                      </TableRow>,
                      ...Object.entries(step.schema.properties || {}).flatMap(
                        ([key, _]) => {
                          if (
                            step.schema?.properties?.[key]?.['ui:backstage']
                              ?.review?.show === false
                          ) {
                            return [];
                          }
                          const label = getLabel(key, stepIndex);
                          return (
                            <TableRow key={`${stepIndex}-${key}`}>
                              <TableCell sx={{ border: 0 }}>{label}</TableCell>
                              <TableCell sx={{ border: 0 }}>
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
                <Button
                  onClick={handleBack}
                  style={{ marginRight: '10px' }}
                  variant="outlined"
                >
                  Back
                </Button>
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
        {activeStep === steps.length + 1 && (
          <Typography variant="h6" style={{ marginTop: '20px' }}>
            All steps completed!
          </Typography>
        )}
      </SecretsContextProvider>
    </div>
  );
}
