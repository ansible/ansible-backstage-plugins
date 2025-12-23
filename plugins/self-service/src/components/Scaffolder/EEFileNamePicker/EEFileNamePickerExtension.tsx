import { useState, useEffect, useCallback } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import {
  TextField,
  Typography,
  Box,
  CircularProgress,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { makeStyles } from '@material-ui/core/styles';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import WarningIcon from '@material-ui/icons/Warning';

const useStyles = makeStyles(theme => ({
  container: {
    width: '100%',
  },
  warningBox: {
    marginTop: theme.spacing(1),
  },
  loadingBox: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  errorBox: {
    marginTop: theme.spacing(1),
  },
}));

/**
 * Validate entity name according to Backstage catalog rules:
 * - Length: 1-63 characters
 * - Must consist of sequences of [a-z0-9A-Z] possibly separated by one of [-_.]
 * - Cannot start or end with a separator (eg. -abc, abc_)
 * - Cannot have consecutive separators (eg. abc.-abc)
 */
const isValidEntityName = (
  name: string,
): { valid: boolean; error?: string } => {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Name is required' };
  }

  const trimmedName = name.trim();

  if (trimmedName.length < 1) {
    return { valid: false, error: 'Name must be at least 1 character long' };
  }

  if (trimmedName.length > 63) {
    return { valid: false, error: 'Name must be at most 63 characters long' };
  }

  if (/^[-_.]/.test(trimmedName)) {
    return {
      valid: false,
      error: 'Name cannot start with a hyphen, underscore, or dot',
    };
  }

  if (/[-_.]$/.test(trimmedName)) {
    return {
      valid: false,
      error: 'Name cannot end with a hyphen, underscore, or dot',
    };
  }

  if (/[-_.]{2,}/.test(trimmedName)) {
    return {
      valid: false,
      error: 'Name cannot contain consecutive hyphens, underscores, or dots',
    };
  }

  const validPattern = /^[a-z0-9A-Z]+([-_.][a-z0-9A-Z]+)*$/;
  if (!validPattern.test(trimmedName)) {
    return {
      valid: false,
      error:
        'Name must consist of alphanumeric characters [a-z0-9A-Z] separated by hyphens, underscores, or dots',
    };
  }

  if (
    trimmedName.toLowerCase().endsWith('.yaml') ||
    trimmedName.toLowerCase().endsWith('.yml')
  ) {
    return {
      valid: false,
      error:
        'Name should not end with .yaml or .yml. A .yaml extension will automatically be added to the generated EE definition file name.',
    };
  }

  return { valid: true };
};

export const EEFileNamePickerExtension = ({
  onChange,
  required,
  disabled,
  rawErrors = [],
  schema,
  formData,
}: FieldExtensionComponentProps<string>) => {
  const classes = useStyles();
  const catalogApi = useApi(catalogApiRef);
  const [existingEntity, setExistingEntity] = useState<Entity | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [formatError, setFormatError] = useState<string | null>(null);

  const checkEntityExists = useCallback(
    async (fileName: string) => {
      if (!fileName || fileName.trim().length === 0) {
        setExistingEntity(null);
        setCheckError(null);
        return;
      }

      const validation = isValidEntityName(fileName);
      if (!validation.valid) {
        setFormatError(validation.error || null);
        setExistingEntity(null);
        setCheckError(null);
        setIsChecking(false);
        return;
      }

      setFormatError(null);
      setIsChecking(true);
      setCheckError(null);

      try {
        const entityRef = `Component:default/${fileName.trim()}`;
        const entity = await catalogApi.getEntityByRef(entityRef);

        if (
          entity?.kind === 'Component' &&
          entity?.spec?.type === 'execution-environment'
        ) {
          setExistingEntity(entity);
        } else {
          setExistingEntity(null);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const isNotFoundError =
          errorMessage.toLowerCase().includes('not found') ||
          errorMessage.toLowerCase().includes('404');

        if (isNotFoundError) {
          setExistingEntity(null);
          setCheckError(null);
        } else {
          setCheckError(
            error instanceof Error
              ? error.message
              : 'Failed to check if entity exists in catalog',
          );
          setExistingEntity(null);
        }
      } finally {
        setIsChecking(false);
      }
    },
    [catalogApi],
  );

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    if (formData) {
      const validation = isValidEntityName(formData);
      if (!validation.valid) {
        setFormatError(validation.error || null);
        setExistingEntity(null);
        setCheckError(null);
        setIsChecking(false);
      } else {
        setFormatError(null);
        timeoutId = setTimeout(() => {
          checkEntityExists(formData);
        }, 500);
      }
    } else {
      setFormatError(null);
      setExistingEntity(null);
      setCheckError(null);
      setIsChecking(false);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [formData, checkEntityExists]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onChange(value);
  };

  const customTitle = schema?.title || 'EE File Name';

  const hasError = rawErrors.length > 0 || formatError !== null;

  return (
    <Box className={classes.container}>
      <TextField
        label={customTitle}
        value={formData || ''}
        onChange={handleChange}
        required={required}
        disabled={disabled}
        error={hasError}
        fullWidth
        margin="normal"
        variant="outlined"
      />

      {isChecking && !formatError && (
        <Box className={classes.loadingBox}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="textSecondary">
            Checking catalog...
          </Typography>
        </Box>
      )}

      {checkError && !formatError && (
        <Alert severity="warning" className={classes.warningBox}>
          {checkError}
        </Alert>
      )}

      {formatError && (
        <Alert severity="error" className={classes.errorBox}>
          {formatError}
        </Alert>
      )}

      {existingEntity && !isChecking && !formatError && (
        <Alert
          severity="warning"
          icon={<WarningIcon />}
          className={classes.warningBox}
        >
          <Typography variant="body2" component="div">
            <strong>Warning:</strong> An execution environment definition with
            the name "{existingEntity.metadata.name}" already exists in the
            catalog.
            <br />
            If you proceed, your existing definition will be updated with the
            new information.
          </Typography>
        </Alert>
      )}
    </Box>
  );
};
