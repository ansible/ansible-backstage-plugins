import { ReactElement } from 'react';
import useAsync from 'react-use/lib/useAsync';
import { Chip, Grid, Typography } from '@material-ui/core';
import {
  EmptyState,
  InfoCard,
  ResponseErrorPanel,
  StructuredMetadataTable,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { SkeletonLoader } from '@ansible/portal-plugin-sdk';
import {
  automationContentApiRef,
  ContentItemSummary,
  ExecutionEnvironment,
} from '../api';

/** Classifications with standalone artifact browsers. */
export type StandaloneArtifactType = 'skill' | 'collection';

/** Browse one artifact classification without mixing it with execution environments. */
export function ArtifactListView({
  type,
  onOpen,
}: {
  type: StandaloneArtifactType;
  onOpen: (ref: string) => void;
}): ReactElement {
  const api = useApi(automationContentApiRef);
  const result = useAsync(() => api.listArtifacts(type), [api, type]);
  if (result.loading) return <SkeletonLoader />;
  if (result.error) return <ResponseErrorPanel error={result.error} />;
  const columns: TableColumn<ExecutionEnvironment>[] = [
    { title: 'Repository', field: 'repository' },
    { title: 'Registry', field: 'registry' },
    {
      title: 'Tags',
      render: artifact => artifact.tags?.join(', ') || 'untagged',
    },
    {
      title: 'Enumeration',
      render: artifact => (
        <Chip
          size="small"
          variant="outlined"
          label={artifact.enumeration?.status ?? 'unknown'}
        />
      ),
    },
  ];
  return (
    <InfoCard
      title={type === 'skill' ? 'Skills' : 'Collection artifacts'}
      subheader="Discovered from configured registries. Select an artifact to inspect its metadata and indexed items."
    >
      {!result.value?.length ? (
        <EmptyState
          missing="data"
          title={`No ${type} artifacts discovered`}
          description="Only artifacts classified as this content type are shown."
        />
      ) : (
        <Table
          columns={columns}
          data={result.value}
          options={{
            search: true,
            paging: true,
            pageSize: 10,
            padding: 'dense',
          }}
          onRowClick={(_event, row) => row && onOpen(row.ref)}
        />
      )}
    </InfoCard>
  );
}

/** Show registry metadata and indexed items without treating missing enumeration as empty. */
export function ArtifactDetailView({
  artifactRef,
  onOpenItem,
}: {
  artifactRef: string;
  onOpenItem: (fqcn: string, itemType: string) => void;
}): ReactElement {
  const api = useApi(automationContentApiRef);
  const artifact = useAsync(
    () => api.getArtifact(artifactRef),
    [api, artifactRef],
  );
  const items = useAsync(
    () => api.searchContentItems({ in: artifactRef, limit: 500 }),
    [api, artifactRef],
  );
  if (artifact.loading) return <SkeletonLoader />;
  if (artifact.error) return <ResponseErrorPanel error={artifact.error} />;
  const value = artifact.value!;
  const status = value.enumeration?.status ?? 'unknown';
  const metadata = value.metadata ?? {};
  const annotations = value.annotations ?? {};
  const columns: TableColumn<ContentItemSummary>[] = [
    { title: 'Name', field: 'name' },
    { title: 'Type', field: 'type' },
    { title: 'Description', field: 'shortDescription' },
    {
      title: 'Version',
      render: item => item.version ?? item.collectionVersion ?? 'unknown',
    },
  ];
  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <InfoCard title="Artifact">
          <StructuredMetadataTable
            metadata={{
              registry: value.registry,
              repository: value.repository,
              digest: value.digest,
              tags: value.tags?.join(', ') || 'untagged',
              title:
                metadata.title ??
                annotations['org.opencontainers.image.title'] ??
                'unknown',
              description:
                metadata.description ??
                value.description ??
                annotations['org.opencontainers.image.description'] ??
                'unknown',
              version:
                metadata.version ??
                value.version ??
                annotations['org.opencontainers.image.version'] ??
                'unknown',
              source:
                metadata.source ??
                annotations['org.opencontainers.image.source'] ??
                'unknown',
              pull: value.pullReference,
              enumeration: status,
              'enumeration source': value.enumeration?.source ?? 'unknown',
            }}
          />
        </InfoCard>
      </Grid>
      <Grid item>
        <InfoCard
          title="Indexed items"
          subheader="Select an item to inspect its extracted documentation."
        >
          {status !== 'complete' && (
            <Typography color="textSecondary" paragraph>
              {status === 'partial'
                ? 'Enumeration is partial. More items may exist.'
                : 'Contents are unknown. Missing enumeration does not mean this artifact is empty.'}
            </Typography>
          )}
          {items.loading && <SkeletonLoader />}
          {items.error && <ResponseErrorPanel error={items.error} />}
          {!items.loading &&
            !items.error &&
            (items.value?.items.length ? (
              <Table
                columns={columns}
                data={items.value.items}
                options={{
                  search: true,
                  paging: true,
                  pageSize: 10,
                  padding: 'dense',
                }}
                onRowClick={(_event, row) =>
                  row && onOpenItem(row.fqcn, row.type)
                }
              />
            ) : (
              status === 'complete' && (
                <Typography>No indexed items.</Typography>
              )
            ))}
          {items.value && items.value.totalItems > items.value.items.length && (
            <Typography color="textSecondary">
              Showing {items.value.items.length} of {items.value.totalItems}{' '}
              indexed items.
            </Typography>
          )}
        </InfoCard>
      </Grid>
    </Grid>
  );
}
