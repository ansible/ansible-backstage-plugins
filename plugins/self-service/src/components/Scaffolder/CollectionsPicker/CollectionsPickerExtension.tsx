import { useState, useEffect, useMemo, useCallback } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import {
  Button,
  TextField,
  Typography,
  Box,
  Chip,
  Card,
  CardContent,
  IconButton,
  CircularProgress,
} from '@material-ui/core';
import { useTheme } from '@material-ui/core/styles';
import { makeStyles } from '@material-ui/core/styles';
import Autocomplete from '@material-ui/lab/Autocomplete';
import AddIcon from '@material-ui/icons/Add';
import CloseIcon from '@material-ui/icons/Close';
import DeleteIcon from '@material-ui/icons/Delete';
import { CollectionItem } from './types';
import { useApi } from '@backstage/core-plugin-api';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { rhAapAuthApiRef } from '../../../apis';

const useStyles = makeStyles(theme => ({
  title: {
    fontSize: '1.2rem',
    fontWeight: 500,
    marginBottom: theme.spacing(1),
    color: theme.palette.text.primary,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  stepBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  description: {
    fontSize: '0.875rem',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(3),
    lineHeight: 1.5,
  },
  addCollectionCard: {
    marginBottom: theme.spacing(3),
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[1],
  },
  cardTitle: {
    fontSize: '1rem',
    fontWeight: 500,
    marginBottom: theme.spacing(2),
    color: theme.palette.text.primary,
  },
  inputField: {
    marginBottom: theme.spacing(2),
  },
  addCollectionButton: {
    width: '100%',
    marginTop: theme.spacing(1),
    padding: theme.spacing(1.5),
    textTransform: 'none',
    fontSize: '1rem',
  },
  selectedCollectionsSection: {
    marginTop: theme.spacing(3),
  },
  selectedCollectionsTitle: {
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: theme.spacing(1),
    color: theme.palette.text.primary,
  },
  collectionsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  collectionChip: {
    marginBottom: theme.spacing(0.5),
  },
  collectionChipWrapper: {
    display: 'inline-block',
    cursor: 'pointer',
  },
  signatureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  addStringButton: {
    marginTop: theme.spacing(1),
    textTransform: 'none',
  },
  helperText: {
    marginTop: theme.spacing(0.5),
    fontSize: '0.75rem',
  },
}));

export const CollectionsPickerExtension = ({
  onChange,
  disabled,
  rawErrors = [],
  schema,
  formData,
}: FieldExtensionComponentProps<CollectionItem[]>) => {
  const classes = useStyles();
  const theme = useTheme();

  const [collections, setCollections] = useState<CollectionItem[] | any[]>(
    formData || [],
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Autocomplete states
  const [availableCollections, setAvailableCollections] = useState<any[]>([]);
  const [availableSources, setAvailableSources] = useState<any[]>([]);
  const [availableVersions, setAvailableVersions] = useState<any[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Form state
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<string[]>(['']);

  const aapAuth = useApi(rhAapAuthApiRef);
  const scaffolderApi = useApi(scaffolderApiRef);
  const itemsSchema = schema?.items as any;
  const properties = useMemo(
    () => itemsSchema?.properties || {},
    [itemsSchema?.properties],
  );

  // Fetch collections for autocomplete
  const fetchCollections = useCallback(async () => {
    try {
      setLoadingCollections(true);
      const token = await aapAuth.getAccessToken();
      if (scaffolderApi.autocomplete) {
        const { results } = await scaffolderApi.autocomplete({
          token,
          resource: 'collections',
          provider: 'aap-api-cloud',
          context: {
            searchQuery: 'spec.type=ansible-collection',
          },
        });

        // Process results to extract unique collections with their versions and sources
        const processedCollections = results || [];
        setAvailableCollections(processedCollections);
        console.log('collections', processedCollections);
      }
    } catch (error) {
      console.error('Error fetching collections:', error);
      setAvailableCollections([]);
    } finally {
      setLoadingCollections(false);
    }
  }, [aapAuth, scaffolderApi]);

  // Fetch sources when collection is selected
  const fetchSources = useCallback(
    async (collectionName: string) => {
      if (!collectionName) {
        setAvailableSources([]);
        return;
      }

      // Find the selected collection from availableCollections
      const selectedCollection = availableCollections.find(
        (col: any) => col.name === collectionName,
      );

      if (
        selectedCollection &&
        selectedCollection.sources &&
        selectedCollection.sources.length > 0
      ) {
        // Use sources from the collection data
        setAvailableSources(
          selectedCollection.sources.map((source: string) => ({
            name: source,
            id: source,
          })),
        );
      } else {
        // Fallback to API call if sources not available
        try {
          setLoadingSources(true);
          const token = await aapAuth.getAccessToken();
          if (scaffolderApi.autocomplete) {
            const { results } = await scaffolderApi.autocomplete({
              token,
              resource: 'collection_sources',
              provider: 'aap-api-cloud',
              context: { collection: collectionName },
            });
            setAvailableSources(results || []);
          }
        } catch (error) {
          console.error('Error fetching sources:', error);
          setAvailableSources([]);
        } finally {
          setLoadingSources(false);
        }
      }
    },
    [aapAuth, scaffolderApi, availableCollections],
  );

  // Fetch versions when source is selected
  const fetchVersions = useCallback(
    async (collectionName: string, sourceId: string) => {
      if (!collectionName || !sourceId) {
        setAvailableVersions([]);
        return;
      }
      // Find the selected collection from availableCollections
      const selectedCollection = availableCollections.find(
        (col: any) => col.name === collectionName,
      );

      if (
        selectedCollection &&
        selectedCollection.sourceVersions &&
        selectedCollection.sourceVersions[sourceId]
      ) {
        // Get versions for the specific source
        const sourceVersions =
          selectedCollection.sourceVersions[sourceId] || [];
        setAvailableVersions(
          sourceVersions.map((version: string) => ({
            name: version,
            version: version,
          })),
        );
      } else if (
        selectedCollection &&
        selectedCollection.versions &&
        selectedCollection.versions.length > 0
      ) {
        // Fallback: show all versions if source-version mapping not available
        setAvailableVersions(
          selectedCollection.versions.map((version: string) => ({
            name: version,
            version: version,
          })),
        );
      } else {
        // Fallback to API call
        try {
          setLoadingVersions(true);
          const token = await aapAuth.getAccessToken();
          if (scaffolderApi.autocomplete) {
            const { results } = await scaffolderApi.autocomplete({
              token,
              resource: 'collection_versions',
              provider: 'aap-api-cloud',
              context: { collection: collectionName, source: sourceId },
            });
            setAvailableVersions(results || []);
          }
        } catch (error) {
          console.error('Error fetching versions:', error);
          setAvailableVersions([]);
        } finally {
          setLoadingVersions(false);
        }
      }
    },
    [aapAuth, scaffolderApi, availableCollections],
  );
  useEffect(() => {
    if (formData !== undefined) {
      setCollections(formData);
    }
  }, [formData]);

  // Load collections on mount
  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  // Load sources when collection changes
  useEffect(() => {
    if (selectedCollection) {
      fetchSources(selectedCollection);
      setSelectedSource(null);
      setSelectedVersion(null);
      setAvailableVersions([]);
    } else {
      setAvailableSources([]);
      setAvailableVersions([]);
    }
  }, [selectedCollection, fetchSources]);

  useEffect(() => {
    if (selectedCollection && selectedSource) {
      fetchVersions(selectedCollection, selectedSource);
      setSelectedVersion(null);
    } else {
      setAvailableVersions([]);
    }
  }, [selectedCollection, selectedSource, fetchVersions]);

  const handleAddCollection = () => {
    if (!selectedCollection || !selectedCollection.trim()) {
      return;
    }

    const collectionToAdd: CollectionItem = {
      name: selectedCollection.trim(),
    };

    if (selectedSource) {
      collectionToAdd.source = selectedSource;
    }

    if (selectedVersion) {
      collectionToAdd.version = selectedVersion;
    }

    // Check if collection already exists
    const existingIndex = collections?.findIndex(
      c => c.name === collectionToAdd.name,
    );

    let updatedCollections: CollectionItem[];

    if (existingIndex !== -1) {
      updatedCollections = [...collections];
      updatedCollections[existingIndex] = collectionToAdd;
    } else {
      updatedCollections = [...collections, collectionToAdd];
    }

    setCollections(updatedCollections);
    onChange(updatedCollections);

    setSelectedCollection(null);
    setSelectedSource(null);
    setSelectedVersion(null);
    setSignatures(['']);
    setFieldErrors({});
    setEditingIndex(null);
  };

  const handleRemoveCollection = (index: number) => {
    const updatedCollections = collections.filter((_, i) => i !== index);
    setCollections(updatedCollections);
    onChange(updatedCollections);
  };

  const handleEditCollection = (index: number) => {
    const collection = collections[index];
    setSelectedCollection(collection.name || null);
    setSelectedSource(collection.source || null);
    setSelectedVersion(collection.version || null);
    setSignatures(
      collection.signatures && collection.signatures.length > 0
        ? collection.signatures
        : [''],
    );
    setEditingIndex(index);
  };

  const handleSignatureChange = (index: number, value: string) => {
    const newSignatures = [...signatures];
    newSignatures[index] = value;
    setSignatures(newSignatures);
  };

  const handleAddSignature = () => {
    setSignatures([...signatures, '']);
  };

  const handleRemoveSignature = (index: number) => {
    if (signatures.length > 1) {
      const newSignatures = signatures.filter((_, i) => i !== index);
      setSignatures(newSignatures);
    }
  };

  const isAddButtonDisabled =
    !selectedCollection || !selectedCollection.trim() || disabled;

  const handleCollectionChange = (event: any, newValue: any) => {
    console.log('newValue', newValue);
    const value =
      typeof newValue === 'string'
        ? newValue
        : newValue?.name || newValue?.label || null;
    setSelectedCollection(value);
    setSelectedSource(null);
    setAvailableSources(newValue?.sources || []);
    setAvailableVersions(newValue?.versions || []);
    setSelectedVersion(null);
    setFieldErrors({});
  };

  return (
    <Box>
      <Card className={classes.addCollectionCard}>
        <CardContent>
          <Typography className={classes.cardTitle}>Add collection</Typography>

          {/* Collection Autocomplete */}
          <Autocomplete
            options={availableCollections}
            getOptionLabel={option => {
              if (typeof option === 'string') return option;
              return option?.name || option?.label || '';
            }}
            value={
              availableCollections.find(
                (col: any) => col?.name === selectedCollection,
              ) || null
            }
            onChange={handleCollectionChange}
            loading={loadingCollections}
            disabled={disabled}
            renderInput={params => (
              <TextField
                {...params}
                label="Collection"
                placeholder="Search collection e.g., community.general"
                variant="outlined"
                className={classes.inputField}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingCollections ? (
                        <CircularProgress size={20} />
                      ) : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            noOptionsText="No collections found"
          />

          {/* Source Autocomplete */}
          <Autocomplete
            options={availableSources}
            getOptionLabel={option =>
              typeof option === 'string'
                ? option
                : option.name || option.label || ''
            }
            value={selectedSource}
            onChange={(event, newValue) => {
              const value =
                typeof newValue === 'string'
                  ? newValue
                  : newValue?.name || newValue?.label || newValue?.id || null;
              setSelectedSource(value);
            }}
            loading={loadingSources}
            disabled={disabled || !selectedCollection}
            freeSolo
            renderInput={params => (
              <TextField
                {...params}
                label="Source"
                placeholder="Select source"
                variant="outlined"
                className={classes.inputField}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingSources ? <CircularProgress size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            noOptionsText="No sources found"
          />

          {/* Version Autocomplete */}
          <Autocomplete
            options={availableVersions}
            getOptionLabel={option =>
              typeof option === 'string'
                ? option
                : option.name || option.label || option.version || ''
            }
            value={selectedVersion}
            onChange={(event, newValue) => {
              const value =
                typeof newValue === 'string'
                  ? newValue
                  : newValue?.name ||
                    newValue?.label ||
                    newValue?.version ||
                    null;
              setSelectedVersion(value);
            }}
            loading={loadingVersions}
            disabled={disabled || !selectedSource}
            freeSolo
            renderInput={params => (
              <TextField
                {...params}
                label="Version"
                placeholder="Select version"
                variant="outlined"
                className={classes.inputField}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingVersions ? <CircularProgress size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            noOptionsText="No versions found"
          />

          {/* Signatures */}
          <Box>
            <Typography
              variant="body2"
              style={{ marginBottom: theme.spacing(1) }}
            >
              Signatures
            </Typography>
            <Typography
              variant="caption"
              color="textSecondary"
              className={classes.helperText}
            >
              A list of URI paths to the signature files used to verify the
              collection's integrity. Press Enter to add each one.
            </Typography>
            {signatures.map((signature, index) => (
              <Box key={index} className={classes.signatureItem}>
                <TextField
                  fullWidth
                  placeholder="e.g., https://automation.example.com/signatures/my_collection-1.2.0.sig"
                  value={signature}
                  onChange={e => handleSignatureChange(index, e.target.value)}
                  disabled={disabled}
                  variant="outlined"
                  size="small"
                  InputProps={{
                    endAdornment: signatures.length > 1 && (
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveSignature(index)}
                        disabled={disabled}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    ),
                  }}
                />
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddSignature}
              disabled={disabled}
              className={classes.addStringButton}
              size="small"
            >
              Add string
            </Button>
          </Box>

          {/* Add Collection Button */}
          <Button
            variant="contained"
            color="primary"
            onClick={handleAddCollection}
            disabled={isAddButtonDisabled}
            className={classes.addCollectionButton}
            startIcon={<AddIcon />}
          >
            Add collection
          </Button>
        </CardContent>
      </Card>

      {/* Selected Collections Section */}
      {collections.length > 0 && (
        <Box className={classes.selectedCollectionsSection}>
          <Typography className={classes.selectedCollectionsTitle}>
            Selected collections ({collections.length})
          </Typography>
          <Box className={classes.collectionsList}>
            {collections.map((collection, index) => {
              const collectionAny = collection as any;
              const displayLabel = collectionAny.name || 'Unnamed';
              const chipKey = `${collectionAny.name || 'unnamed'}-${index}`;
              return (
                <Box
                  key={chipKey}
                  onClick={() => !disabled && handleEditCollection(index)}
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
        </Box>
      )}

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
