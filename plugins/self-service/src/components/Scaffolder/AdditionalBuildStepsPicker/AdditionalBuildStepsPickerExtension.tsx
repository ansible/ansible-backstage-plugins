import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import {
  Button,
  Select,
  MenuItem,
  Typography,
  Box,
  IconButton,
  FormControl,
  InputLabel,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import DeleteIcon from '@material-ui/icons/Delete';
import { BuildStep } from './types';

const useStyles = makeStyles(theme => ({
  title: {
    fontSize: '1.2rem',
    fontWeight: 500,
    marginBottom: theme.spacing(2),
    color: theme.palette.text.primary,
  },
  stepAccordion: {
    marginBottom: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    '&:before': {
      display: 'none',
    },
    boxShadow: 'none',
  },
  accordionSummary: {
    padding: theme.spacing(1, 2),
    minHeight: 48,
    '&.Mui-expanded': {
      minHeight: 48,
    },
    flexDirection: 'row-reverse',
    '& .MuiAccordionSummary-expandIconWrapper': {
      marginRight: theme.spacing(1),
      marginLeft: 0,
    },
  },
  accordionSummaryContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 0,
    '&.Mui-expanded': {
      margin: 0,
    },
  },
  stepTitleContainer: {
    flex: 1,
    marginLeft: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
  },
  stepTitle: {
    color: theme.palette.text.primary,
    fontWeight: 500,
  },
  stepTypeSubtitle: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
    marginTop: theme.spacing(0.25),
  },
  deleteButton: {
    marginLeft: theme.spacing(1),
    padding: theme.spacing(0.5),
  },
  accordionDetails: {
    flexDirection: 'column',
    padding: theme.spacing(2),
    paddingTop: theme.spacing(1),
  },
  formControl: {
    width: '100%',
    marginBottom: theme.spacing(2),
  },
  commandsContainer: {
    width: '100%',
  },
  addButton: {
    width: '100%',
    marginTop: theme.spacing(1),
    padding: theme.spacing(1.5),
    textTransform: 'none',
    fontSize: '1rem',
  },
  commandInput: {
    marginTop: theme.spacing(1),
    '& .MuiOutlinedInput-root': {
      '& fieldset': {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: theme.palette.divider,
      },
      '&:hover fieldset': {
        borderColor: theme.palette.text.primary,
      },
      '&.Mui-focused fieldset': {
        borderColor: theme.palette.primary.main,
        borderWidth: '2px',
      },
    },
  },
}));

