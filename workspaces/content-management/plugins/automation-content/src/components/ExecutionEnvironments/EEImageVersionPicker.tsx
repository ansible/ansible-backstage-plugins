import { useApi, useTranslationRef } from '@backstage/frontend-plugin-api';
import type { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import { Alert, Button, Flex, Select, Text, TextField } from '@backstage/ui';
import { useLocation } from 'react-router-dom';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { automationContentApiRef } from '../../api';
import { eeTranslationRef } from '../../strings/en';

type Repository = { registry: string; repository: string };
type VersionFieldProps = FieldExtensionComponentProps<string>;

function versionSeparator(reference: string): number {
  const digestSeparator = reference.lastIndexOf('@');
  return digestSeparator >= 0 ? digestSeparator : reference.lastIndexOf(':');
}

export function EEImageVersionPicker(
  props: Readonly<VersionFieldProps>,
): JSX.Element {
  const { state } = useLocation();
  const source = (state as { controllerRepository?: Repository } | null)
    ?.controllerRepository;
  const { t } = useTranslationRef(eeTranslationRef);
  if (source) {
    return <RepositoryVersionPicker {...props} source={source} />;
  }
  return (
    <TextField
      label={t('controllerVersion.image')}
      value={props.formData ?? ''}
      onChange={props.onChange}
      isRequired={props.required}
      isDisabled={props.disabled}
      isReadOnly={props.readonly}
      isInvalid={Boolean(props.rawErrors?.length)}
    />
  );
}

function RepositoryVersionPicker({
  source,
  formData,
  onChange,
  required,
  disabled,
  readonly,
  rawErrors,
}: Readonly<VersionFieldProps & { source: Repository }>): JSX.Element {
  const api = useApi(automationContentApiRef);
  const { t } = useTranslationRef(eeTranslationRef);
  const { registry, repository } = source;
  const details = useAsyncRetry(
    () => api.getEERepository(registry, repository),
    [api, registry, repository],
  );
  const options = (details.value?.tags ?? []).map(tag => ({
    id: tag.taggedPullReference,
    label: tag.tag,
  }));
  if (formData && !options.some(option => option.id === formData)) {
    const separator = versionSeparator(formData);
    const hasVersion = separator > formData.lastIndexOf('/');
    if (hasVersion && options.length === 0 && details.value?.digests.length) {
      const pullName = formData.slice(0, separator);
      options.push(
        ...details.value.digests.map(({ digest }) => ({
          id: `${pullName}@${digest}`,
          label: digest,
        })),
      );
    }
    if (!options.some(option => option.id === formData)) {
      options.unshift({
        id: formData,
        label: hasVersion
          ? formData.slice(separator + 1)
          : t('controllerVersion.untagged'),
      });
    }
  }
  const digest =
    details.value?.tags.find(tag => tag.taggedPullReference === formData)
      ?.digest ?? formData?.split('@')[1];
  return (
    <Flex direction="column" gap="2">
      <Select
        label={t('controllerVersion.label')}
        options={options}
        selectedKey={formData ?? null}
        onSelectionChange={key => {
          if (typeof key === 'string') onChange(key);
        }}
        isRequired={required}
        isInvalid={Boolean(rawErrors?.length)}
        isDisabled={disabled || readonly || details.loading}
      />
      {formData && (
        <>
          <Text color="secondary">{formData}</Text>
          <TextField
            label={t('detail.digest')}
            value={digest ?? (details.loading ? '' : t('unknown'))}
            isReadOnly
          />
        </>
      )}
      {details.loading && (
        <Text role="status">{t('controllerVersion.loading')}</Text>
      )}
      {details.error && (
        <Alert
          status="warning"
          title={t('controllerVersion.failed')}
          customActions={
            <Button variant="tertiary" onPress={details.retry}>
              {t('retry')}
            </Button>
          }
        />
      )}
    </Flex>
  );
}
