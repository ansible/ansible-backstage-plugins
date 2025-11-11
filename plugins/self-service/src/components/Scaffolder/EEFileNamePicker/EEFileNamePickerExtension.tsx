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
}));

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

  const checkEntityExists = useCallback(
    async (fileName: string) => {
      if (!fileName || fileName.trim().length === 0) {
        setExistingEntity(null);
        setCheckError(null);
        return;
      }

      setIsChecking(true);
      setCheckError(null);

      try {
        const { items } = await catalogApi.getEntities({
          filter: {
            kind: 'Component',
            'spec.type': 'execution-environment',
          },
        });

        const normalizedFileName = fileName.toLowerCase().trim();
        const foundEntity = items.find(entity => {
          const entityName = entity.metadata.name?.toLowerCase() || '';
          const entityTitle = entity.metadata.title?.toLowerCase() || '';
          const specName =
            (typeof entity.spec?.name === 'string'
              ? entity.spec.name
              : ''
            )?.toLowerCase() || '';

          return (
            entityName === normalizedFileName ||
            entityTitle === normalizedFileName ||
            specName === normalizedFileName ||
            entityName.startsWith(`${normalizedFileName}-`) ||
            entityName === normalizedFileName
          );
        });

        setExistingEntity(foundEntity || null);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to check if entity exists in catalog';
        setCheckError(errorMessage);
        setExistingEntity(null);
      } finally {
        setIsChecking(false);
      }
    },
    [catalogApi],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData) {
        checkEntityExists(formData);
      } else {
        setExistingEntity(null);
        setCheckError(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData, checkEntityExists]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onChange(value);
  };

  const customTitle = schema?.title || 'EE File Name';

  return (
    <Box className={classes.container}>
      <TextField
        label={customTitle}
        value={formData || ''}
        onChange={handleChange}
        required={required}
        disabled={disabled}
        error={rawErrors.length > 0}
        fullWidth
        margin="normal"
        variant="outlined"
      />

      {isChecking && (
        <Box className={classes.loadingBox}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="textSecondary">
            Checking catalog...
          </Typography>
        </Box>
      )}

      {checkError && (
        <Alert severity="warning" className={classes.warningBox}>
          {checkError}
        </Alert>
      )}

      {existingEntity && !isChecking && (
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
