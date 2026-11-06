const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const config = yaml.load(
  fs.readFileSync(path.join(root, 'app-config.yaml'), 'utf8'),
  {
    schema: yaml.CORE_SCHEMA,
  },
);
// This shared-config contract does not exercise local overrides or live sign-in.
test('shared RBAC stays enabled without an automatic default role or grants', () => {
  assert.equal(config.permission.enabled, true);
  assert.equal(
    Object.hasOwn(config.permission.rbac, 'defaultPermissions'),
    false,
  );
});

test('explicit administrators and plugin enforcement remain unchanged', () => {
  const administrators = [
    { name: 'user:default/admin' },
    { name: 'group:default/aap-admins' },
  ];
  assert.deepEqual(config.permission.rbac.admin, {
    users: administrators,
    superUsers: administrators,
  });
  assert.deepEqual(config.permission.rbac.pluginsWithPermission, [
    'catalog',
    'scaffolder',
    'permission',
  ]);
  assert.equal(config.permission.rbac['policies-csv-file'], undefined);
  assert.equal(config.permission.rbac.policyFileReload, undefined);
});

test('authentication providers are unchanged; no Guest provider is added', () => {
  assert.deepEqual(config.auth, {
    omitIdentityTokenOwnershipClaim: true,
    environment: 'development',
    providers: {
      github: {
        development: {
          clientId: '${AUTH_GITHUB_CLIENT_ID}',
          clientSecret: '${AUTH_GITHUB_CLIENT_SECRET}',
        },
      },
      gitlab: {
        development: {
          clientId: '${AUTH_GITLAB_CLIENT_ID}',
          clientSecret: '${AUTH_GITLAB_CLIENT_SECRET}',
        },
      },
      rhaap: {
        development: {
          host: '${AAP_HOST}',
          checkSSL: false,
          clientId: '${AAP_AUTH_CLIENT_ID}',
          clientSecret: '${AAP_AUTH_CLIENT_SECRET}',
          signIn: { resolvers: [{ resolver: 'allowNewAAPUserSignIn' }] },
        },
      },
    },
  });
  assert.equal(config.signInPage, 'rhaap');
});
