import { Flex, Text } from '@backstage/ui';
import type { ReactElement } from 'react';

/** Keep direct collection navigation available while the catalog is migrated. */
export function CollectionsRoutesPage(): ReactElement {
  return (
    <Flex>
      <Text>Collections are coming in the next commit.</Text>
    </Flex>
  );
}
