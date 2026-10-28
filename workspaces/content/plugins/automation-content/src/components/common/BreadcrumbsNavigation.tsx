import { Flex, Link, Text } from '@backstage/ui';

/** Semantic ancestors with a non-interactive current item. */
export function BreadcrumbsNavigation({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <Flex direction={{ initial: 'column', md: 'row' }} gap="2">
        {items.map((item, index) =>
          index === items.length - 1 ? (
            <Text key={item.label} aria-current="page">
              {item.label}
            </Text>
          ) : (
            <Link key={item.label} href={item.href!}>
              {item.label}
            </Link>
          ),
        )}
      </Flex>
    </nav>
  );
}
