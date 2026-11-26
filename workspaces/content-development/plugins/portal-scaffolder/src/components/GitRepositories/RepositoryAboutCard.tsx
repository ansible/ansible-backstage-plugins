import type { ReactNode } from 'react';
import { Entity } from '@backstage/catalog-model';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Link,
  Tag,
  TagGroup,
  Text,
} from '@backstage/ui';

import { getSourceUrl, buildSourceString } from '../CollectionsCatalog/utils';

export interface RepositoryAboutCardProps {
  entity: Entity;
  onViewSource?: () => void;
  onNavigateToCollections?: () => void;
}

const AboutField = ({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) => (
  <Flex direction="column" gap="1">
    <Text variant="body-small" weight="bold" color="secondary">
      {label}
    </Text>
    {children}
  </Flex>
);

export const RepositoryAboutCard = ({
  entity,
  onViewSource,
  onNavigateToCollections,
}: RepositoryAboutCardProps) => {
  const description =
    entity.metadata?.description ||
    'Git repository discovered from Ansible content sources.';

  const spec = (entity.spec || {}) as {
    repository_name?: string;
    repository_default_branch?: string;
    repository_collection_count?: number;
    repository_ee_count?: number;
    repository_collections?: string[];
  };

  const defaultBranch = spec.repository_default_branch || '—';
  const collectionCount = spec.repository_collection_count ?? 0;
  const eeCount = spec.repository_ee_count ?? 0;

  const sourceUrl = getSourceUrl(entity);
  const sourceString = buildSourceString(entity);

  const tags: string[] = Array.isArray(entity.metadata?.tags)
    ? entity.metadata.tags
    : [];

  const collectionsLabel = `${collectionCount} collection${
    collectionCount === 1 ? '' : 's'
  }`;
  let containsCollectionsPart: ReactNode = null;
  if (collectionCount > 0) {
    containsCollectionsPart = onNavigateToCollections ? (
      <Button variant="tertiary" onPress={onNavigateToCollections}>
        {collectionsLabel}
      </Button>
    ) : (
      <Text>{collectionsLabel}</Text>
    );
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="title-medium">About</Text>
      </CardHeader>
      <CardBody>
        <Flex direction="column" gap="4">
          <AboutField label="Description">
            <Text>{description}</Text>
          </AboutField>

          <AboutField label="Source">
            {sourceUrl ? (
              <Link
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={event => {
                  event.preventDefault();
                  onViewSource?.();
                }}
              >
                {sourceString}
              </Link>
            ) : (
              <Text>{sourceString || 'Unknown'}</Text>
            )}
          </AboutField>

          <AboutField label="Default branch">
            <Text>{defaultBranch}</Text>
          </AboutField>

          <AboutField label="Contains">
            <Text>
              {collectionCount > 0 || eeCount > 0 ? (
                <>
                  {containsCollectionsPart}
                  {collectionCount > 0 && eeCount > 0 && ', '}
                  {eeCount > 0 &&
                    `${eeCount} EE definition${eeCount === 1 ? '' : 's'}`}
                </>
              ) : (
                '—'
              )}
            </Text>
          </AboutField>

          {tags.length > 0 && (
            <AboutField label="Tags">
              <TagGroup aria-label="Repository tags">
                {tags.map(tag => (
                  <Tag key={tag} id={tag} isDisabled>
                    {tag}
                  </Tag>
                ))}
              </TagGroup>
            </AboutField>
          )}
        </Flex>
      </CardBody>
    </Card>
  );
};
