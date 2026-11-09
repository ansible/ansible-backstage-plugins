import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { rhAapAuthApiRef } from '@ansible/aap-app-auth';
import {
  Button,
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

/**
 * Portal-scaffolder's task-detail route. No route ref is exported for the
 * task page — portal-scaffolder builds this same path from its own root ref
 * in CreateTask — so the suffix is mirrored here as a constant.
 */
const TASK_PATH = '/self-service/create/tasks/';

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

function isMissingTemplate(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('name' in error && error.name === 'NotFoundError') return true;
  if ('status' in error && error.status === 404) return true;
  if (
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'status' in error.response &&
    error.response.status === 404
  ) {
    return true;
  }
  return (
    'message' in error &&
    typeof error.message === 'string' &&
    /\bnot[\s-]+found\b/i.test(error.message)
  );
}

/** Form for starting the reviewed EE-in-Controller scaffolder workflow. */
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
  const scaffolderApi = useApi(scaffolderApiRef);
  const catalog = useApi(catalogApiRef);
  const aapAuth = useApi(rhAapAuthApiRef);
  const contentApi = useApi(automationContentApiRef);
  const navigate = useNavigate();
  const [environmentName, setEnvironmentName] = useState('');
  const [description, setDescription] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [selectedTagOverride, setSelectedTagOverride] = useState('');
  const [organizationError, setOrganizationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
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
      setOrganizationError('');
      setError('');
    }
  }, [imageName, open]);

  useEffect(() => {
    setSelectedTagOverride('');
    setCopyStatus('');
  }, [pullReference, open]);

  const handleSubmit = async (): Promise<void> => {
    if (!environmentName.trim()) {
      setError('Execution environment name is required.');
      return;
    }
    const organization = organizations.value?.find(
      org => String(org.id) === organizationId,
    );
    if (!organization) {
      setOrganizationError('Select an organization.');
      return;
    }
    if (!selectedImage || !selectedImageReference) {
      setError('Choose an available image version before continuing.');
      return;
    }
    setSubmitting(true);
    setError('');
    setOrganizationError('');
    let token: string;
    try {
      token = await aapAuth.getAccessToken();
    } catch {
      setError(
        'Unable to authenticate with Ansible Automation Platform. Sign in again and retry.',
      );
      setSubmitting(false);
      return;
    }
    try {
      const task = await scaffolderApi.scaffold({
        templateRef: 'template:default/ee-use-in-controller',
        values: {
          environmentName: environmentName.trim(),
          environmentDescription: description,
          organizationId: organization.id,
          organizationName: organization.name,
          image: selectedImageReference,
          pull: 'always',
        },
        secrets: { aapToken: token },
      });
      onClose();
      // Follow the task so the user sees its Controller workflow progress.
      navigate(`${TASK_PATH}${task.taskId}`);
    } catch (failure) {
      setError(
        isMissingTemplate(failure)
          ? 'This action is not available yet. The task template was not found.'
          : 'Unable to start the Controller workflow. Try again later.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyDigest = async (): Promise<void> => {
    if (!selectedImage) return;
    try {
      await navigator.clipboard.writeText(selectedImage.digest);
      setCopyStatus('Digest copied');
    } catch {
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
    <Dialog
      isOpen={open}
      onOpenChange={value => !value && !submitting && onClose()}
    >
      <DialogHeader>Use in Controller</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          <Text color="secondary">
            Create this registry image as an execution environment in Ansible
            Automation Controller. After you submit, follow progress and logs on
            the task page.
          </Text>
          <Text color="secondary">
            Controller pulls the selected tag when the task runs. Tags can move
            to a different image over time.
          </Text>

          {tagMap.loading && <Skeleton width="100%" height="3rem" />}
          {tagsUnavailable && (
            <Text role="alert">
              Unable to load image versions.{' '}
              <Button variant="secondary" onPress={tagMap.retry}>
                Retry
              </Button>
            </Text>
          )}
          {tagsEmpty && (
            <Text role="alert">
              No versions are available for this repository, so this image
              cannot be added to Controller.
            </Text>
          )}
          {tagOptions.length > 0 && (
            <Select
              label="Version"
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
                        <Button
                          variant="secondary"
                          onPress={copyDigest}
                          aria-label="Copy selected image digest"
                        >
                          Copy digest
                        </Button>
                      </Flex>
                    </dd>
                  </dl>
                  {copyStatus && <Text role="status">{copyStatus}</Text>}
                </Flex>
              </CardBody>
            </Card>
          )}

          {error && <Text role="alert">{error}</Text>}
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
                setOrganizationError('');
              }}
              isRequired
              description={organizationError || 'Required'}
            />
          )}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={onClose} isDisabled={submitting}>
          Cancel
        </Button>
        <Button
          onPress={handleSubmit}
          isPending={submitting}
          isDisabled={
            submitting ||
            organizations.loading ||
            organizationsUnavailable ||
            organizationsEmpty ||
            tagMap.loading ||
            tagsUnavailable ||
            tagsEmpty
          }
        >
          Use in Controller
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
