import { Button, Flex, Link, Text } from '@backstage/ui';
import type { ReactElement } from 'react';
import './common.css';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

function BreadcrumbLabel({
  item,
  isCurrent,
}: {
  item: BreadcrumbItem;
  isCurrent: boolean;
}): ReactElement {
  if (isCurrent) {
    return (
      <Text aria-current="page" truncate>
        {item.label}
      </Text>
    );
  }
  if (item.href && item.href !== '#') {
    return (
      <Link
        href={item.href}
        onClick={
          item.onClick
            ? event => {
                event.preventDefault();
                item.onClick?.();
              }
            : undefined
        }
      >
        {item.label}
      </Link>
    );
  }
  if (item.onClick) {
    return (
      <Button variant="tertiary" size="small" onPress={item.onClick}>
        {item.label}
      </Button>
    );
  }
  return <Text>{item.label}</Text>;
}

/** Semantic ancestors with a non-interactive current item. */
export function BreadcrumbsNavigation({
  items,
}: {
  items: BreadcrumbItem[];
}): ReactElement {
  return (
    <nav aria-label="Breadcrumb">
      <Flex align="center" gap="2" className="automation-content-breadcrumbs">
        {items.map((item, index) => (
          <Flex
            key={`${index}-${item.label}`}
            align="center"
            gap="2"
            className="automation-content-breadcrumb-item"
          >
            {index > 0 && <span aria-hidden="true">/</span>}
            <BreadcrumbLabel
              item={item}
              isCurrent={index === items.length - 1}
            />
          </Flex>
        ))}
      </Flex>
    </nav>
  );
}
