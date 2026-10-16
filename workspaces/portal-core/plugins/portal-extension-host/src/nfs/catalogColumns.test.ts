import type { CatalogTableColumnDescriptor } from '@ansible/portal-extension-api/alpha';
import { collectCatalogColumns } from './catalogColumns';

function column(): CatalogTableColumnDescriptor {
  return {
    attachment: 'catalog.table.columns',
    capabilityId: 'scanner.quality',
    entryPointId: 'scanner.column',
    loader: jest.fn(),
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
              order: 10,
              appliesToContentTypes: ['playbook-repository'],
              launches: { type: 'slot', targetSlot: 'catalog.table.columns' },
            },
          ],
        },
      ],
    },
  };
}
it('accepts an owned scoped column, rejects duplicates and unsupported host versions', () => {
  const declaration = column();
  expect(collectCatalogColumns([declaration, declaration])).toEqual([
    declaration,
  ]);
  expect(collectCatalogColumns([declaration], '0.0.1')).toEqual([]);
});
it.each(['attachment', 'ownership', 'type', 'loader', 'entitlement'])(
  'isolates invalid column %s',
  invalid => {
    const declaration = column();
    if (invalid === 'attachment')
      declaration.attachment = 'entity.detail.tabs' as any;
    if (invalid === 'ownership') declaration.manifest.id = 'other';
    if (invalid === 'type')
      declaration.manifest.capabilities[0].entryPoints[0].appliesToContentTypes =
        ['unknown'];
    if (invalid === 'loader') declaration.loader = undefined as any;
    if (invalid === 'entitlement')
      declaration.requiredEntitlements = ['missing'];
    expect(collectCatalogColumns([declaration])).toEqual([]);
  },
);
