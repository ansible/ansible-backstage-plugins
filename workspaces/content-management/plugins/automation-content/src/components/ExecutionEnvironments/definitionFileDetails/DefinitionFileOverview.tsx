import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Entity } from '@backstage/catalog-model';
import {
  Badge,
  Button,
  ButtonIcon,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Link,
  Text,
} from '@backstage/ui';
import { MarkdownContent } from '@backstage/core-components';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import EditIcon from '@material-ui/icons/Edit';
import GetAppIcon from '@material-ui/icons/GetApp';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import type { ParsedEEDefinition } from '../../../utils/eeDefinitionUtils';
import type { GitFileFailureReason } from './gitFileReader';
import styles from './definitionFileDetails.module.css';

export interface DefinitionFileOverviewProps {
  entity: Entity;
  ownerName: string;
  parsedDefinition: ParsedEEDefinition | null;
  hasDefinition: boolean;
  readmeFailure?: GitFileFailureReason;
  definitionFailure?: GitFileFailureReason;
  sourceLocationUrl?: string;
  editDefinitionUrl?: string;
  readme?: string;
  isRefreshing: boolean;
  isDownloadExperience: boolean;
  onRefresh: () => void;
  onRetrySourceFiles: () => void;
  onEditDefinition: () => void;
  onDownloadArchive: () => void;
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function sourceName(entity: Entity): string {
  const provider = entity.metadata.annotations?.['ansible.io/scm-provider']
    ?.toString()
    .toLowerCase();
  if (provider?.includes('github')) return 'GitHub';
  if (provider?.includes('gitlab')) return 'GitLab';
  return 'Source repository';
}

function OverviewCard({
  title,
  children,
  className,
  actions,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}): ReactElement {
  return (
    <Card className={`${styles.card} ${className ?? ''}`}>
      <CardHeader>
        <Flex align="center" justify="between" gap="2">
          <Text as="h2" variant="title-x-small" weight="bold">
            {title}
          </Text>
          {actions}
        </Flex>
      </CardHeader>
      <CardBody className={styles.cardBody}>{children}</CardBody>
    </Card>
  );
}

type AboutCardProps = Pick<
  DefinitionFileOverviewProps,
  | 'entity'
  | 'ownerName'
  | 'parsedDefinition'
  | 'sourceLocationUrl'
  | 'editDefinitionUrl'
  | 'isRefreshing'
  | 'isDownloadExperience'
  | 'onRefresh'
  | 'onEditDefinition'
>;

function AboutCard({
  entity,
  ownerName,
  parsedDefinition,
  sourceLocationUrl,
  editDefinitionUrl,
  isRefreshing,
  isDownloadExperience,
  onRefresh,
  onEditDefinition,
}: AboutCardProps): ReactElement {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const description =
    entity.metadata.description?.trim() ||
    entity.metadata.title?.trim() ||
    'No description available.';
  const showReadMore = description.length > 150;

  return (
    <OverviewCard
      title="About"
      actions={
        <Flex align="center" gap="1">
          {!isDownloadExperience && (
            <ButtonIcon
              variant="tertiary"
              icon={<AutorenewIcon />}
              aria-label="Refresh definition details"
              isDisabled={isRefreshing}
              onPress={onRefresh}
            />
          )}
          {!isDownloadExperience && safeHttpUrl(editDefinitionUrl) && (
            <ButtonIcon
              variant="tertiary"
              icon={<EditIcon />}
              aria-label="Edit definition"
              onPress={onEditDefinition}
            />
          )}
        </Flex>
      }
    >
      <div className={styles.aboutSection}>
        <Text variant="body-small" color="secondary">
          Description
        </Text>
        <Text className={styles.wrap}>
          {showReadMore && !descriptionExpanded
            ? `${description.slice(0, 150)}...`
            : description}
        </Text>
        {showReadMore && (
          <Button
            variant="tertiary"
            size="small"
            aria-expanded={descriptionExpanded}
            onPress={() => setDescriptionExpanded(expanded => !expanded)}
          >
            {descriptionExpanded ? 'Read less' : 'Read more'}
          </Button>
        )}
      </div>

      <DefinitionField label="Owner" value={ownerName.trim() || '—'} />
      <DefinitionField
        label="Base image"
        value={parsedDefinition?.baseImageName?.trim() || '—'}
      />

      {!isDownloadExperience && (
        <div className={styles.aboutSection}>
          <Text variant="body-small" color="secondary">
            Source
          </Text>
          {safeHttpUrl(sourceLocationUrl) ? (
            <Link
              href={safeHttpUrl(sourceLocationUrl)!}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.sourceLink}
            >
              {sourceName(entity)} <OpenInNewIcon fontSize="small" />
            </Link>
          ) : (
            <Text color="secondary">—</Text>
          )}
        </div>
      )}

      <div className={styles.tagsSection}>
        <Text variant="body-small" color="secondary">
          Tags
        </Text>
        <Flex gap="2" className={styles.tags}>
          {entity.metadata.tags?.length ? (
            entity.metadata.tags.map(tag => <Badge key={tag}>{tag}</Badge>)
          ) : (
            <Text color="secondary">No tags</Text>
          )}
        </Flex>
      </div>
    </OverviewCard>
  );
}

