import type { AppNode, AppTreeApi } from '@backstage/frontend-plugin-api';
import { coreExtensionData } from '@backstage/frontend-plugin-api';
import { isLandingPath, resolveLandingDestination } from './landingDestination';

function treeWithPage(
  options: {
    id?: string;
    path?: string;
    disabled?: boolean;
    mounted?: boolean;
    parent?: string;
    input?: string;
  } = {},
): AppTreeApi {
  const node = {
    spec: {
      id: options.id ?? 'page:example',
      disabled: options.disabled ?? false,
    },
    edges: {
      attachedTo: {
        node: { spec: { id: options.parent ?? 'app/routes' } },
        input: options.input ?? 'routes',
      },
    },
    instance:
      options.mounted === false
        ? undefined
        : {
            getData: (ref: unknown) =>
              ref === coreExtensionData.routePath
                ? (options.path ?? '/self-service')
                : undefined,
          },
  } as unknown as AppNode;
  return {
    getTree: () => ({
      tree: { nodes: new Map([[node.spec.id, node]]), root: node, orphans: [] },
    }),
    getNodesByRoutePath: () => ({ nodes: [] }),
  };
}

describe('landing path validation', () => {
  it.each(['/self-service', '/content/quality', '/my-page_1/v2.1'])(
    'accepts %s',
    path => {
      expect(isLandingPath(path)).toBe(true);
    },
  );
  it.each([
    '',
    '/',
    '//evil.example',
    'https://evil.example',
    // eslint-disable-next-line no-script-url -- Verify malicious config is rejected, never navigated to.
    'javascript:alert(1)',
    'relative',
    '/a/',
    '/a//b',
    '/a/../b',
    '/.',
    '/..',
    '/a?next=evil',
    '/a#fragment',
    '/%2f%2fevil',
    '/a\\b',
    '/a\nb',
    ' /a',
    '/a ',
    '/:id',
    '/*',
  ])('rejects %s', path => {
    expect(isLandingPath(path)).toBe(false);
  });
});

describe('installed landing destinations', () => {
  it('defaults to the installed self-service page', () => {
    expect(resolveLandingDestination(treeWithPage())).toBe('/self-service');
  });
  it('requires an exact installed route rather than a parent route prefix', () => {
    expect(
      resolveLandingDestination(treeWithPage(), '/self-service/unknown'),
    ).toBeUndefined();
  });
  it.each([
    { disabled: true },
    { mounted: false },
    { parent: 'missing' },
    { input: 'not-routes' },
    { id: 'page:portal/landing' },
  ])('ignores disabled, orphaned or landing nodes: %j', options => {
    expect(resolveLandingDestination(treeWithPage(options))).toBeUndefined();
  });
  it('does not consult the app tree for unsafe input', () => {
    const api = treeWithPage();
    const getTree = jest.spyOn(api, 'getTree');
    expect(resolveLandingDestination(api, '//evil.example')).toBeUndefined();
    expect(getTree).not.toHaveBeenCalled();
  });
});
