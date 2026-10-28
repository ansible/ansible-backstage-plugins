import { Box, Flex, Text } from '@backstage/ui';
import type { EmptyStateProps } from './types';

/** Accessible local empty state with a caller-owned, relevant recovery action. */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <Box p="6">
      <Flex direction="column" align="center" gap="3">
        {icon && <span aria-hidden="true">{icon}</span>}
        <Text variant="title-small" as="h2">
          {title}
        </Text>
        <Text as="p">{description}</Text>
        {action}
      </Flex>
    </Box>
  );
}
