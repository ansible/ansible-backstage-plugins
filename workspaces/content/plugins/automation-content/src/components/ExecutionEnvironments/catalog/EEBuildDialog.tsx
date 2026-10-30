import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Link,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import {
  messageFromUnknownError,
  normalizePahRegistryUrlForBuild,
} from './helpers';
import { useNotifications } from '../../notifications';

/** Port of the prototype registry/image build form and catalog build request. */
export function EEBuildDialog({
  open,
  entity,
  scmToken,
  scmProvider,
  onClose,
}: Readonly<{
  open: boolean;
  entity: Entity | null;
  scmToken: string | null;
  scmProvider: 'github' | 'gitlab' | null;
  onClose: () => void;
}>): ReactElement {
  const configApi = useApi(configApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [registryType, setRegistryType] = useState('pah');
  const [customRegistryUrl, setCustomRegistryUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [imageTag, setImageTag] = useState('latest');
  const [verifyTls, setVerifyTls] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { showNotification } = useNotifications();
  useEffect(() => {
    if (open && entity?.metadata?.name) {
      setRegistryType('pah');
      setCustomRegistryUrl('');
      setImageName('');
      setImageTag('latest');
      setVerifyTls(true);
      setError('');
    }
  }, [open, entity?.metadata?.name]);
  const handleSubmit = async () => {
    if (!entity?.metadata?.name) return;
    const trimmedName = imageName.trim();
    const trimmedTag = imageTag.trim();
    const trimmedCustom = customRegistryUrl.trim();
    if (!trimmedName) {
      setError('Image name is required.');
      return;
    }
    if (!trimmedTag) {
      setError('Image tag is required.');
      return;
    }
    const pahBaseUrl =
      configApi.getOptionalString('ansible.rhaap.baseUrl')?.trim() ?? '';
    const resolvedRegistryUrl =
      registryType === 'pah'
        ? normalizePahRegistryUrlForBuild(pahBaseUrl)
        : trimmedCustom;
    if (!resolvedRegistryUrl) {
      setError(
        registryType === 'pah'
          ? 'PAH registry URL is not configured. Set ansible.rhaap.baseUrl in app-config.'
          : 'Custom registry URL is required when using a custom registry.',
      );
      return;
    }
    const scmTok = scmToken?.trim();
    if (!scmTok || !scmProvider) {
      setError(
        'No Git token is available. Close this dialog and use Build again to sign in to your Git host.',
      );
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const baseUrl = await discoveryApi.getBaseUrl('catalog');
      const response = await fetchApi.fetch(`${baseUrl}/ansible/ee/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [scmProvider === 'gitlab' ? 'X-Gitlab-Token' : 'X-Github-Token']:
            scmTok,
        },
        body: JSON.stringify({
          entityRef: stringifyEntityRef(entity),
          registryType,
          customRegistryUrl: resolvedRegistryUrl,
          imageName: trimmedName,
          imageTag: trimmedTag,
          verifyTls,
        }),
      });
      if (!response.ok) {
        setError(
          (await response.text()) || `Request failed (${response.status})`,
        );
        return;
      }
      const text = await response.text();
      let result: Record<string, unknown> = {};
      try {
        result = text.trim() ? JSON.parse(text) : {};
      } catch {
        /* A successful empty or plain-text response still accepts the build. */
      }
      const url =
        result.workflowUrl ??
        result.workflow_url ??
        result.pipelineUrl ??
        result.pipeline_url;
      const href =
        typeof url === 'string' && /^https?:\/\//.test(url) ? url : undefined;
      showNotification({
        title: 'Build triggered',
        description: href ? (
          <>
            Link:{' '}
            <Link href={href} target="_blank" rel="noopener noreferrer">
              {href}
            </Link>
          </>
        ) : undefined,
        severity: 'success',
      });
      onClose();
    } catch (e) {
      setError(messageFromUnknownError(e));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog
      isOpen={open}
      onOpenChange={value => !value && !submitting && onClose()}
    >
      <DialogHeader>Build execution environment image</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          <Text color="secondary">
            Registry and image settings for pushing the image built from{' '}
            <strong>{entity?.metadata?.name ?? 'this definition'}</strong>.
          </Text>
          {error && <Text role="alert">{error}</Text>}
          <Select
            label="Registry"
            data-testid="ee-build-registry-select"
            value={registryType}
            onChange={value => setRegistryType(String(value))}
            options={[
              { id: 'pah', label: 'Private Automation Hub (PAH)' },
              { id: 'custom', label: 'Custom registry' },
            ]}
          />
          <Text color="secondary">
            Container registry to push the built EE image to.
          </Text>
          {registryType === 'custom' && (
            <TextField
              label="Custom registry URL"
              value={customRegistryUrl}
              onChange={setCustomRegistryUrl}
              placeholder="registry.example.com"
              data-testid="ee-build-custom-registry-url"
            />
          )}
          <TextField
            label="Image name"
            value={imageName}
            onChange={setImageName}
            data-testid="ee-build-image-name"
          />
          <Text color="secondary">
            Name for the built Execution Environment image in namespace/name
            format. For example, 'my-namespace/my-custom-ee'.
          </Text>
          <TextField
            label="Image tag"
            value={imageTag}
            onChange={setImageTag}
            data-testid="ee-build-image-tag"
          />
          <Text color="secondary">
            Tag for the built Execution Environment image.
          </Text>
          <Checkbox isSelected={verifyTls} onChange={setVerifyTls}>
            Verify TLS certificates
          </Checkbox>
          <Text color="secondary">
            Verify TLS certificates when interacting with container registries.
          </Text>
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button onPress={onClose} variant="secondary" isDisabled={submitting}>
          Cancel
        </Button>
        <Button onPress={handleSubmit} isPending={submitting}>
          Build
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
