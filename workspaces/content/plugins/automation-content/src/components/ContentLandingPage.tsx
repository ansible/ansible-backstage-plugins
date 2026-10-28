import { Flex, Text } from '@backstage/ui';
import type { ReactElement } from 'react';

/** Keep the native route available while the content landing page is migrated. */
export function ContentLandingPage(): ReactElement {
  return (
    <Flex>
      <Text>Automation content is coming in the next commit.</Text>
    </Flex>
  );
}
