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
  const [nameError, setNameError] = useState<string>('');

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
    () => (): Record<string, string> => {
      const initialState: Record<string, string> = {};
      for (const fieldName of fieldNames) {
        initialState[fieldName] = '';
      }
      return initialState;
    },
    [fieldNames],
  );

  const [newCollection, setNewCollection] = useState<Record<string, string>>(
    getInitialCollectionState,
  );

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
      }

      return {
        title: fieldSchema.title || defaultTitle,
        description: fieldSchema.description || defaultDescription,
        placeholder:
          fieldSchema['ui:placeholder'] ||
          fieldSchema.ui?.placeholder ||
          defaultPlaceholder,
        pattern: fieldSchema.pattern,
        required: itemsSchema?.required?.includes(fieldName) || false,
        enum: fieldSchema.enum || null,
        enumNames: fieldSchema.enumNames || null,
      };
    },
    [properties, itemsSchema?.required],
  );

  const namePatternString =
    properties?.name?.pattern || String.raw`^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$`;
  const collectionNamePattern = new RegExp(namePatternString);

  useEffect(() => {
    if (formData !== undefined) {
      setCollections(formData);
    }
  }, [formData]);

  useEffect(() => {
    if (!isDialogOpen) {
      setNewCollection(getInitialCollectionState());
      setNameError('');
    }
  }, [isDialogOpen, getInitialCollectionState]);

  const validateCollectionName = (name: string): boolean => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Collection name is required');
      return false;
    }
    if (!collectionNamePattern.test(trimmedName)) {
      setNameError(
        'Collection name must be in namespace.collection format (e.g., community.general)',
      );
      return false;
    }
    setNameError('');
    return true;
  };

  const handleAddCollection = () => {
    const trimmedName = newCollection.name?.trim() || '';
    if (trimmedName && validateCollectionName(trimmedName)) {
      const collectionToAdd: CollectionItem = {} as CollectionItem;
      for (const fieldName of fieldNames) {
        const value = newCollection[fieldName]?.trim();
        if (
          value ||
          (fieldName === 'version' && newCollection[fieldName] !== undefined)
        ) {
          (collectionToAdd as any)[fieldName] = value || '';
        }
      }
      (collectionToAdd as any).name = trimmedName;

      const updatedCollections = [...collections, collectionToAdd];
      setCollections(updatedCollections);
      onChange(updatedCollections);
      setNewCollection(getInitialCollectionState());
      setNameError('');
      setIsDialogOpen(false);
    }
  };

  const handleRemoveCollection = (index: number) => {
    const updatedCollections = collections.filter((_, i) => i !== index);
    setCollections(updatedCollections);
    onChange(updatedCollections);
  };

  const handleFieldChange =
    (fieldName: string) =>
    (event: ChangeEvent<{ name?: string; value: unknown }>) => {
      const value = event.target.value as string;
      setNewCollection({ ...newCollection, [fieldName]: value });

      if (fieldName === 'name') {
        if (value.trim()) {
          validateCollectionName(value);
        } else {
          setNameError('');
        }
      }
    };

  const openDialog = () => {
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setNewCollection(getInitialCollectionState());
    setNameError('');
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
        onClick={openDialog}
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
              <Chip
                key={chipKey}
                label={displayLabel}
                onDelete={() => handleRemoveCollection(index)}
                deleteIcon={<CloseIcon />}
                disabled={disabled}
                color="primary"
                variant="outlined"
                className={classes.collectionChip}
              />
            );
          })}
        </Box>
      )}

      <Dialog open={isDialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Add New Collection
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
            const isNameField = fieldName === 'name';
            const hasEnum =
              fieldMeta.enum &&
              Array.isArray(fieldMeta.enum) &&
              fieldMeta.enum.length > 0;

            if (hasEnum) {
              return (
                <FormControl
                  key={fieldName}
                  fullWidth
                  className={classes.inputField}
                  required={fieldMeta.required}
                >
                  <InputLabel>{fieldMeta.title}</InputLabel>
                  <Select
                    value={newCollection[fieldName] || ''}
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
                  {fieldMeta.description && (
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
                value={newCollection[fieldName] || ''}
                onChange={handleFieldChange(fieldName)}
                className={classes.inputField}
                helperText={
                  isNameField
                    ? nameError || fieldMeta.description
                    : fieldMeta.description
                }
                error={isNameField && !!nameError}
                required={fieldMeta.required}
                disabled={disabled}
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
            disabled={!newCollection.name?.trim() || !!nameError}
          >
            Add Collection
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
