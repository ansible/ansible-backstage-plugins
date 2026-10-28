import { Flex, Text } from '@backstage/ui';
import type { PageHeaderSectionProps } from './types';

/** Route title and optional actions; essential help/status remains visible. */
export function PageHeaderSection({
  title,
  description,
  help,
  actions,
  status,
}: PageHeaderSectionProps) {
  return (
    <Flex direction="column" gap="3">
      <Flex
        direction={{ initial: 'column', md: 'row' }}
        justify="between"
        align="start"
        gap="4"
      >
        <Text variant="title-large" as="h1">
          {title}
        </Text>
        {actions}
      </Flex>
      {description && <Text as="p">{description}</Text>}
      {help && (
        <Text as="p" color="secondary">
          {help}
        </Text>
      )}
      {status && <div role="status">{status}</div>}
    </Flex>
  );
}
