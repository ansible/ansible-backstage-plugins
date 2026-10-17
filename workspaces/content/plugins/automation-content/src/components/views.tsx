import { useCallback, useEffect, useRef, useState } from 'react';
import useAsync from 'react-use/lib/useAsync';
import useAsyncFn from 'react-use/lib/useAsyncFn';
import useDebounce from 'react-use/lib/useDebounce';
import {
  Box,
  Chip,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import RefreshIcon from '@material-ui/icons/Refresh';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import {
  EmptyState,
  InfoCard,
  ResponseErrorPanel,
  StructuredMetadataTable,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { SkeletonLoader, useNotifications } from '@ansible/portal-plugin-sdk';
import {
  automationContentApiRef,
  ContentItemSummary,
  ExecutionEnvironment,
  Registry,
} from '../api';
import { OptionTree } from './OptionTree';

/** Accept a string, an array, or nothing, and always return an array of strings. */
function toLines(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/** Human-friendly age, e.g. "4 minutes ago". */
function since(iso?: string): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'unknown';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.floor(hours / 24)} day(s) ago`;
}

const useStyles = makeStyles(theme => ({
  mono: {
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    wordBreak: 'break-all',
  },
  counts: { display: 'flex', flexWrap: 'wrap', gap: theme.spacing(0.5) },
  unknown: { color: theme.palette.text.secondary, fontStyle: 'italic' },
  clickable: { cursor: 'pointer' },
  pull: {
    fontFamily: 'monospace',
    fontSize: '0.78rem',
    background: theme.palette.background.default,
    padding: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '0.78rem',
    whiteSpace: 'pre-wrap',
    background: theme.palette.background.default,
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    maxHeight: 320,
    overflow: 'auto',
  },
  section: { marginTop: theme.spacing(3) },
  controls: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
  },
}));

/**
 * Where a content inventory came from.
 *
 * Shown rather than hidden because fidelity genuinely differs: an inventory generated
 * inside the image by its own ansible-core is exact, while one derived by inspecting
 * the image afterwards is an approximation.
 */
const ProvenanceChip = ({ env }: { env: ExecutionEnvironment }) => {
  if (!env.contentsKnown) {
    return (
      <Tooltip title="No content manifest is published for this image, so its contents could not be determined. That is not the same as it containing nothing.">
        <Chip size="small" label="contents unknown" variant="outlined" />
      </Tooltip>
    );
  }
  const exact = env.enumeration?.source === 'build-time-manifest';
  return (
    <Tooltip
      title={
        exact
          ? `Generated at build time inside the image using ansible-core ${env.enumeration?.ansibleCore}. Exact.`
          : 'Derived by inspecting the image from outside. Approximate: doc-fragment resolution varies by ansible-core version.'
      }
    >
      <Chip
        size="small"
        color={exact ? 'primary' : 'default'}
        variant={exact ? 'default' : 'outlined'}
        label={
          exact ? 'build-time manifest' : (env.enumeration?.source ?? 'unknown')
        }
      />
    </Tooltip>
  );
};

/**
 * Manual refresh.
 *
 * The index is rebuilt on a schedule and by a cheap drift poll, but neither helps
 * someone who just pushed an image and wants to see it now. This forces a full re-read
 * and reports what came back, so the user is never left guessing whether it worked.
 */
const RefreshButton = ({ onDone }: { onDone: () => void }) => {
  const api = useApi(automationContentApiRef);
  const { showNotification } = useNotifications();
  const [state, run] = useAsyncFn(async () => {
    try {
      const result = await api.syncAll();
      onDone();
      showNotification({
        title: 'Content refreshed',
        description: `Refreshed in ${result.durationMs} ms — ${result.registries
          .map(
            r =>
              `${r.registry}: ${
                r.ok ? `${r.discovered} artifact(s)` : `failed (${r.error})`
              }`,
          )
          .join('; ')}`,
        severity: result.registries.some(r => !r.ok) ? 'warning' : 'success',
        autoHideDuration: 6000,
      });
      return result;
    } catch (err) {
      showNotification({
        title: 'Refresh failed',
        description: err instanceof Error ? err.message : String(err),
        severity: 'error',
      });
      throw err;
    }
  }, [api, onDone, showNotification]);

  return (
    <Button
      size="small"
      variant="outlined"
      startIcon={
        state.loading ? (
          <CircularProgress size={14} />
        ) : (
          <RefreshIcon fontSize="small" />
        )
      }
      disabled={state.loading}
      onClick={() => run()}
    >
      {state.loading ? 'Refreshing…' : 'Refresh'}
    </Button>
  );
};

// ---------------------------------------------------------------------------
// Level 0 — execution environments
// ---------------------------------------------------------------------------

/** Tooltip text for a registry's referrers discovery capability. */
const referrersTooltip = (referrers: string | undefined): string => {
  if (referrers === 'native') return 'OCI 1.1 referrers endpoint available';
  if (referrers === 'tag-fallback')
    return 'No referrers endpoint; using the sha256- tag fallback defined by the spec';
  return 'No way to discover artifacts referring to an image';
};

const RegistriesCard = ({ registries }: { registries: Registry[] }) => (
  <InfoCard
    title="Registries"
    subheader="Capabilities are discovered by probing, never assumed. Features degrade to match."
  >
    {(registries ?? []).map(registry => {
      const caps = registry.capabilities;
      return (
        <Box key={registry.name} mb={2}>
          <Typography variant="subtitle2">{registry.name}</Typography>
          <Typography
            variant="caption"
            color="textSecondary"
            component="div"
            gutterBottom
          >
            {registry.url}
          </Typography>
          <Tooltip title={registry.lastReconciledAt ?? 'never reconciled'}>
            <Typography variant="caption" color="textSecondary" component="div">
              Last reconciled {since(registry.lastReconciledAt)}
              {registry.lastReconcileOk === false && ' · last attempt failed'}
              {registry.lastCheckedAt &&
                ` · checked for changes ${since(registry.lastCheckedAt)}`}
            </Typography>
          </Tooltip>
          {registry.lastReconcileOk === false &&
            registry.lastReconcileError && (
              <Typography variant="caption" color="error" component="div">
                {registry.lastReconcileError}
              </Typography>
            )}
          {caps && (
            <Box display="flex" flexWrap="wrap" gridGap={4} mt={1}>
              <Tooltip title={referrersTooltip(caps.referrers)}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`referrers: ${caps.referrers}`}
                />
              </Tooltip>
              <Chip
                size="small"
                variant="outlined"
                label={`catalog: ${caps.catalogEnumeration ? 'yes' : 'no'}`}
              />
              <Tooltip title="Never probed — probing deletion would be destructive. Declare it in configuration to enable delete actions.">
                <Chip
                  size="small"
                  variant="outlined"
                  label={`delete: ${caps.delete}`}
                />
              </Tooltip>
              <Chip
                size="small"
                variant="outlined"
                label={caps.notifications}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`auth: ${(caps.auth ?? []).join('/')}`}
              />
            </Box>
          )}
        </Box>
      );
    })}
  </InfoCard>
);

export const OverviewView = ({
  onOpenEnvironment,
}: {
  onOpenEnvironment: (ref: string) => void;
}) => {
  const classes = useStyles();
  const api = useApi(automationContentApiRef);
  // Bumped after a manual refresh so both queries re-run against the rebuilt index.
  const [reloadKey, setReloadKey] = useState(0);
  const environments = useAsync(
    () => api.listExecutionEnvironments(),
    [api, reloadKey],
  );
  const registries = useAsync(() => api.listRegistries(), [api, reloadKey]);
  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  const columns: TableColumn<ExecutionEnvironment>[] = [
    {
      title: 'Image',
      render: env => (
        <>
          <Typography variant="body2">{env.repository}</Typography>
          <Typography variant="caption" color="textSecondary">
            {(env.tags ?? []).join(', ') || 'untagged'} · {env.registry}
          </Typography>
        </>
      ),
    },
    {
      title: 'Contents',
      render: env =>
        env.counts ? (
          <div className={classes.counts}>
            <Chip
              size="small"
              label={`${env.counts.collections ?? 0} collections`}
            />
            <Chip size="small" label={`${env.counts.plugins ?? 0} plugins`} />
            {Boolean(env.counts.edaPlugins) && (
              <Chip size="small" label={`${env.counts.edaPlugins} EDA`} />
            )}
            {Boolean(env.counts.rulebooks) && (
              <Chip size="small" label={`${env.counts.rulebooks} rulebooks`} />
            )}
          </div>
        ) : (
          <span className={classes.unknown}>not determined</span>
        ),
    },
    { title: 'Provenance', render: env => <ProvenanceChip env={env} /> },
    {
      title: 'ansible-core',
      render: env => (
        <span className={classes.mono}>
          {env.enumeration?.ansibleCore ?? '—'}
        </span>
      ),
    },
    {
      title: 'Digest',
      render: env => (
        <Tooltip title={env.pullReference ?? ''}>
          <span className={classes.mono}>
            {(env.digest ?? '').slice(7, 19)}
          </span>
        </Tooltip>
      ),
    },
  ];

  if (environments.error)
    return <ResponseErrorPanel error={environments.error} />;
  if (environments.loading) return <SkeletonLoader />;

  const items = environments.value ?? [];

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <InfoCard
          title="Execution environments"
          subheader="Discovered from configured OCI registries. Select one to see the collections it ships. The portal never proxies image data — clients pull from the registry directly."
          action={
            <Box mr={2} mt={2}>
              <RefreshButton onDone={reload} />
            </Box>
          }
        >
          {items.length === 0 ? (
            <EmptyState
              missing="data"
              title="No execution environments discovered"
              description="Check the registry configuration, or trigger a sync. Images that are not recognised as execution environments are excluded."
            />
          ) : (
            <Table
              options={{
                paging: false,
                search: false,
                toolbar: false,
                padding: 'dense',
                rowStyle: { cursor: 'pointer' },
              }}
              columns={columns}
              data={items}
              onRowClick={(_e, row) => row && onOpenEnvironment(row.ref)}
            />
          )}
        </InfoCard>
      </Grid>

      <Grid item>
        <RegistriesCard registries={registries.value ?? []} />
      </Grid>
    </Grid>
  );
};

// ---------------------------------------------------------------------------
// Level 1 — one execution environment: its collections
// ---------------------------------------------------------------------------

export const EnvironmentView = ({
  environmentRef,
  onOpenCollection,
}: {
  environmentRef: string;
  onOpenCollection: (fqcn: string) => void;
}) => {
  const classes = useStyles();
  const api = useApi(automationContentApiRef);

  const env = useAsync(
    () => api.getExecutionEnvironment(environmentRef),
    [api, environmentRef],
  );
  const contents = useAsync(
    () => api.getContents(environmentRef, { depth: 'direct' }),
    [api, environmentRef],
  );

  if (env.error) return <ResponseErrorPanel error={env.error} />;
  if (env.loading) return <SkeletonLoader />;

  const image = env.value!;
  const exact = image.enumeration?.source === 'build-time-manifest';
  const collections = contents.value?.collections ?? [];

  type Row = (typeof collections)[number];
  const columns: TableColumn<Row>[] = [
    {
      title: 'Collection',
      render: c => (
        <>
          <Typography className={classes.mono}>{c.fqcn}</Typography>
          <Typography variant="caption" color="textSecondary">
            {c.version}
          </Typography>
        </>
      ),
    },
    {
      title: 'Modules & plugins',
      width: '160px',
      render: c => c.counts?.plugins ?? 0,
    },
    { title: 'Roles', width: '90px', render: c => c.counts?.roles ?? 0 },
    {
      title: 'Playbooks',
      width: '110px',
      render: c => c.counts?.playbooks ?? 0,
    },
    {
      title: 'EDA plugins',
      width: '130px',
      render: c => c.counts?.edaPlugins ?? 0,
    },
    {
      title: 'Rulebooks',
      width: '110px',
      render: c => c.counts?.rulebooks ?? 0,
    },
  ];

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <InfoCard title="Image">
          <StructuredMetadataTable
            metadata={{
              registry: image.registry,
              repository: image.repository,
              tags: (image.tags ?? []).join(', ') || '—',
              digest: <span className={classes.mono}>{image.digest}</span>,
              'ansible-core': image.enumeration?.ansibleCore ?? '—',
              'last reconciled': (
                <Tooltip title={image.lastReconciledAt ?? 'never reconciled'}>
                  <span>{since(image.lastReconciledAt)}</span>
                </Tooltip>
              ),
              provenance: (
                <Tooltip
                  title={
                    exact
                      ? 'Generated at build time inside the image by its own ansible-core. Exact.'
                      : 'Derived from outside the image. Approximate.'
                  }
                >
                  <Chip
                    size="small"
                    color={exact ? 'primary' : 'default'}
                    variant={exact ? 'default' : 'outlined'}
                    label={image.enumeration?.source ?? 'unknown'}
                  />
                </Tooltip>
              ),
              pull: (
                <div className={classes.pull}>
                  <span>{image.pullReference}</span>
                  <IconButton
                    size="small"
                    aria-label="Copy pull reference"
                    onClick={() =>
                      navigator.clipboard?.writeText(image.pullReference ?? '')
                    }
                  >
                    <FileCopyIcon fontSize="small" />
                  </IconButton>
                </div>
              ),
            }}
          />
          <Box mt={1}>
            <Typography variant="caption" color="textSecondary">
              The portal is never in the data path — pull straight from the
              registry.
            </Typography>
          </Box>
        </InfoCard>
      </Grid>

      <Grid item>
        <InfoCard
          title="Collections"
          subheader="What this environment ships. Select one to see its modules, plugins and roles."
        >
          {contents.loading && <SkeletonLoader />}
          {contents.error && <ResponseErrorPanel error={contents.error} />}
          {!contents.loading && collections.length === 0 && (
            <Typography className={classes.unknown}>
              {contents.value?.enumeration?.status === 'unknown'
                ? 'Contents could not be determined — no content manifest is published for this image. That is not the same as it containing nothing.'
                : 'No collections.'}
            </Typography>
          )}
          {collections.length > 0 && (
            <Table
              options={{
                paging: false,
                search: false,
                toolbar: false,
                padding: 'dense',
                rowStyle: { cursor: 'pointer' },
              }}
              columns={columns}
              data={collections}
              onRowClick={(_e, row) => row && onOpenCollection(row.fqcn)}
            />
          )}
        </InfoCard>
      </Grid>
    </Grid>
  );
};

// ---------------------------------------------------------------------------
// Level 2 — one collection: its content items
// ---------------------------------------------------------------------------

const TYPES = [
  'module',
  'filter',
  'lookup',
  'test',
  'connection',
  'cliconf',
  'netconf',
  'httpapi',
  'become',
  'cache',
  'callback',
  'inventory',
  'shell',
  'strategy',
  'vars',
  'role',
  'playbook',
  'event_source',
  'event_filter',
];

export const CollectionView = ({
  environmentRef,
  collectionFqcn,
  onOpenItem,
}: {
  environmentRef: string;
  collectionFqcn: string;
  onOpenItem: (fqcn: string) => void;
}) => {
  const classes = useStyles();
  const api = useApi(automationContentApiRef);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');

  const [search, runSearch] = useAsyncFn(
    (params: { q?: string; type?: string }) =>
      api.searchContentItems({
        ...params,
        in: environmentRef,
        collection: collectionFqcn,
        limit: 500,
      }),
    [api, environmentRef, collectionFqcn],
  );
  const initial = useAsync(
    () =>
      api.searchContentItems({
        in: environmentRef,
        collection: collectionFqcn,
        limit: 500,
      }),
    [api, environmentRef, collectionFqcn],
  );
  const result = search.value ?? initial.value;
  const items = result?.items ?? [];

  // Debounce the filter inputs: each keystroke would otherwise fire a full
  // index search with limit 500.
  const debouncedQ = useDebounce(q, 250);
  const debouncedType = useDebounce(type, 250);
  const firstEffectRun = useRef(true);
  useEffect(() => {
    // `initial` already covers the first load; only re-run on later changes.
    if (firstEffectRun.current) {
      firstEffectRun.current = false;
      return;
    }
    runSearch({
      q: debouncedQ || undefined,
      type: debouncedType || undefined,
    });
  }, [debouncedQ, debouncedType, runSearch]);

  const push = useCallback(
    (next: { q?: string; type?: string }) => {
      const merged = { q, type, ...next };
      setQ(merged.q ?? '');
      setType(merged.type ?? '');
      // The search itself re-runs through the debounced effect above.
    },
    [q, type],
  );

  const columns: TableColumn<ContentItemSummary>[] = [
    {
      title: 'Name',
      render: item => (
        <>
          <Typography className={classes.mono}>{item.fqcn}</Typography>
          {item.shortDescription && (
            <Typography variant="caption" color="textSecondary">
              {item.shortDescription}
            </Typography>
          )}
        </>
      ),
    },
    {
      title: 'Type',
      width: '150px',
      render: item => (
        <Chip size="small" label={item.type} variant="outlined" />
      ),
    },
    {
      title: 'Added',
      width: '100px',
      render: item => (
        <Typography variant="caption">{item.versionAdded ?? '—'}</Typography>
      ),
    },
  ];

  // Counts per type, so the shape of the collection is visible at a glance.
  const byType = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.type] = (acc[i.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <InfoCard
      title={collectionFqcn}
      subheader="Modules, plugins, roles and EDA plugins in this collection. Select one for its full argument specification."
    >
      {initial.error && <ResponseErrorPanel error={initial.error} />}

      <Box display="flex" flexWrap="wrap" gridGap={4} mb={2}>
        {Object.entries(byType).map(([t, n]) => (
          <Chip
            key={t}
            size="small"
            variant={type === t ? 'default' : 'outlined'}
            color={type === t ? 'primary' : 'default'}
            label={`${n} ${t}`}
            onClick={() => push({ type: type === t ? '' : t })}
          />
        ))}
      </Box>

      <Box className={classes.controls}>
        <TextField
          label="Search"
          placeholder="e.g. vlans, bgp, ipaddr"
          value={q}
          size="small"
          variant="outlined"
          style={{ minWidth: 280 }}
          onChange={e => push({ q: e.target.value })}
        />
        <TextField
          select
          label="Type"
          value={type}
          size="small"
          variant="outlined"
          style={{ minWidth: 180 }}
          onChange={e => push({ type: e.target.value })}
        >
          <MenuItem value="">All types</MenuItem>
          {TYPES.map(t => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        <Box display="flex" alignItems="center">
          <Typography variant="body2" color="textSecondary">
            {result?.totalItems ?? 0} matching
          </Typography>
        </Box>
      </Box>

      {(initial.loading || search.loading) && <SkeletonLoader />}

      <Table
        options={{
          paging: true,
          pageSize: 15,
          search: false,
          toolbar: false,
          padding: 'dense',
          rowStyle: { cursor: 'pointer' },
        }}
        columns={columns}
        data={items}
        onRowClick={(_e, row) => row && onOpenItem(row.fqcn)}
      />
    </InfoCard>
  );
};

// ---------------------------------------------------------------------------
// Level 3 — one content item: its documentation
// ---------------------------------------------------------------------------

export const ContentItemView = ({
  environmentRef,
  fqcn,
}: {
  environmentRef: string;
  fqcn: string;
}) => {
  const classes = useStyles();
  const api = useApi(automationContentApiRef);
  const item = useAsync(
    () => api.getContentItem(fqcn, environmentRef),
    [api, fqcn, environmentRef],
  );

  if (item.loading) return <SkeletonLoader />;
  if (item.error) return <ResponseErrorPanel error={item.error} />;

  const doc = item.value!;
  const options = doc.options ?? {};
  // Belt and braces: the backend normalises these, but a manifest published by an older
  // toolchain can still carry a bare string, and a type error must not take down the page.
  const description = toLines(doc.description);
  const author = toLines(doc.author);
  const providedBy = toLines(doc.providedBy);

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <InfoCard title={doc.fqcn} subheader={doc.shortDescription}>
          <Box display="flex" flexWrap="wrap" gridGap={8} mb={2}>
            <Chip size="small" label={doc.type} />
            <Chip
              size="small"
              variant="outlined"
              label={`${doc.collection} ${doc.collectionVersion}`}
            />
            {doc.versionAdded && (
              <Chip
                size="small"
                variant="outlined"
                label={`added ${doc.versionAdded}`}
              />
            )}
            {/* Provenance stays visible: documentation extracted by a different
                ansible-core than the image ships can be subtly wrong. */}
            <Tooltip title="Documentation was resolved by the ansible-core inside this image, so it matches what will actually run.">
              <Chip
                size="small"
                variant="outlined"
                label={`${doc.enumeration?.source ?? 'unknown'}${
                  doc.enumeration?.ansibleCore
                    ? ` · ansible-core ${doc.enumeration.ansibleCore}`
                    : ''
                }`}
              />
            </Tooltip>
          </Box>

          {description.length > 0 && (
            <Typography variant="body2" paragraph>
              {description.join(' ')}
            </Typography>
          )}

          {author.length > 0 && (
            <Typography variant="caption" color="textSecondary" component="div">
              {author.join(', ')}
            </Typography>
          )}
        </InfoCard>
      </Grid>

      {Object.keys(options).length > 0 && (
        <Grid item>
          <InfoCard title="Arguments">
            {Object.entries(options).map(([name, spec]) => (
              <Box key={name} mb={2}>
                <OptionTree name={name} spec={spec} />
              </Box>
            ))}
          </InfoCard>
        </Grid>
      )}

      {doc.examples && (
        <Grid item>
          <InfoCard title="Examples">
            <div className={classes.code}>{doc.examples.slice(0, 8000)}</div>
          </InfoCard>
        </Grid>
      )}

      {doc.returns && Object.keys(doc.returns).length > 0 && (
        <Grid item>
          <InfoCard title="Return values">
            <div className={classes.code}>
              {JSON.stringify(doc.returns, null, 2).slice(0, 6000)}
            </div>
          </InfoCard>
        </Grid>
      )}

      {providedBy.length > 0 && (
        <Grid item>
          <InfoCard title="Available in">
            <Divider />
            <Box mt={1}>
              {providedBy.map(ref => (
                <Typography
                  key={ref}
                  variant="caption"
                  component="div"
                  className={classes.mono}
                >
                  {ref}
                </Typography>
              ))}
            </Box>
          </InfoCard>
        </Grid>
      )}
    </Grid>
  );
};
