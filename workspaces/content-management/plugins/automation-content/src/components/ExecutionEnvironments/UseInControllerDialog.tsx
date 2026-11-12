import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { copyText } from '../common/clipboard';
import {
  Button,
  ButtonIcon,
  Card,
  CardBody,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Select,
  Skeleton,
  Text,
  TextField,
} from '@backstage/ui';
import { automationContentApiRef, type Registry } from '../../api';
import { sortRepositoryTagsNewestFirst } from './catalogHelpers';
import styles from './use-in-controller-dialog.module.css';

/** One AAP organization as synced into the catalog by the AAP entity provider. */
interface ControllerOrganization {
  id: number;
  name: string;
}

interface RegistryRepository {
  registry: string;
  repository: string;
}

function registryRepositoryFromReference(
  pullReference: string,
  registries: readonly Registry[],
): RegistryRepository | undefined {
  const reference = pullReference.split('@', 1)[0];
  const registryPrefixes = registries
    .map(registry => {
      try {
        const url = new URL(registry.url);
        const path = url.pathname.replace(/\/+$/, '');
        return {
          name: registry.name,
          prefix: `${url.host}${path}`,
        };
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is { name: string; prefix: string } =>
      Boolean(entry),
    )
    .sort((a, b) => b.prefix.length - a.prefix.length);

  const match = registryPrefixes.find(entry =>
    reference.startsWith(`${entry.prefix}/`),
  );
  if (match) {
    return {
      registry: match.name,
      repository: reference.slice(match.prefix.length + 1),
    };
  }

  // Keep compatibility with registries whose configured key is also the
  // pull-reference host (including simple mock references).
  const separator = reference.indexOf('/');
  if (separator <= 0 || separator === reference.length - 1) return undefined;
  const host = reference.slice(0, separator);
  const configured = registries.find(registry => registry.name === host);
  return {
    registry: configured?.name ?? host,
    repository: reference.slice(separator + 1),
  };
}

/** Review modal for the currently pending EE-in-Controller workflow. */
export function UseInControllerDialog({
  open,
  imageName,
  pullReference,
  registry,
  repository,
  selectedTag,
  onClose,
}: Readonly<{
  open: boolean;
  imageName: string;
  /** Digest-scoped source reference, used to look up repository tags. */
  pullReference: string;
  /** Configured registry key and repository; optional for existing callers. */
  registry?: string;
  repository?: string;
  /** The tag currently selected on the details page, when one is available. */
  selectedTag?: string;
  onClose: () => void;
}>): ReactElement {
  const catalog = useApi(catalogApiRef);
  const contentApi = useApi(automationContentApiRef);
  const [environmentName, setEnvironmentName] = useState('');
  const [description, setDescription] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [selectedTagOverride, setSelectedTagOverride] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const registryRepository = useMemo(
    () => (registry && repository ? { registry, repository } : undefined),
    [registry, repository],
  );

  const tagMap = useAsyncRetry(async () => {
    let target = registryRepository;
    if (!target) {
      const registries = await contentApi.listRegistries();
      target = registryRepositoryFromReference(pullReference, registries);
    }
    if (!target) {
      throw new Error('The image reference does not identify a repository.');
    }
    return contentApi.getRepositoryTags(target.registry, target.repository);
  }, [contentApi, pullReference, registryRepository]);
  const tags = useMemo(
    () => sortRepositoryTagsNewestFirst(tagMap.value?.tags ?? []),
    [tagMap.value],
  );
  const tagOptions = useMemo(
    () => tags.map(entry => ({ id: entry.tag, label: entry.tag })),
    [tags],
  );
  const currentTag = tags.find(entry => entry.tag === selectedTag)?.tag;
  const availableOverride = tags.find(
    entry => entry.tag === selectedTagOverride,
  )?.tag;
  const activeTag = availableOverride ?? currentTag ?? tags[0]?.tag ?? '';
  const selectedImage = tags.find(entry => entry.tag === activeTag);
  const imageRepositoryReference = pullReference.includes('@')
    ? pullReference.slice(0, pullReference.lastIndexOf('@'))
    : pullReference;
  const selectedImageReference = activeTag
    ? `${imageRepositoryReference}:${activeTag}`
    : '';

  // Organizations come from the AAP entity provider's synced catalog Groups;
  // the frontend never contacts Controller directly.
  const organizations = useAsyncRetry(async (): Promise<
    ControllerOrganization[]
  > => {
    const { items } = await catalog.getEntities({
      filter: { kind: 'Group', 'spec.type': ['organization'] },
    });
    return items
      .map(entity => {
        const annotations = entity.metadata.annotations ?? {};
        const id = Number(annotations['ansible.com/aap-org-id']);
        const name =
          annotations['ansible.com/organization'] ??
          (entity.spec as { profile?: { displayName?: string } } | undefined)
            ?.profile?.displayName ??
          entity.metadata.name;
        return { id, name: String(name) };
      })
      .filter(org => Number.isFinite(org.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog]);

  const organizationOptions = useMemo(
    () =>
      (organizations.value ?? []).map(org => ({
        id: String(org.id),
        label: org.name,
      })),
    [organizations.value],
  );

  useEffect(() => {
    if (open) {
      setEnvironmentName(imageName);
      setDescription(`Use ${imageName} in Ansible Automation Controller.`);
      setOrganizationId('');
      setPendingMessage('');
    }
  }, [imageName, open]);

  useEffect(() => {
    setSelectedTagOverride('');
    setCopyStatus('');
  }, [pullReference, open]);

  const handleSubmit = (): void => {
    setPendingMessage(
      'Use in Controller is pending. This action will not create a task or contact Controller yet.',
    );
  };

  const copyDigest = async (): Promise<void> => {
    if (!selectedImage) return;
    if (await copyText(selectedImage.digest)) {
      setCopyStatus('Digest copied');
    } else {
      setCopyStatus('Unable to copy. Select and copy the digest.');
    }
  };

  const organizationsUnavailable = Boolean(organizations.error);
  const organizationsEmpty =
    !organizations.loading &&
    !organizationsUnavailable &&
    !organizationOptions.length;
  const tagsUnavailable = Boolean(tagMap.error);
  const tagsEmpty = !tagMap.loading && !tagsUnavailable && tags.length === 0;

  return (
    <Dialog isOpen={open} onOpenChange={value => !value && onClose()}>
      <DialogHeader>Use in Controller</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          <Text color="secondary">
            Review the image details you would use with Ansible Automation
            Controller. This functionality is pending; submitting will not
            create a task.
          </Text>
          <Text color="secondary">
            Review the selected tag and digest before continuing.
          </Text>

          {tagMap.loading && <Skeleton width="100%" height="3rem" />}
          {tagsUnavailable && (
            <Text role="alert">
              Unable to load image tags.{' '}
              <Button variant="secondary" onPress={tagMap.retry}>
                Retry
              </Button>
            </Text>
          )}
          {tagsEmpty && (
            <Text role="alert">
              No tags are available for this repository, so this image cannot be
              added to Controller.
            </Text>
          )}
          {tagOptions.length > 0 && (
            <Select
              label="Tags"
              value={activeTag}
              options={tagOptions}
              onChange={key => setSelectedTagOverride(String(key))}
            />
          )}

          {selectedImage && (
            <Card className={styles.selectedImageCard}>
              <CardBody>
                <Flex direction="column" gap="3">
                  <Text as="h2" variant="body-large" weight="bold">
                    Selected image
                  </Text>
                  <dl className={styles.imageDetails}>
                    <dt>Image</dt>
                    <dd>
                      <code className={styles.reference}>
                        {selectedImageReference}
                      </code>
                    </dd>
                    <dt>Digest</dt>
                    <dd>
                      <Flex align="start" gap="2" className={styles.digestRow}>
                        <code
                          className={styles.reference}
                          title={selectedImage.digest}
                        >
                          {selectedImage.digest}
                        </code>
                        <ButtonIcon
                          size="medium"
                          variant="tertiary"
                          icon={<FileCopyIcon fontSize="small" />}
                          onPress={copyDigest}
                          aria-label="Copy digest"
                        />
                      </Flex>
                    </dd>
                  </dl>
                  {copyStatus && <Text role="status">{copyStatus}</Text>}
                </Flex>
              </CardBody>
            </Card>
          )}

          {pendingMessage && <Text role="status">{pendingMessage}</Text>}
          <TextField
            label="Execution environment name"
            value={environmentName}
            onChange={setEnvironmentName}
            isRequired
          />
          <TextField
            label="Description"
            value={description}
            onChange={setDescription}
          />
          {organizations.loading && <Skeleton width="100%" height="3rem" />}
          {organizationsUnavailable && (
            <Text role="alert">
              Controller organizations are unavailable. Check the catalog
              connection and retry.
            </Text>
          )}
          {organizationsEmpty && (
            <Text>
              No Controller organizations are available. Organizations appear
              here after the AAP catalog sync.
            </Text>
          )}
          {organizationOptions.length > 0 && (
            <Select
              label="Organization"
              value={organizationId}
              options={organizationOptions}
              onChange={key => {
                setOrganizationId(String(key));
              }}
              isRequired
            />
          )}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={onClose}>
          Cancel
        </Button>
        <Button onPress={handleSubmit}>Use in Controller</Button>
      </DialogFooter>
    </Dialog>
  );
}
