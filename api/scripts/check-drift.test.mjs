// Generated with AI assistance: OpenCode (OpenAI)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRouteDrift } from './check-drift.mjs';

const healthRoutes = [
  {
    file: 'workspaces/aap/plugins/catalog-backend-module-rhaap/src/router.ts',
    path: '/api/catalog/health',
  },
  {
    file: 'workspaces/content/plugins/automation-content-backend/src/router.ts',
    path: '/api/automation-content/health',
  },
];
const routerSources = healthRoutes.map(({ file }) => ({
  file,
  source: "router.get('/health', handler);",
}));
const healthSpec = {
  paths: Object.fromEntries(
    healthRoutes.map(({ path }) => [path, { get: {} }]),
  ),
};

test('checks both mounted health endpoints independently', () => {
  assert.deepEqual(checkRouteDrift(routerSources, healthSpec), {
    routeCount: 2,
    inCodeNotInSpec: [],
    inSpecNotInCode: [],
  });
});

for (const { file, path } of healthRoutes) {
  test(`detects missing documentation for ${path}`, () => {
    const spec = {
      paths: Object.fromEntries(
        Object.entries(healthSpec.paths).filter(([key]) => key !== path),
      ),
    };

    const result = checkRouteDrift(routerSources, spec);

    assert.deepEqual(result.inCodeNotInSpec, [{ route: `GET ${path}`, file }]);
    assert.deepEqual(result.inSpecNotInCode, []);
  });

  test(`the other router cannot cover a missing ${path}`, () => {
    const result = checkRouteDrift(
      routerSources.filter(source => source.file !== file),
      healthSpec,
    );

    assert.deepEqual(result.inCodeNotInSpec, []);
    assert.deepEqual(result.inSpecNotInCode, [`GET ${path}`]);
  });
}

test('rejects an incorrect health mount', () => {
  const result = checkRouteDrift(routerSources, {
    paths: {
      '/api/catalog/health': { get: {} },
      '/api/wrong-plugin/health': { get: {} },
    },
  });

  assert.deepEqual(result.inCodeNotInSpec, [
    {
      route: 'GET /api/automation-content/health',
      file: healthRoutes[1].file,
    },
  ]);
  assert.deepEqual(result.inSpecNotInCode, ['GET /api/wrong-plugin/health']);
});

test('rejects the old shared health operation', () => {
  const result = checkRouteDrift(routerSources, {
    paths: { '/health': { get: {} } },
  });

  assert.deepEqual(
    result.inCodeNotInSpec,
    healthRoutes.map(({ file, path }) => ({ route: `GET ${path}`, file })),
  );
  assert.deepEqual(result.inSpecNotInCode, ['GET /health']);
});

test('an unrelated router cannot satisfy either mounted health endpoint', () => {
  const file = 'workspaces/other/plugins/other-backend/src/router.ts';
  const result = checkRouteDrift(
    [{ file, source: "router.get('/health', handler);" }],
    healthSpec,
  );

  assert.deepEqual(result.inCodeNotInSpec, [{ route: 'GET /health', file }]);
  assert.deepEqual(
    result.inSpecNotInCode,
    healthRoutes.map(({ path }) => `GET ${path}`),
  );
});

test('preserves local route matching and path parameter normalization', () => {
  const result = checkRouteDrift(
    [
      {
        file: healthRoutes[1].file,
        source: "router.get('/registries/:name', handler);",
      },
    ],
    {
      paths: {
        '/registries/{name}': {
          servers: [{ url: '/api/automation-content' }],
          get: {},
        },
      },
    },
  );

  assert.deepEqual(result, {
    routeCount: 1,
    inCodeNotInSpec: [],
    inSpecNotInCode: [],
  });
});