export const AdditionalBuildStepsPickerExtension = ({
  onChange,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
}: FieldExtensionComponentProps<BuildStep[]>) => {
  const classes = useStyles();

  const itemsSchema = (schema?.items as any)?.properties || {};
  const stepTypeEnum = itemsSchema.stepType?.enum || [];
  const stepTypeEnumNames = itemsSchema.stepType?.enumNames || [];
  const defaultStepType =
    itemsSchema.stepType?.default || stepTypeEnum[0] || '';

  const [steps, setSteps] = useState<BuildStep[]>(formData || []);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  const [commandTexts, setCommandTexts] = useState<{ [key: number]: string }>(
    {},
  );

  const customTitle =
    uiSchema?.['ui:options']?.title ||
    schema?.title ||
    'Additional Build Steps';

  useEffect(() => {
    if (formData !== undefined && !isInitialized) {
      setSteps(formData);
      const texts: { [key: number]: string } = {};
      for (const [index, step] of formData.entries()) {
        texts[index] = step.commands ? step.commands.join('\n') : '';
      }
      setCommandTexts(texts);
      setIsInitialized(true);
      setExpandedSteps(new Set());
    }
  }, [formData, isInitialized]);

  const handleStepTypeChange = (index: number, value: string) => {
    const updatedSteps = [...steps];
    updatedSteps[index] = { ...updatedSteps[index], stepType: value };
    setSteps(updatedSteps);
    onChange(updatedSteps);
  };

  const handleCommandsChange = (stepIndex: number, value: string) => {
    setCommandTexts(prev => ({ ...prev, [stepIndex]: value }));
  };

  const handleCommandsBlur = (stepIndex: number) => {
    const textValue =
      commandTexts[stepIndex] ?? steps[stepIndex]?.commands?.join('\n') ?? '';

    const commands = textValue
      .split('\n')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0);

    const updatedSteps = [...steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      commands,
    };
    setSteps(updatedSteps);
    onChange(updatedSteps);
  };

  const handleAddStep = () => {
    const selectedStepTypes = new Set<string>();
    for (const step of steps) {
      const stepType = step.stepType || defaultStepType;
      if (stepType) {
        selectedStepTypes.add(stepType);
      }
    }

    let newStepType = defaultStepType;
    for (const stepType of stepTypeEnum) {
      if (!selectedStepTypes.has(stepType)) {
        newStepType = stepType;
        break;
      }
    }

    const newStep: BuildStep = {
      stepType: newStepType,
      commands: [],
    };
    const newIndex = steps.length;
    const updatedSteps = [...steps, newStep];
    setSteps(updatedSteps);
    onChange(updatedSteps);
    setCommandTexts(prev => ({ ...prev, [newIndex]: '' }));
    setExpandedSteps(new Set([newIndex]));
  };

  const handleRemoveStep = (index: number) => {
    const updatedSteps = steps.filter((_, i) => i !== index);
    setSteps(updatedSteps);
    onChange(updatedSteps);

    const newExpanded = new Set<number>();
    for (const expandedIndex of expandedSteps) {
      if (expandedIndex < index) {
        newExpanded.add(expandedIndex);
      } else if (expandedIndex > index) {
        newExpanded.add(expandedIndex - 1);
      }
    }
    setExpandedSteps(newExpanded);

    const newCommandTexts = { ...commandTexts };
    delete newCommandTexts[index];
    const reindexed: { [key: number]: string } = {};
    for (const key of Object.keys(newCommandTexts)) {
      const oldIndex = Number.parseInt(key, 10);
      if (oldIndex < index) {
        reindexed[oldIndex] = newCommandTexts[oldIndex];
      } else if (oldIndex > index) {
        reindexed[oldIndex - 1] = newCommandTexts[oldIndex];
      }
    }
    setCommandTexts(reindexed);
  };

  const handleToggleExpand = (index: number, event?: ChangeEvent<{}>) => {
    if (event) {
      event.stopPropagation();
    }
    setExpandedSteps(prevExpanded => {
      const newExpanded = new Set(prevExpanded);
      if (newExpanded.has(index)) {
        newExpanded.delete(index);
      } else {
        newExpanded.add(index);
      }
      return newExpanded;
    });
  };

  const getStepTypeDisplayName = (stepType: string) => {
    const enumIndex = stepTypeEnum.indexOf(stepType);
    return enumIndex >= 0 && stepTypeEnumNames[enumIndex]
      ? stepTypeEnumNames[enumIndex]
      : stepType;
  };

  const getAvailableStepTypes = (currentStepIndex: number): string[] => {
    const selectedStepTypes = new Set<string>();
    for (const [index, step] of steps.entries()) {
      if (index !== currentStepIndex) {
        const stepType = step.stepType || defaultStepType;
        if (stepType) {
          selectedStepTypes.add(stepType);
        }
      }
    }

    const currentStepType =
      steps[currentStepIndex]?.stepType || defaultStepType;

    const availableTypes = stepTypeEnum.filter((stepType: string) => {
      if (stepType === currentStepType) {
        return true;
      }
      return !selectedStepTypes.has(stepType);
    });

    return availableTypes.length > 0 ? availableTypes : [currentStepType];
  };

  return (
    <Box>
      <Typography className={classes.title}>{customTitle}</Typography>

      {steps.map((step, index) => {
        const availableStepTypes = getAvailableStepTypes(index);
        return (
          <Accordion
            key={`build-step-${index}-${step.stepType || defaultStepType}`}
            expanded={expandedSteps.has(index)}
            onChange={event => {
              event.stopPropagation();
              handleToggleExpand(index, event);
            }}
            className={classes.stepAccordion}
            disabled={disabled}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              className={classes.accordionSummary}
              classes={{ content: classes.accordionSummaryContent }}
            >
              <Box className={classes.stepTitleContainer}>
                <Typography className={classes.stepTitle}>
                  Build Step {index + 1}
                </Typography>
                <Typography className={classes.stepTypeSubtitle}>
                  {getStepTypeDisplayName(step.stepType)}
                </Typography>
              </Box>
              <IconButton
                className={classes.deleteButton}
                size="small"
                onClick={e => {
                  e.stopPropagation();
                  handleRemoveStep(index);
                }}
                disabled={disabled}
                aria-label="Remove Build Step"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </AccordionSummary>
            <AccordionDetails className={classes.accordionDetails}>
              <FormControl className={classes.formControl} disabled={disabled}>
                <InputLabel>Step Type</InputLabel>
                <Select
                  value={step.stepType || defaultStepType}
                  onChange={event =>
                    handleStepTypeChange(index, event.target.value as string)
                  }
                  label="Step Type"
                >
                  {availableStepTypes.map((value: string) => {
                    const enumIndex = stepTypeEnum.indexOf(value);
                    return (
                      <MenuItem key={value} value={value}>
                        {enumIndex >= 0 && stepTypeEnumNames[enumIndex]
                          ? stepTypeEnumNames[enumIndex]
                          : value}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              <Box className={classes.commandsContainer}>
                <Typography variant="subtitle2" style={{ marginBottom: 8 }}>
                  Commands
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  minRows={6}
                  label="Commands"
                  placeholder="e.g., RUN dnf update&#10;RUN yum install -y git"
                  value={commandTexts[index] ?? step.commands?.join('\n') ?? ''}
                  onChange={event => {
                    handleCommandsChange(index, event.target.value);
                  }}
                  onBlur={() => handleCommandsBlur(index)}
                  className={classes.commandInput}
                  helperText="Enter commands, one per line"
                  disabled={disabled}
                  variant="outlined"
                />
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}

      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={handleAddStep}
        disabled={disabled}
        className={classes.addButton}
      >
        Add Build Step
      </Button>

      {rawErrors.length > 0 && (
        <Typography
          color="error"
          variant="caption"
          style={{ marginTop: '8px', display: 'block' }}
        >
          {rawErrors.join(', ')}
        </Typography>
      )}
    </Box>
  );
};
