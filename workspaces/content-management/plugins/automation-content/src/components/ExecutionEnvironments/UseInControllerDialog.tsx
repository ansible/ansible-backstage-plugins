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
  onClose,
}: Readonly<{
  open: boolean;
  imageName: string;
  pullReference: string;
  onClose: () => void;
}>): ReactElement {
  const scaffolderApi = useApi(scaffolderApiRef);
  const catalog = useApi(catalogApiRef);
  const aapAuth = useApi(rhAapAuthApiRef);
  const navigate = useNavigate();
  const [environmentName, setEnvironmentName] = useState('');
  const [description, setDescription] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

  // Controller receives the digest-pinned reference: everything the user
  // reviewed (contents, signing state, verification age) applies to this
  // digest, and a mutable tag can point at a different image by the time
  // Controller pulls it.
  const image = pullReference;

  useEffect(() => {
    if (open) {
      setEnvironmentName(imageName);
      setDescription(`Use ${imageName} in Ansible Automation Controller.`);
      setOrganizationId('');
      setError('');
    }
  }, [imageName, open]);

  useEffect(() => {
    // Default to the first organization once the list resolves.
    if (open && !organizationId && organizationOptions.length) {
      setOrganizationId(organizationOptions[0].id);
    }
  }, [open, organizationId, organizationOptions]);

  const handleSubmit = async (): Promise<void> => {
    if (!environmentName.trim()) {
      setError('Execution environment name is required.');
      return;
    }
    const organization = organizations.value?.find(
      org => String(org.id) === organizationId,
    );
    if (!organization) {
      setError('Select an organization.');
      return;
    }
    setSubmitting(true);
    setError('');
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
          image,
          pull: 'always',
        },
        secrets: { aapToken: token },
      });
      onClose();
      // Follow the task so the user sees Controller workflow progress.
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

  const organizationsUnavailable = Boolean(organizations.error);
  const organizationsEmpty =
    !organizations.loading &&
    !organizationsUnavailable &&
    !organizationOptions.length;

  return (
    <Dialog
      isOpen={open}
      onOpenChange={value => !value && !submitting && onClose()}
    >
      <DialogHeader>Use in Controller</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          <Text color="secondary">
            Add this image as an execution environment in Ansible Automation
            Controller.
          </Text>
          <Text>
            <Text as="strong">Image:</Text> {image}
          </Text>
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
              onChange={key => setOrganizationId(String(key))}
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
          isDisabled={organizationsUnavailable || organizationsEmpty}
        >
          Use in Controller
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
