import {
  rootRouteRef,
  catalogImportRouteRef,
  selectedTemplateRouteRef,
  createTaskRouteRef,
} from './routes';

describe('self-service route refs', () => {
  it('exports a rootRouteRef with correct id', () => {
    expect(rootRouteRef).toBeDefined();
    // route refs created by createRouteRef expose an id
    // (we check the id property to ensure it was created with the expected id)
    // @ts-ignore - some implementations keep id as a symbol/private; checking via toString is safe fallback
    expect((rootRouteRef as any).id || String(rootRouteRef)).toBeDefined();
    // if implementation exposes id directly (common), assert exact value:

    expect((rootRouteRef as any).id).toBe('self-service');
  });

  it('catalogImportRouteRef is a sub-route of rootRouteRef with expected id and path', () => {
    expect(catalogImportRouteRef).toBeDefined();

    expect((catalogImportRouteRef as any).id).toBe(
      'self-service/catalog-import',
    );

    // sub-route implementations usually expose 'path' and 'parent'
    const asAny = catalogImportRouteRef as any;
    expect(asAny.path).toBe('/catalog-import');
    // parent should be the same object as rootRouteRef
    expect(asAny.parent).toBe(rootRouteRef);
  });

  it('selectedTemplateRouteRef has expected id, parent and path', () => {
    expect(selectedTemplateRouteRef).toBeDefined();
    const asAny = selectedTemplateRouteRef as any;

    expect(asAny.id).toBe('self-service/selected-template');

    expect(asAny.path).toBe('/create/templates/:namespace/:templateName');
    expect(asAny.parent).toBe(rootRouteRef);
  });

  it('createTaskRouteRef has expected id, parent and path', () => {
    expect(createTaskRouteRef).toBeDefined();
    const asAny = createTaskRouteRef as any;

    expect(asAny.id).toBe('self-service/task');

    expect(asAny.path).toBe('/create/tasks/:taskId');
    expect(asAny.parent).toBe(rootRouteRef);
  });
});
