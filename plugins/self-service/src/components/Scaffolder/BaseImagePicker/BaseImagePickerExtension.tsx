import { ChangeEvent } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import {
  FormControl,
  RadioGroup,
  Radio,
  Typography,
  Box,
  Chip,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import AccessTimeIcon from '@material-ui/icons/AccessTime';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { parseMarkdownLinks } from '../utils/parseMarkdownLinks';

const useStyles = makeStyles(theme => ({
  title: {
    fontSize: '1.5rem',
    fontWeight: 500,
    marginBottom: theme.spacing(1),
    color: theme.palette.text.primary,
  },
  description: {
    fontSize: '0.875rem',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(3),
    lineHeight: 1.5,
  },
  optionValue: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
    lineHeight: 1.3,
  },
  optionContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing(3),
  },
  optionTextWrapper: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: theme.spacing(1),
    gap: theme.spacing(1),
  },
  optionTextColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
  },
  tag: {
    fontSize: '0.7rem',
    height: '20px',
  },
}));

export const BaseImagePickerExtension = ({
  onChange,
  required,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
}: FieldExtensionComponentProps<string>) => {
  const classes = useStyles();

  const customTitle =
    uiSchema?.['ui:options']?.title || schema?.title || 'Base Image';
  const customDescription =
    uiSchema?.['ui:options']?.description || schema?.description;

  const enumValues = schema?.enum || [];
  const enumNames = schema?.enumNames || [];
  const enumDescriptions = schema?.enumDescriptions || [];

  const baseImageOptions = enumValues.map((value, index) => ({
    value: value as string,
    label: enumNames[index] || (value as string),
    description: enumDescriptions[index] || '',
  }));

  const handleOptionChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onChange(value);
  };

  const isValidRedHatRegistry = (value: string): boolean => {
    try {
      const parts = value.split('/');
      if (parts.length === 0) {
        return false;
      }
      const registryPart = parts[0];
      const hostname = registryPart.split(':')[0];
      return hostname === 'redhat.io' || hostname.endsWith('.redhat.io');
    } catch {
      return false;
    }
  };

  const getImageTags = (value: string) => {
    const tags = [];

    if (value.includes('python')) {
      tags.push({
        label: 'Fast start',
        icon: (
          <AccessTimeIcon style={{ fontSize: '0.8rem', color: '#252323ff' }} />
        ),
        color: 'default' as const,
        variant: 'outlined' as const,
        backgroundColor: '#81c784',
        borderColor: '#81c784',
        textColor: '#252323ff',
      });
    }

    if (value.includes('rhel') || isValidRedHatRegistry(value)) {
      tags.push(
        {
          label: 'Subscription',
          icon: undefined,
          color: 'default' as const,
          variant: 'outlined' as const,
        },
        {
          label: 'Recommended',
          icon: (
            <CheckCircleIcon
              style={{
                fontSize: '0.8rem',
                color: '#81c784',
              }}
            />
          ),
          color: 'default' as const,
          variant: 'outlined' as const,
          borderColor: '#81c784',
        },
      );
    }

    return tags;
  };

  return (
    <Box>
      <Typography className={classes.title}>{customTitle}</Typography>

      {customDescription && (
        <Typography className={classes.description} component="div">
          {parseMarkdownLinks(customDescription)}
        </Typography>
      )}

      <FormControl
        component="fieldset"
        required={required}
        error={rawErrors.length > 0}
      >
        <RadioGroup value={formData || ''} onChange={handleOptionChange}>
          {baseImageOptions.map(option => (
            <Box key={option.value} className={classes.optionContainer}>
              <Radio
                value={option.value}
                checked={formData === option.value}
                onChange={handleOptionChange}
                disabled={disabled}
              />
              <Box className={classes.optionTextWrapper}>
                <Box className={classes.optionTextColumn}>
                  <Typography variant="body2">{option.label}</Typography>
                  <Typography className={classes.optionValue}>
                    {option.value === 'custom'
                      ? 'Add custom base image'
                      : option.value}
                  </Typography>
                </Box>
                <Box className={classes.tagsContainer}>
                  {getImageTags(option.value).map(tag => (
                    <Chip
                      key={tag.label}
                      icon={tag.icon}
                      label={tag.label}
                      color={tag.color}
                      variant={tag.variant}
                      size="small"
                      className={classes.tag}
                      style={{
                        ...(tag.borderColor
                          ? { borderColor: tag.borderColor }
                          : {}),
                        ...(tag.backgroundColor
                          ? { backgroundColor: tag.backgroundColor }
                          : {}),
                        ...(tag.textColor ? { color: tag.textColor } : {}),
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Box>
          ))}
        </RadioGroup>
      </FormControl>

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
