import { MarkdownContent } from '@backstage/core-components';
import {
  Card,
  CardBody,
  CardHeader,
  Flex,
  Skeleton,
  Text,
} from '@backstage/ui';

export interface RepositoryReadmeCardProps {
  readmeContent: string;
  isLoading?: boolean;
}

export const RepositoryReadmeCard = ({
  readmeContent,
  isLoading = false,
}: RepositoryReadmeCardProps) => {
  const renderContent = () => {
    if (isLoading) {
      return (
        <Flex direction="column" gap="2" p="4">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </Flex>
      );
    }

    if (readmeContent) {
      return <MarkdownContent content={readmeContent} />;
    }

    return (
      <Flex justify="center" p="6">
        <Text color="secondary">Readme Not Available</Text>
      </Flex>
    );
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="title-medium">README</Text>
      </CardHeader>
      <CardBody style={{ padding: 0 }}>{renderContent()}</CardBody>
    </Card>
  );
};
