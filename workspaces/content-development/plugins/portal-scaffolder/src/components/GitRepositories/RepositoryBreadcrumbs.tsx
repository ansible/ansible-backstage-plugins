import { Flex, Link, Text } from '@backstage/ui';

export interface RepositoryBreadcrumbsProps {
  repositoryName: string;
  onNavigateToCatalog: () => void;
  catalogHref?: string;
}

export const RepositoryBreadcrumbs = ({
  repositoryName,
  onNavigateToCatalog,
  catalogHref = '#',
}: RepositoryBreadcrumbsProps) => {
  return (
    <nav aria-label="Breadcrumb">
      <Flex align="center" gap="1" mb="2">
        <Link
          href={catalogHref}
          onClick={event => {
            event.preventDefault();
            onNavigateToCatalog();
          }}
        >
          Repositories
        </Link>
        <Text color="secondary" aria-hidden>
          /
        </Text>
        <Text weight="bold">{repositoryName}</Text>
      </Flex>
    </nav>
  );
};
