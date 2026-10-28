import { Flex, Text } from '@backstage/ui';
import type { ReactElement } from 'react';

/** Keep direct EE navigation available while the catalog is migrated. */
export function EERoutesPage(): ReactElement {
  return (
    <Flex>
      <Text>Execution environments are coming in the next commit.</Text>
    </Flex>
  );
}
