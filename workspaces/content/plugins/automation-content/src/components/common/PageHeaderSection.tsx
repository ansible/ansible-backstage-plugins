import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import { Button, Flex, Text, Tooltip, TooltipTrigger } from '@backstage/ui';
import type { PageHeaderSectionProps } from './types';

/** Route title and optional actions; essential help/status remains visible. */
export function PageHeaderSection({
  title,
  description,
  tooltip,
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
        <Flex align="center" gap="2">
          <Text variant="title-large" as="h1">
            {title}
          </Text>
          {tooltip && (
            <TooltipTrigger>
              <Button
                variant="tertiary"
                iconStart={<HelpOutlineIcon />}
                aria-label={`About ${title}`}
              />
              <Tooltip>{tooltip}</Tooltip>
            </TooltipTrigger>
          )}
        </Flex>
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
