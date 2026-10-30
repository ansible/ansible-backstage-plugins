import type { ReactElement } from 'react';
import type { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { taskCreatePermission } from '@backstage/plugin-scaffolder-common/alpha';
import { usePermission } from '@backstage/plugin-permission-react';
import { useStarredEntities } from '@backstage/plugin-catalog-react';
import {
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Flex,
  Link,
  Tag,
  TagGroup,
  Text,
} from '@backstage/ui';
import { StarIcon } from '../../common';

/** Prototype WizardCard, including separate details and permission-gated Start actions. */
export function WizardCard({
  template,
}: Readonly<{ template: TemplateEntityV1beta3 }>): ReactElement {
  const namespace = template?.metadata?.namespace ?? 'default';
  const name = template?.metadata?.name ?? '';
  const { allowed: canCreateTask } = usePermission({
    permission: taskCreatePermission,
  });
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();
  const starred = isStarredEntity(template);
  return (
    <Card data-testid={`${namespace}-${name}`}>
      <CardHeader>
        <Flex justify="between" align="start">
          <Flex direction="column" gap="1">
            <Link
              data-testid="template--title"
              href={`/catalog/${namespace}/template/${name}`}
            >
              {template?.metadata?.title}
            </Link>
            <Text color="secondary">{template?.spec?.type?.toString()}</Text>
          </Flex>
          <Button
            variant="tertiary"
            aria-label={starred ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={starred}
            onPress={() => toggleStarredEntity(template)}
          >
            <StarIcon selected={starred} />
          </Button>
        </Flex>
      </CardHeader>
      <CardBody>
        <Flex direction="column" gap="4">
          <Text data-testid="template--description">
            {template?.metadata?.description?.trim().length
              ? template.metadata.description
              : 'No description available'}
          </Text>
          {(template?.metadata?.tags ?? []).length > 0 && (
            <TagGroup aria-label="Tags" data-testid="template--tags">
              {template.metadata.tags?.map(tag => (
                <Tag key={tag} data-testid={`template-tags--${tag}`}>
                  {tag}
                </Tag>
              ))}
            </TagGroup>
          )}
        </Flex>
      </CardBody>
      <CardFooter>
        <Flex justify="between" align="center">
          <Text>{template?.spec?.owner ?? ''}</Text>
          {canCreateTask && (
            <ButtonLink
              size="small"
              variant="secondary"
              data-testid="template-card-actions--create"
              href={`/create/templates/${namespace}/${name}`}
            >
              Start
            </ButtonLink>
          )}
        </Flex>
      </CardFooter>
    </Card>
  );
}
