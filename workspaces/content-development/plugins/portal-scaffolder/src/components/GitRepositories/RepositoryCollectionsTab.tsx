import { useMemo } from 'react';
import { Entity } from '@backstage/catalog-model';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
  useRouteRef,
} from '@backstage/core-plugin-api';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  ButtonIcon,
  Card,
  Cell,
  CellText,
  Flex,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
  Button,
  Table,
  Text,
  type ColumnConfig,
} from '@backstage/ui';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import Star from '@material-ui/icons/Star';
import StarBorder from '@material-ui/icons/StarBorder';

import { CollectionsEmptyState } from '../common';
import { CollectionsTypeFilter } from '../CollectionsCatalog/CollectionsListPage';
import { usePaginatedCollections } from '../CollectionsCatalog/usePaginatedCollections';
import { buildSourceString, formatTimeAgo, getSourceUrl } from '../CollectionsCatalog/utils';
import { rootRouteRef } from '../../routes';
import type { SyncStatusMap } from '../common';

export type RepositoryCollectionsTabProps = {
  repositoryEntity: Entity;
};

type CollectionRow = {
  id: string;
  entity: Entity;
  fullName: string;
  version: string;
  sourceLabel: string;
  sourceUrl?: string;
  lastSync: string;
  collectionPath: string;
};

function collectionLastSync(
  entity: Entity,
  syncStatusMap: SyncStatusMap,
): string {
  const sourceId =
    entity.metadata?.annotations?.['ansible.io/discovery-source-id'];
  const syncStatus = sourceId ? syncStatusMap[sourceId] : null;

  if (syncStatus?.lastSyncTime) {
    return formatTimeAgo(syncStatus.lastSyncTime);
  }
  if (!syncStatus?.lastSyncTime && !syncStatus?.lastFailedSyncTime) {
    return 'Never Synced';
  }
  return 'Not Available';
}

function mapEntityToRow(
  entity: Entity,
  syncStatusMap: SyncStatusMap,
  collectionPathPrefix: string,
): CollectionRow {
  const spec = entity.spec || {};
  const collectionNamespace =
    typeof spec.collection_namespace === 'string'
      ? spec.collection_namespace
      : '';
  const collectionName =
    typeof spec.collection_name === 'string' ? spec.collection_name : '';
  const fullName =
    typeof spec.collection_full_name === 'string' && spec.collection_full_name
      ? spec.collection_full_name
      : `${collectionNamespace}.${collectionName}`;
  const version =
    typeof spec.collection_version === 'string'
      ? spec.collection_version
      : 'N/A';
  const entityName = entity.metadata.name;

  return {
    id: entity.metadata.uid ?? entityName,
    entity,
    fullName,
    version: version === 'N/A' ? version : version,
    sourceLabel: buildSourceString(entity),
    sourceUrl: getSourceUrl(entity),
    lastSync: collectionLastSync(entity, syncStatusMap),
    collectionPath: `${collectionPathPrefix}/${entityName}`,
  };
}