function DefinitionField({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className={styles.aboutSection}>
      <Text variant="body-small" color="secondary">
        {label}
      </Text>
      <Text className={styles.wrap}>{value}</Text>
    </div>
  );
}

function SourceFileFailure({
  fileLabel,
  reason,
  onRetry,
}: {
  fileLabel: string;
  reason: GitFileFailureReason;
  onRetry: () => void;
}): ReactElement {
  const message = {
    integration_auth:
      'SCM integration authentication failed. Check the configured GitHub ' +
      'or GitLab credentials, then retry.',
    access_denied:
      `Access to the ${fileLabel} in the source repository was denied. ` +
      'Check your Ansible content and catalog access, then retry.',
    not_found: `The ${fileLabel} was not found in the source repository.`,
    unavailable: 'The source repository is unavailable right now.',
  }[reason];

  return (
    <Flex align="center" justify="between" gap="3">
      <Text role="alert" color="secondary">
        {message}
      </Text>
      <Button variant="tertiary" size="small" onPress={onRetry}>
        Retry
      </Button>
    </Flex>
  );
}

function formatCollectionName(name: string): string {
  const masked = name.replace(/\$\{[^}]+\}/g, 'token');
  try {
    const url = new URL(masked);
    return url.pathname.replace(/^\//, '').replace(/\.git$/, '') || name;
  } catch {
    return name;
  }
}

function formatCollectionVersion(
  version: string | undefined,
  type: string | undefined,
): string {
  if (!version) return '';
  return type === 'git' ? ` (${version})` : ` v${version}`;
}

function ContentSection({
  label,
  values,
  fileRef,
  emptyCopy,
  formatValue,
}: {
  label: string;
  values: string[];
  fileRef: string | null;
  emptyCopy: string;
  formatValue?: (value: string, index: number) => string;
}): ReactElement {
  const heading = fileRef ? label : `${label} (${values.length})`;
  let content: ReactNode;
  if (fileRef) {
    content = <Text className={styles.wrap}>From file: {fileRef}</Text>;
  } else if (values.length) {
    content = (
      <Flex direction="column" gap="1">
        {values.map((value, index) => (
          <Text key={`${value}-${index}`} className={styles.wrap}>
            {formatValue ? formatValue(value, index) : value}
          </Text>
        ))}
      </Flex>
    );
  } else {
    content = <Text color="secondary">{emptyCopy}</Text>;
  }

  return (
    <div className={styles.aboutSection}>
      <Text variant="body-small" color="secondary">
        {heading}
      </Text>
      {content}
    </div>
  );
}

function DefinedContentCard({
  parsedDefinition,
  hasDefinition,
  definitionFailure,
  onRetrySourceFiles,
}: {
  parsedDefinition: ParsedEEDefinition | null;
  hasDefinition: boolean;
  definitionFailure?: GitFileFailureReason;
  onRetrySourceFiles: () => void;
}): ReactElement {
  const collections = parsedDefinition?.collections ?? [];
  const pythonPackages = parsedDefinition?.pythonPackages ?? [];
  const systemPackages = parsedDefinition?.systemPackages ?? [];

  let content: ReactElement;
  if (definitionFailure) {
    content = (
      <SourceFileFailure
        fileLabel="definition file"
        reason={definitionFailure}
        onRetry={onRetrySourceFiles}
      />
    );
  } else if (!parsedDefinition) {
    content = (
      <Text color="secondary">
        {hasDefinition
          ? 'Definition file could not be read.'
          : 'No definition file available.'}
      </Text>
    );
  } else {
    content = (
      <Flex direction="column" gap="4">
        <Text color="secondary">
          Shows explicitly added collections, Python requirements, and system
          packages only.
        </Text>
        <ContentSection
          label="Collections"
          values={collections.map(collection => collection.name)}
          fileRef={parsedDefinition.collectionsFileRef}
          emptyCopy="No additional collections declared."
          formatValue={(_name, index) => {
            const collection = collections[index];
            return `${formatCollectionName(
              collection.name,
            )}${formatCollectionVersion(collection.version, collection.type)}`;
          }}
        />
        {parsedDefinition.pythonPath && (
          <DefinitionField
            label="Python interpreter"
            value={parsedDefinition.pythonPath}
          />
        )}
        <ContentSection
          label="Python requirements"
          values={pythonPackages}
          fileRef={parsedDefinition.pythonFileRef}
          emptyCopy="No additional Python requirements declared."
        />
        <ContentSection
          label="System packages"
          values={systemPackages}
          fileRef={parsedDefinition.systemFileRef}
          emptyCopy="No additional system packages declared."
        />
      </Flex>
    );
  }
  return <OverviewCard title="Defined Content">{content}</OverviewCard>;
}

