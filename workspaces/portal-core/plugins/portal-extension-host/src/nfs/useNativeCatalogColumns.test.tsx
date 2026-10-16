import '@testing-library/jest-dom';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import { portalEntitlementsApiRef } from '@ansible/portal-extension-api';
import {
  portalContributionsApiRef,
  type CatalogTableColumnDescriptor,
} from '@ansible/portal-extension-api/alpha';
import type { Entity } from '@backstage/catalog-model';
import { useNativeCatalogColumns } from './useNativeCatalogColumns';

describe('Native catalog column gating', () => {
  const permission = createPermission({
    name: 'scanner.read',
    resourceType: 'capability',
    attributes: { action: 'read' },
  });
  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'repo',
      annotations: {
        'backstage.io/source-location': 'url:https://github.com/team/repo',
      },
    },
  };
  const authorize = jest.fn();
  const check = jest.fn();
  let columns: CatalogTableColumnDescriptor[];
  let enabled: boolean;
  let includeProvider: boolean;
  const makeColumn = (): CatalogTableColumnDescriptor => ({
    attachment: 'catalog.table.columns',
    capabilityId: 'scanner.quality',
    entryPointId: 'scanner.column',
    loader: jest.fn(async context => (
      <span>Quality for {context.entity.metadata.name}</span>
    )),
    manifest: {
      id: 'scanner',
      apiVersion: '0.1.0',
      version: '1.0.0',
      entitlements: [],
      capabilities: [
        {
          id: 'scanner.quality',
          ownerPlugin: 'scanner',
          experienceId: 'content-quality-assessment',
          displayName: 'Quality',
          description: 'Quality',
          minimumHostApiVersion: '0.1.0',
          appliesToContentTypes: ['playbook-repository'],
          entryPoints: [
            {
              id: 'scanner.column',
              kind: 'table-column',
              surface: 'catalog-item',
              label: 'Violations',
              appliesToContentTypes: ['playbook-repository'],
              launches: { type: 'slot', targetSlot: 'catalog.table.columns' },
            },
          ],
        },
      ],
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider
      apis={[
        [configApiRef, { getOptionalBoolean: () => enabled }],
        [permissionApiRef, { authorize }],
        [portalEntitlementsApiRef, { check }],
        ...(includeProvider
          ? [[portalContributionsApiRef, { catalogColumns: columns }] as const]
          : []),
      ]}
    >
      {children}
    </TestApiProvider>
  );
  beforeEach(() => {
    jest.clearAllMocks();
    columns = [makeColumn()];
    enabled = true;
    includeProvider = true;
    authorize.mockResolvedValue({ result: AuthorizeResult.ALLOW });
    check.mockResolvedValue({ allowed: true });
  });

  it('renders a scoped cell lazily with the current entity and source context', async () => {
    columns[0].tooltip = 'Quality findings';
    columns[0].appliesToSourceKinds = ['git'];
    const { result } = renderHook(
      () => useNativeCatalogColumns('playbook-repository'),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({
      id: 'scanner.column',
      sorting: false,
    });
    render(
      <>
        {result.current[0].title}
        {result.current[0].render(entity)}
      </>,
      { wrapper },
    );
    expect(await screen.findByText('Quality for repo')).toBeInTheDocument();
    expect(screen.getByText('Violations')).toBeInTheDocument();
    expect(columns[0].loader).toHaveBeenCalledWith(
      expect.objectContaining({
        entity,
        contentType: 'playbook-repository',
        sourceKinds: ['git'],
      }),
    );
  });

  it('supports a plain title and entities without a source annotation', async () => {
    const { result } = renderHook(
      () => useNativeCatalogColumns('playbook-repository'),
      { wrapper },
    );
    await waitFor(() => expect(result.current[0]?.title).toBe('Violations'));
    render(
      <>
        {result.current[0].render({ ...entity, metadata: { name: 'shared' } })}
      </>,
      { wrapper },
    );
    expect(await screen.findByText('Quality for shared')).toBeInTheDocument();
    expect(columns[0].loader).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKinds: undefined }),
    );
  });

  it.each([
    'unsupported-type',
    'experience',
    'disabled',
    'permission-denied',
    'permission-failure',
    'missing-capability',
  ] as const)('does not load an ineligible column: %s', async reason => {
    const column = columns[0];
    if (reason === 'experience')
      column.manifest.capabilities[0].experienceId = 'not-installed';
    if (reason === 'disabled') {
      column.enabledByConfig = 'scanner.enabled';
      enabled = false;
    }
    if (reason.startsWith('permission'))
      column.manifest.capabilities[0].entryPoints[0].requiredPermission = {
        permission,
        resourceRef: 'repo',
      };
    if (reason === 'permission-denied')
      authorize.mockResolvedValue({ result: AuthorizeResult.DENY });
    if (reason === 'permission-failure')
      authorize.mockRejectedValue(new Error('Unavailable'));
    if (reason === 'missing-capability') column.capabilityId = 'missing';
    const { result } = renderHook(
      () =>
        useNativeCatalogColumns(
          reason === 'unsupported-type' ? 'collection' : 'playbook-repository',
        ),
      { wrapper },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual([]);
    expect(column.loader).not.toHaveBeenCalled();
  });

  it('checks direct permission requirements and stops exposing stale columns when the content type changes', async () => {
    const basicPermission = createPermission({
      name: 'scanner.list',
      attributes: { action: 'read' },
    });
    columns[0].manifest.capabilities[0].entryPoints[0].requiredPermission =
      basicPermission;
    const { result, rerender } = renderHook(
      ({ type }) => useNativeCatalogColumns(type),
      { wrapper, initialProps: { type: 'playbook-repository' } },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(authorize).toHaveBeenCalledWith({ permission: basicPermission });
    rerender({ type: 'collection' });
    expect(result.current).toEqual([]);
  });

  it('returns no columns when the optional contribution provider is absent', async () => {
    includeProvider = false;
    const { result } = renderHook(
      () => useNativeCatalogColumns('playbook-repository'),
      { wrapper },
    );
    expect(result.current).toEqual([]);
  });

  it('does not mount a cell or invoke its loader when its entitlement is denied', async () => {
    columns[0].requiredEntitlements = ['scanner.access'];
    columns[0].manifest.entitlements = [
      {
        id: 'scanner.access',
        scope: 'organization',
        displayName: 'Scanner access',
        description: 'Use quality scanning',
        permissionName: 'scanner.read',
      },
    ];
    let decide!: (decision: { allowed: boolean }) => void;
    check.mockReturnValue(
      new Promise<{ allowed: boolean }>(resolve => {
        decide = resolve;
      }),
    );
    const { result } = renderHook(
      () => useNativeCatalogColumns('playbook-repository'),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));
    render(<>{result.current[0].render(entity)}</>, { wrapper });
    await waitFor(() =>
      expect(check).toHaveBeenCalledWith(
        'scanner.access',
        'component:default/repo',
      ),
    );
    await act(async () => {
      decide({ allowed: false });
    });
    expect(columns[0].loader).not.toHaveBeenCalled();
    expect(screen.queryByText('Quality for repo')).not.toBeInTheDocument();
  });
});