function buildCollectionColumns(
  isStarredEntity: (entity: Entity) => boolean,
  toggleStarredEntity: (entity: Entity) => void,
  onNavigate: (path: string) => void,
): ColumnConfig<CollectionRow>[] {
  return [
    {
      id: 'fullName',
      label: 'Collection',
      isRowHeader: true,
      cell: row => (
        <Cell>
          <Link href={row.collectionPath}>{row.fullName}</Link>
        </Cell>
      ),
    },
    {
      id: 'version',
      label: 'Version',
      cell: row => <CellText title={row.version} />,
    },
    {
      id: 'sourceLabel',
      label: 'Source',
      cell: row =>
        row.sourceUrl ? (
          <Cell>
            <Link href={row.sourceUrl} target="_blank" rel="noopener noreferrer">
              {row.sourceLabel}
            </Link>
          </Cell>
        ) : (
          <CellText title={row.sourceLabel} />
        ),
    },
    {
      id: 'lastSync',
      label: 'Last sync',
      cell: row => <CellText title={row.lastSync} />,
    },
    {
      id: 'actions',
      label: 'Actions',
      cell: row => {
        const starred = isStarredEntity(row.entity);
        return (
          <Cell>
            <Flex align="center" gap="1">
              <ButtonIcon
                aria-label={
                  starred ? 'Remove from favorites' : 'Add to favorites'
                }
                onPress={() => toggleStarredEntity(row.entity)}
              >
                {starred ? (
                  <Star fontSize="small" style={{ color: '#ffb74d' }} />
                ) : (
                  <StarBorder fontSize="small" />
                )}
              </ButtonIcon>
              <MenuTrigger>
                <ButtonIcon aria-label="Collection actions">
                  <MoreVertIcon fontSize="small" />
                </ButtonIcon>
                <Menu>
                  <MenuItem onAction={() => onNavigate(row.collectionPath)}>
                    View collection
                  </MenuItem>
                  {row.sourceUrl ? (
                    <MenuItem
                      onAction={() =>
                        globalThis.open(
                          row.sourceUrl,
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                    >
                      View in source
                    </MenuItem>
                  ) : null}
                </Menu>
              </MenuTrigger>
            </Flex>
          </Cell>
        );
      },
    },
  ];
}

export const RepositoryCollectionsTab = ({
  repositoryEntity,
}: RepositoryCollectionsTabProps) => {
  const catalogApi = useApi(catalogApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
  const { isStarredEntity, toggleStarredEntity } = useStarredEntities();

  const {
    entities: paginatedEntities,
    totalCount,
    initialLoading,
    pageLoading,
    error,
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    syncStatusMap,
  } = usePaginatedCollections({
    catalogApi,
    discoveryApi,
    fetchApi,
    filterByRepositoryEntity: repositoryEntity,
  });

  const collectionPathPrefix = `${rootLink()}/collections`;

  const tableRows = useMemo(
    () =>
      paginatedEntities.map(entity =>
        mapEntityToRow(entity, syncStatusMap, collectionPathPrefix),
      ),
    [paginatedEntities, syncStatusMap, collectionPathPrefix],
  );

  const columns = useMemo(
    () =>
      buildCollectionColumns(
        isStarredEntity,
        toggleStarredEntity,
        path => navigate(path),
      ),
    [isStarredEntity, toggleStarredEntity, navigate],
  );

  if (error) {
    return (
      <Alert status="danger" title="Unable to load collections" description={error} />
    );
  }

  if (initialLoading) {
    return <Text role="status">Loading collections...</Text>;
  }

  if (totalCount === 0) {
    return (
      <>
        <CollectionsTypeFilter />
        <Text color="secondary">
          Review the Ansible collections discovered in this repository.
        </Text>
        <CollectionsEmptyState repositoryFilter />
      </>
    );
  }

  return (
    <Flex direction="column" gap="4" style={{ width: '100%' }}>
      <CollectionsTypeFilter />
      <Text color="secondary">
        Review the Ansible collections discovered in this repository.
      </Text>
      <Card>
        <Table
          columnConfig={columns}
          data={tableRows}
          isPending={pageLoading}
          pagination={{ type: 'none' }}
          emptyState={
            <Text role="status">No collections found for this repository.</Text>
          }
        />
      </Card>
      {totalPages > 1 ? (
        <Flex align="center" justify="end" gap="2">
          <Text color="secondary">
            Page {currentPage} of {totalPages} ({totalCount} collections)
          </Text>
          <Button
            variant="secondary"
            onPress={prevPage}
            isDisabled={!hasPrevPage || pageLoading}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            onPress={nextPage}
            isDisabled={!hasNextPage || pageLoading}
          >
            Next
          </Button>
        </Flex>
      ) : null}
    </Flex>
  );
};