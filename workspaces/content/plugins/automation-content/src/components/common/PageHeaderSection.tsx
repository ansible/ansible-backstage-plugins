import {
  Button,
  ButtonIcon,
  Flex,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import type { ReactElement } from 'react';
import { HelpIcon } from './icons';
import type { PageHeaderSectionProps } from './types';

/** Route title and optional actions; essential help/status remains visible. */
export function PageHeaderSection({
  title,
  description,
  tooltip,
  help,
  actions,
  status,
  descriptionExtra,
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
}: PageHeaderSectionProps): ReactElement {
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
              <ButtonIcon
                variant="tertiary"
                icon={<HelpIcon />}
                aria-label={`About ${title}`}
              />
              <Tooltip>{tooltip}</Tooltip>
            </TooltipTrigger>
          )}
        </Flex>
        <Flex align="center" gap="3">
          {actions}
          {onSyncClick && (
            <Button
              variant="secondary"
              onPress={onSyncClick}
              isDisabled={syncDisabled}
              isPending={syncInProgress}
            >
              Sync Now
            </Button>
          )}
        </Flex>
      </Flex>
      {(description || descriptionExtra) && (
        <Text as="p">
          {description}
          {descriptionExtra && <> {descriptionExtra}</>}
        </Text>
      )}
      {help && (
        <Text as="p" color="secondary">
          {help}
        </Text>
      )}
      {status && <div role="status">{status}</div>}
      {syncDisabled && syncDisabledReason && (
        <Text as="p" color="secondary">
          {syncDisabledReason}
        </Text>
      )}
      {syncInProgress && !status && (
        <Text as="p" role="status">
          Sync in progress
        </Text>
      )}
    </Flex>
  );
}
