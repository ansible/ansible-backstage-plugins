import type { ReactElement } from 'react';
import { Button, Flex, Grid, Link, Text } from '@backstage/ui';
import eeIllustration from '../../../images/ee-illustration.png';

/** Original first-run definition guidance and illustration. */
export function CreateCatalog({
  onTabSwitch,
}: {
  onTabSwitch: (index: number) => void;
}): ReactElement {
  return (
    <div data-testid="catalog-content">
      <Grid.Root columns={{ initial: '1', md: '2' }} gap="4">
        <Grid.Item>
          <Flex direction="column" gap="4">
            <Text variant="title-large" as="h2">
              No Execution Environment definition files, yet
            </Text>
            <Text as="p" color="secondary">
              Get started with Execution Environment (EE) to ensure your
              playbooks run the same way, every time. Choose a recommended
              preset of a EE definition or start from scratch for full control.
              <br />
              Once your definition is saved, we'll walk you through building the
              EE.
            </Text>
            <Flex direction="column" gap="4" align="start">
              <Button onPress={() => onTabSwitch(2)}>
                Create Execution Environment definition file
              </Button>
              <Link
                href="https://red.ht/self-service_build_and_use_ee_definition"
                target="_blank"
                rel="noopener noreferrer"
              >
                How to build and use Execution Environment from definition files
              </Link>
            </Flex>
          </Flex>
        </Grid.Item>
        <Grid.Item>
          <img
            src={eeIllustration}
            alt="Execution environment illustration"
            style={{ maxWidth: '100%' }}
          />
        </Grid.Item>
      </Grid.Root>
    </div>
  );
}
