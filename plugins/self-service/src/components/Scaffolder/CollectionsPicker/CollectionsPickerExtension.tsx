import { ChangeEvent, useState, useEffect, useMemo } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import {
  Button,
  TextField,
  Typography,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import CloseIcon from '@material-ui/icons/Close';
import { CollectionItem } from './types';
import { parseMarkdownLinks } from '../utils/parseMarkdownLinks';

const useStyles = makeStyles(theme => ({
  title: {
    fontSize: '1.2rem',
    fontWeight: 500,
    marginBottom: theme.spacing(1),
    color: theme.palette.text.primary,
  },
  description: {
    fontSize: '0.875rem',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
    lineHeight: 1.5,
  },
  addButton: {
    width: '100%',
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1.5),
    textTransform: 'none',
    fontSize: '1rem',
  },
  collectionsList: {
    marginTop: theme.spacing(1),
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  collectionChip: {
    marginBottom: theme.spacing(0.5),
    '&:not([disabled])': {
      cursor: 'pointer !important',
      '& *': {
        cursor: 'pointer !important',
      },
    },
  },
  collectionChipWrapper: {
    display: 'inline-block',
    cursor: 'pointer',
  },
  dialogContent: {
    padding: theme.spacing(2),
  },
  inputField: {
    marginBottom: theme.spacing(2),
  },
}));

export const CollectionsPickerExtension = ({
  onChange,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
}: FieldExtensionComponentProps<CollectionItem[]>) => {
  const classes = useStyles();

  const [collections, setCollections] = useState<CollectionItem[]>(
    formData || [],
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const customTitle =
    uiSchema?.['ui:options']?.title || schema?.title || 'Ansible Collections';
  const customDescription =
    uiSchema?.['ui:options']?.description || schema?.description;

  const itemsSchema = schema?.items as any;
  const properties = useMemo(
    () => itemsSchema?.properties || {},
    [itemsSchema?.properties],
  );

  const fieldNames = useMemo(() => Object.keys(properties), [properties]);

  const getInitialCollectionState = useMemo(
    () => (): Record<string, string | string[]> => {
      const initialState: Record<string, string | string[]> = {};
      for (const fieldName of fieldNames) {
        initialState[fieldName] = '';
      }
      return initialState;
    },
    [fieldNames],
  );

  const [newCollection, setNewCollection] = useState<
    Record<string, string | string[]>
  >(getInitialCollectionState);

  const getFieldMetadata = useMemo(
    () => (fieldName: string) => {
      const fieldSchema = properties[fieldName] || {};
      let defaultTitle = fieldName;
      let defaultDescription = '';
      let defaultPlaceholder = '';

      if (fieldName === 'name') {
        defaultTitle = 'Collection Name';
        defaultDescription = 'Collection name in namespace.collection format';
        defaultPlaceholder = 'e.g., community.general';
      } else if (fieldName === 'version') {
        defaultTitle = 'Version (Optional)';
        defaultDescription = 'Specific version of the collection';
        defaultPlaceholder = 'e.g., 7.2.1';
      } else if (fieldName === 'signatures') {
        defaultPlaceholder = 'Enter values separated by newlines';
      }

      return {
        title: fieldSchema.title || defaultTitle,
        description: fieldSchema.description || defaultDescription,
        placeholder:
          fieldSchema['ui:placeholder'] ||
          fieldSchema.ui?.placeholder ||
          defaultPlaceholder,
        pattern: fieldSchema.pattern,
        type: fieldSchema.type || 'string',
        required: itemsSchema?.required?.includes(fieldName) || false,
        enum: fieldSchema.enum || null,
        enumNames: fieldSchema.enumNames || null,
      };
    },
    [properties, itemsSchema?.required],
  );

  const namePatternString = properties?.name?.pattern;
  let collectionNamePattern: RegExp;
  if (namePatternString) {
    collectionNamePattern = new RegExp(namePatternString);
  }

  useEffect(() => {
    if (formData !== undefined) {
      setCollections(formData);
    }
  }, [formData]);

  useEffect(() => {
    if (!isDialogOpen) {
      setNewCollection(getInitialCollectionState());
      setFieldErrors({});
      setEditingIndex(null);
    }
  }, [isDialogOpen, getInitialCollectionState]);

  const parseArrayValue = (value: string): string[] => {
    if (!value.trim()) return [];
    return value
      .split('\n')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  };

  const validateField = (
    fieldName: string,
    value: string | string[],
  ): string => {
    const fieldMeta = getFieldMetadata(fieldName);
    const isRequired = fieldMeta.required;
    const fieldSchema = properties[fieldName] || {};
    const fieldType = fieldSchema.type || fieldMeta.type || 'string';

    if (fieldName === 'name') {
      const trimmedName = typeof value === 'string' ? value.trim() : '';
      if (!trimmedName) {
        return 'Collection name is required';
      }
      if (collectionNamePattern && !collectionNamePattern.test(trimmedName)) {
        return 'Collection name must be in namespace.collection format (e.g., community.general)';
      }
      return '';
    }

    if (isRequired) {
      if (fieldType === 'array') {
        return '';
      }
      const stringValue =
        typeof value === 'string' ? value.trim() : String(value || '').trim();
      if (!stringValue) {
        return `${fieldMeta.title} is required`;
      }
    }

    return '';
  };

  const validateAllFields = (): boolean => {
    const errors: Record<string, string> = {};
    let hasErrors = false;

    for (const fieldName of fieldNames) {
      const fieldSchema = properties[fieldName] || {};
      const fieldType = fieldSchema.type || 'string';
      const value = newCollection[fieldName];

      let valueToValidate: string | string[] = value;
      if (fieldType === 'array') {
        valueToValidate = Array.isArray(value)
          ? value
          : parseArrayValue(value as string);
      }

      const error = validateField(fieldName, valueToValidate);
      if (error) {
        errors[fieldName] = error;
        hasErrors = true;
      }
    }

    setFieldErrors(errors);
    return !hasErrors;
  };

  const handleAddCollection = () => {
    if (!validateAllFields()) {
      return;
    }

    const collectionToAdd: CollectionItem = {} as CollectionItem;
    for (const fieldName of fieldNames) {
      const fieldSchema = properties[fieldName] || {};
      const fieldMeta = getFieldMetadata(fieldName);
      const fieldType = fieldSchema.type || 'string';
      const isRequired = fieldMeta.required;
      const value = newCollection[fieldName];

      if (fieldType === 'array') {
        const arrayValue = Array.isArray(value)
          ? value
          : parseArrayValue(value as string);
        if (arrayValue.length > 0 || isRequired) {
          (collectionToAdd as any)[fieldName] = arrayValue;
        }
      } else {
        const stringValue =
          typeof value === 'string' ? value.trim() : String(value || '');
        if (isRequired || stringValue) {
          (collectionToAdd as any)[fieldName] = stringValue;
        }
      }
    }

    const trimmedName =
      typeof newCollection.name === 'string' ? newCollection.name.trim() : '';
    (collectionToAdd as any).name = trimmedName;

    let updatedCollections: CollectionItem[];
    if (editingIndex !== null) {
      updatedCollections = [...collections];
      updatedCollections[editingIndex] = collectionToAdd;
    } else {
      updatedCollections = [...collections, collectionToAdd];
    }

    setCollections(updatedCollections);
    onChange(updatedCollections);
    setNewCollection(getInitialCollectionState());
    setFieldErrors({});
    setEditingIndex(null);
    setIsDialogOpen(false);
  };

  const handleRemoveCollection = (index: number) => {
    const updatedCollections = collections.filter((_, i) => i !== index);
    setCollections(updatedCollections);
    onChange(updatedCollections);
  };

  const handleFieldChange =
    (fieldName: string) =>
    (event: ChangeEvent<{ name?: string; value: unknown }>) => {
      const fieldSchema = properties[fieldName] || {};
      const fieldMeta = getFieldMetadata(fieldName);
      const fieldType = fieldSchema.type || fieldMeta.type || 'string';
      const rawValue = event.target.value;

      let processedValue: string | string[];
      if (fieldType === 'array') {
        processedValue = rawValue as string;
      } else {
        processedValue = rawValue as string;
      }

      setNewCollection({ ...newCollection, [fieldName]: processedValue });

      if (fieldName === 'name') {
        const trimmedValue =
          typeof processedValue === 'string' ? processedValue.trim() : '';
        if (trimmedValue) {
          const error = validateField(fieldName, processedValue);
          setFieldErrors(prev => ({
            ...prev,
            [fieldName]: error,
          }));
        } else {
          setFieldErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[fieldName];
            return newErrors;
          });
        }
      } else {
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      }
    };

  const openDialog = (index?: number) => {
    if (index !== undefined && index >= 0 && index < collections.length) {
      const collection = collections[index];
      const collectionData: Record<string, string | string[]> = {};

      for (const fieldName of fieldNames) {
        const fieldSchema = properties[fieldName] || {};
        const fieldType = fieldSchema.type || 'string';
        const value = (collection as any)[fieldName];

        if (fieldType === 'array') {
          if (Array.isArray(value)) {
            collectionData[fieldName] = value.join('\n');
          } else if (value) {
            collectionData[fieldName] = String(value);
          } else {
            collectionData[fieldName] = '';
          }
        } else {
          collectionData[fieldName] = value || '';
        }
      }

      setNewCollection(collectionData);
      setEditingIndex(index);
    } else {
      setNewCollection(getInitialCollectionState());
      setEditingIndex(null);
    }
    setFieldErrors({});
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setNewCollection(getInitialCollectionState());
    setFieldErrors({});
    setEditingIndex(null);
  };

  return (
    <Box>
      <Typography className={classes.title}>{customTitle}</Typography>

      {customDescription && (
        <Typography className={classes.description} component="div">
          {parseMarkdownLinks(customDescription)}
        </Typography>
      )}

      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => openDialog()}
        disabled={disabled}
        className={classes.addButton}
      >
        Add Collection Manually
      </Button>

      {collections.length > 0 && (
        <Box className={classes.collectionsList}>
          {collections.map((collection, index) => {
            const collectionAny = collection as any;
            const displayLabel = collectionAny.name || 'Unnamed';
            const chipKey = `${collectionAny.name || 'unnamed'}-${index}-${JSON.stringify(collectionAny)}`;
            return (
              <Box
                key={chipKey}
                onClick={() => !disabled && openDialog(index)}
                className={
                  !disabled ? classes.collectionChipWrapper : undefined
                }
                style={{ display: 'inline-block' }}
              >
                <Chip
                  label={displayLabel}
                  onDelete={e => {
                    e.stopPropagation();
                    handleRemoveCollection(index);
                  }}
                  deleteIcon={<CloseIcon />}
                  disabled={disabled}
                  color="primary"
                  variant="outlined"
                  className={classes.collectionChip}
                />
              </Box>
            );
          })}
        </Box>
      )}

      <Dialog open={isDialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingIndex !== null ? 'Edit Collection' : 'Add New Collection'}
          <IconButton
            aria-label="close"
            onClick={closeDialog}
            style={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent className={classes.dialogContent}>
          {fieldNames.map(fieldName => {
            const fieldMeta = getFieldMetadata(fieldName);
            const fieldSchema = properties[fieldName] || {};
            const fieldType = fieldSchema.type || fieldMeta.type || 'string';
            const isArrayField = fieldType === 'array';
            const hasEnum =
              fieldMeta.enum &&
              Array.isArray(fieldMeta.enum) &&
              fieldMeta.enum.length > 0;
            const fieldError = fieldErrors[fieldName] || '';
            const fieldValue = newCollection[fieldName];
            let displayValue = '';
            if (typeof fieldValue === 'string') {
              displayValue = fieldValue;
            } else if (Array.isArray(fieldValue)) {
              displayValue = fieldValue.join('\n');
            }

            if (hasEnum) {
              return (
                <FormControl
                  key={fieldName}
                  fullWidth
                  className={classes.inputField}
                  required={fieldMeta.required}
                  error={!!fieldError}
                >
                  <InputLabel>{fieldMeta.title}</InputLabel>
                  <Select
                    value={displayValue}
                    onChange={handleFieldChange(fieldName)}
                    label={fieldMeta.title}
                    disabled={disabled}
                  >
                    {fieldMeta.enum.map((enumValue: string, index: number) => {
                      const displayLabel = fieldMeta.enumNames?.[index]
                        ? fieldMeta.enumNames[index]
                        : enumValue;
                      return (
                        <MenuItem key={enumValue} value={enumValue}>
                          {displayLabel}
                        </MenuItem>
                      );
                    })}
                  </Select>
                  {fieldError && (
                    <Typography
                      variant="caption"
                      color="error"
                      style={{ marginTop: '4px' }}
                    >
                      {fieldError}
                    </Typography>
                  )}
                  {!fieldError && fieldMeta.description && (
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      style={{ marginTop: '4px' }}
                    >
                      {fieldMeta.description}
                    </Typography>
                  )}
                </FormControl>
              );
            }

            return (
              <TextField
                key={fieldName}
                fullWidth
                label={fieldMeta.title}
                placeholder={fieldMeta.placeholder}
                value={displayValue}
                onChange={handleFieldChange(fieldName)}
                className={classes.inputField}
                helperText={fieldError || fieldMeta.description}
                error={!!fieldError}
                required={fieldMeta.required}
                disabled={disabled}
                multiline={isArrayField}
                minRows={1}
              />
            );
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleAddCollection}
            variant="contained"
            color="primary"
            disabled={
              !(
                typeof newCollection.name === 'string' &&
                newCollection.name.trim()
              ) || Object.keys(fieldErrors).some(key => fieldErrors[key])
            }
          >
            {editingIndex !== null ? 'Update Collection' : 'Add Collection'}
          </Button>
        </DialogActions>
      </Dialog>

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