function ResourcesCard(): ReactElement {
  const resources = [
    {
      label: 'Introduction to automation execution environments',
      href: 'https://red.ht/ee_assembly-intro-to-builder',
    },
    {
      label:
        'Create execution environment definitions in self-service automation portal',
      href: 'https://red.ht/self-service-create-ee-definitions',
    },
    {
      label: 'Build execution environment images with Ansible Builder',
      href: 'https://red.ht/ee_assembly-using-builder',
    },
  ];

  return (
    <OverviewCard title="Resources">
      <Flex direction="column" gap="3">
        {resources.map(resource => (
          <Link
            key={resource.href}
            href={resource.href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.resourceLink}
          >
            <OpenInNewIcon fontSize="small" />
            {resource.label}
          </Link>
        ))}
      </Flex>
    </OverviewCard>
  );
}

function LinksCard({
  entity,
  isDownloadExperience,
  onDownloadArchive,
}: Pick<
  DefinitionFileOverviewProps,
  'entity' | 'isDownloadExperience' | 'onDownloadArchive'
>): ReactElement | null {
  const links = (entity.metadata.links ?? []).flatMap(link => {
    const href = safeHttpUrl(link.url);
    return href ? [{ href, title: link.title?.trim() || href }] : [];
  });
  if (!isDownloadExperience && links.length === 0) return null;
  return (
    <OverviewCard title="Links">
      {isDownloadExperience && (
        <Button
          variant="tertiary"
          iconStart={<GetAppIcon />}
          onPress={onDownloadArchive}
        >
          Download EE files
        </Button>
      )}
      {links.map((link, index) => (
        <Link
          key={`${link.href}-${index}`}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.resourceLink}
        >
          {link.title} <OpenInNewIcon fontSize="small" />
        </Link>
      ))}
    </OverviewCard>
  );
}

export function DefinitionFileOverview({
  entity,
  ownerName,
  parsedDefinition,
  hasDefinition,
  sourceLocationUrl,
  editDefinitionUrl,
  readme,
  readmeFailure,
  definitionFailure,
  isRefreshing,
  isDownloadExperience,
  onRefresh,
  onRetrySourceFiles,
  onEditDefinition,
  onDownloadArchive,
}: DefinitionFileOverviewProps): ReactElement {
  let readmeContent: ReactElement;
  if (readmeFailure) {
    readmeContent = (
      <SourceFileFailure
        fileLabel="README"
        reason={readmeFailure}
        onRetry={onRetrySourceFiles}
      />
    );
  } else if (readme?.trim()) {
    readmeContent = (
      <div className={styles.readmeScroll}>
        <MarkdownContent content={readme} />
      </div>
    );
  } else {
    readmeContent = <Text color="secondary">No README available.</Text>;
  }
  return (
    <div className={styles.overviewGrid}>
      <OverviewCard title="README" className={styles.readmeCard}>
        {readmeContent}
      </OverviewCard>
      <aside className={styles.overviewSidebar}>
        <LinksCard
          entity={entity}
          isDownloadExperience={isDownloadExperience}
          onDownloadArchive={onDownloadArchive}
        />
        <AboutCard
          entity={entity}
          ownerName={ownerName}
          parsedDefinition={parsedDefinition}
          sourceLocationUrl={sourceLocationUrl}
          editDefinitionUrl={editDefinitionUrl}
          isRefreshing={isRefreshing}
          isDownloadExperience={isDownloadExperience}
          onRefresh={onRefresh}
          onEditDefinition={onEditDefinition}
        />
        <DefinedContentCard
          parsedDefinition={parsedDefinition}
          hasDefinition={hasDefinition}
          definitionFailure={definitionFailure}
          onRetrySourceFiles={onRetrySourceFiles}
        />
        <ResourcesCard />
      </aside>
    </div>
  );
}
