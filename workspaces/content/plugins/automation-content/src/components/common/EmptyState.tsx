import { Box, Button, Flex, Text } from '@backstage/ui';
import type { ReactElement } from 'react';
import { SearchIcon, SettingsIcon } from './icons';
import type { EmptyStateProps } from './types';
import './common.css';

function getDefaultTitle(
  repositoryFilter: string | undefined,
  missingSources: boolean,
): string {
  if (repositoryFilter) return 'No collections discovered from this repository';
  if (missingSources) return 'No content sources configured';
  return 'No Collections Found';
}

function getDefaultDescription(
  repositoryFilter: string | undefined,
  missingSources: boolean,
  canSync: boolean,
): string {
  if (repositoryFilter) {
    return 'Collections from this repository will appear here after the catalog sync discovers them.';
  }
  if (missingSources) {
    if (canSync) {
      return 'No content sources are defined in the application configuration. To view collections, configure a provider in the app-config.yaml file.';
    }
    return 'Content sources are not currently configured for this environment. Contact your organization administrator to add content providers.';
  }
  if (canSync) {
    return 'No collections were retrieved from the configured sources. Sync the catalog to fetch the latest contents.';
  }
  return 'No collections are available in the catalog. Contact your organization administrator to sync the content sources.';
}

/** Accessible local empty state with a caller-owned, relevant recovery action. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  repositoryFilter,
  hasConfiguredSources,
  canSync = false,
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
}: EmptyStateProps): ReactElement {
  const missingSources = hasConfiguredSources === false;
  const defaultTitle = getDefaultTitle(repositoryFilter, missingSources);
  const defaultDescription = getDefaultDescription(
    repositoryFilter,
    missingSources,
    canSync,
  );
  return (
    <Box p="6">
      <Flex
        direction="column"
        align="center"
        gap="3"
        className="automation-content-empty-state"
      >
        <span aria-hidden="true">
          {icon ??
            (missingSources && !repositoryFilter ? (
              <SettingsIcon />
            ) : (
              <SearchIcon />
            ))}
        </span>
        <Text variant="title-small" as="h2">
          {title ?? defaultTitle}
        </Text>
        <Text as="p">{description ?? defaultDescription}</Text>
        {action}
        {!action &&
          !repositoryFilter &&
          !missingSources &&
          canSync &&
          onSyncClick && (
            <Button
              variant="secondary"
              onPress={onSyncClick}
              isDisabled={syncDisabled}
              isPending={syncInProgress}
            >
              Sync Now
            </Button>
          )}
        {syncDisabled && syncDisabledReason && (
          <Text as="p" color="secondary">
            {syncDisabledReason}
          </Text>
        )}
        {syncInProgress && (
          <Text as="p" role="status">
            Sync in progress
          </Text>
        )}
      </Flex>
    </Box>
  );
}
