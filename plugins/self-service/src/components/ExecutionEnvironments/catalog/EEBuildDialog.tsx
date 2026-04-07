import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useNotifications } from '../../notifications';
import { eeBuildApiRef, type EEBuildRegistryType } from '../../../apis';
import { normalizePahRegistryUrlForBuild } from './helpers';

const useStyles = makeStyles(theme => ({
  field: {
    marginBottom: theme.spacing(2),
  },
}));

export type EEBuildDialogProps = Readonly<{
  open: boolean;
  entity: Entity | null;
  onClose: () => void;
}>;

export function EEBuildDialog({ open, entity, onClose }: EEBuildDialogProps) {
  const classes = useStyles();
  const configApi = useApi(configApiRef);
  const eeBuildApi = useApi(eeBuildApiRef);
  const { showNotification } = useNotifications();

  const [registryType, setRegistryType] = useState<EEBuildRegistryType>('pah');
  const [customRegistryUrl, setCustomRegistryUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [imageTag, setImageTag] = useState('latest');
  const [verifyTls, setVerifyTls] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && entity?.metadata?.name) {
      setRegistryType('pah');
      setCustomRegistryUrl('');
      setImageName('');
      setImageTag('latest');
      setVerifyTls(true);
    }
  }, [open, entity?.metadata?.name]);

  const handleSubmit = async () => {
    if (!entity?.metadata?.name) return;
    const trimmedName = imageName.trim();
    const trimmedTag = imageTag.trim();
    const trimmedCustom = customRegistryUrl.trim();

    if (!trimmedName) {
      showNotification({
        title: 'Cannot build',
        description: 'Image name is required.',
        severity: 'warning',
      });
      return;
    }
    if (!trimmedTag) {
      showNotification({
        title: 'Cannot build',
        description: 'Image tag is required.',
        severity: 'warning',
      });
      return;
    }
    const pahBaseUrl =
      configApi.getOptionalString('ansible.rhaap.baseUrl')?.trim() ?? '';

    const resolvedRegistryUrl =
      registryType === 'pah'
        ? normalizePahRegistryUrlForBuild(pahBaseUrl)
        : trimmedCustom;

    if (!resolvedRegistryUrl) {
      showNotification({
        title: 'Cannot build',
        description:
          registryType === 'pah'
            ? 'PAH registry URL is not configured. Set ansible.rhaap.baseUrl in app-config.'
            : 'Custom registry URL is required when using a custom registry.',
        severity: 'warning',
      });
      return;
    }

    const entityRef = stringifyEntityRef({
      kind: entity.kind,
      namespace: entity.metadata.namespace,
      name: entity.metadata.name,
    });

    setSubmitting(true);
    try {
      const result = await eeBuildApi.triggerBuild({
        entityRef,
        registryType,
        customRegistryUrl: resolvedRegistryUrl,
        imageName: trimmedName,
        imageTag: trimmedTag,
        verifyTls,
      });
      if (result.accepted) {
        showNotification({
          title: 'Build triggered',
          description: result.workflowId
            ? `Build workflow id: ${result.workflowId}`
            : undefined,
          severity: 'success',
        });
        onClose();
      } else {
        showNotification({
          title: 'Build failed',
          description:
            result.message || 'The catalog build API may not be deployed yet.',
          severity: 'error',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Build execution environment image</DialogTitle>
      <DialogContent>
        <Typography
          variant="body2"
          color="textSecondary"
          className={classes.field}
        >
          Registry and image settings for pushing the image built from{' '}
          <strong>{entity?.metadata?.name ?? 'this definition'}</strong>.
        </Typography>

        <FormControl variant="outlined" fullWidth className={classes.field}>
          <InputLabel id="ee-build-registry-label">Registry</InputLabel>
          <Select
            labelId="ee-build-registry-label"
            id="ee-build-registry-select"
            data-testid="ee-build-registry-select"
            value={registryType}
            onChange={e =>
              setRegistryType(e.target.value as EEBuildRegistryType)
            }
            label="Registry"
          >
            <MenuItem value="pah">Private Automation Hub (PAH)</MenuItem>
            <MenuItem value="custom">Custom registry</MenuItem>
          </Select>
          <FormHelperText>
            Container registry to push the built EE image to. PAH uses
            ansible.rhaap.baseUrl from app-config. For custom, enter the URL
            below.
          </FormHelperText>
        </FormControl>

        {registryType === 'custom' && (
          <TextField
            className={classes.field}
            fullWidth
            label="Custom registry URL"
            value={customRegistryUrl}
            onChange={e => setCustomRegistryUrl(e.target.value)}
            placeholder="registry.example.com"
            variant="outlined"
            margin="normal"
            inputProps={{ 'data-testid': 'ee-build-custom-registry-url' }}
          />
        )}

        <TextField
          className={classes.field}
          fullWidth
          label="Image name"
          value={imageName}
          onChange={e => setImageName(e.target.value)}
          inputProps={{ 'data-testid': 'ee-build-image-name' }}
          helperText="Name for the built Execution Environment image in namespace/name format. For example, 'my-namespace/my-custom-ee'."
          variant="outlined"
          margin="normal"
        />

        <TextField
          className={classes.field}
          fullWidth
          label="Image tag"
          value={imageTag}
          onChange={e => setImageTag(e.target.value)}
          inputProps={{ 'data-testid': 'ee-build-image-tag' }}
          helperText="Tag for the built Execution Environment image."
          variant="outlined"
          margin="normal"
        />

        <FormControlLabel
          control={
            <Checkbox
              color="primary"
              checked={verifyTls}
              onChange={e => setVerifyTls(e.target.checked)}
            />
          }
          label="Verify TLS certificates"
        />
        <Typography variant="caption" display="block" color="textSecondary">
          Verify TLS certificates when interacting with container registries.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary" disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={() => handleSubmit()}
          color="primary"
          variant="contained"
          disabled={submitting}
          startIcon={
            submitting ? <CircularProgress size={18} color="inherit" /> : null
          }
        >
          Build
        </Button>
      </DialogActions>
    </Dialog>
  );
}
