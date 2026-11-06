/**
 * Architectural import boundaries for the plugin monorepo.
 * Enforces the dependency flow documented in AGENTS.md.
 *
 *   backstage-rhaap-common (foundation)
 *     └── backend modules (catalog, scaffolder, auth)
 *   frontend plugins → Backstage APIs only, not AAP/SCM clients from common
 *
 * Frontend boundary selectors are exposed separately because the Backstage
 * eslint-factory createConfigForRole overwrites no-restricted-syntax with
 * its own React import warnings. Plugin .eslintrc.js files must merge these
 * selectors after the factory call using mergeRestrictedSyntax().
 */

/**
 * Selectors that prevent frontend plugins from importing AAP/SCM clients
 * directly from the common barrel.
 * @type {Array<{selector: string, message: string}>}
 */
const frontendBoundarySelectors = [
  {
    selector:
      "ImportDeclaration[source.value='@ansible/backstage-rhaap-common'] ImportSpecifier[imported.name=/^(AAPClient|AAPService|ansibleServiceRef|ScmClient|ScmClientFactory)$/]",
    message:
      'Frontend plugins must not import AAP/SCM clients from the common package. Use Backstage proxy/API routes.',
  },
  {
    selector:
      "ImportDeclaration[source.value='@ansible/backstage-rhaap-common'] ImportNamespaceSpecifier",
    message:
      'Frontend plugins must not namespace-import the common package barrel. Use /permissions, /constants, or `import type`.',
  },
];

/** @type {Record<string, unknown>} */
const frontend = {
  restrictedImportPatterns: [
    '@ansible/plugin-scaffolder-backend-*',
    '@ansible/backstage-plugin-catalog-backend-*',
    '@ansible/backstage-plugin-auth-backend-*',
  ],
};

/** @type {Record<string, unknown>} */
const backend = {
  restrictedImportPatterns: [
    '@ansible/plugin-backstage-rhaap',
    '@ansible/portal-scaffolder',
    '@ansible/portal-scaffolder/alpha',
  ],
};

/** @type {Record<string, unknown>} */
const common = {
  restrictedImportPatterns: [
    '@ansible/plugin-*',
    '@ansible/backstage-plugin-*',
    '@ansible/portal-scaffolder',
    '@ansible/portal-scaffolder/alpha',
  ],
};

/**
 * Merge architecture boundary selectors into an existing eslint-factory
 * config's no-restricted-syntax rule, preserving factory defaults (e.g.
 * React import warnings from createConfigForRole).
 *
 * Usage in plugin .eslintrc.js:
 *   const factory = require('@backstage/cli/config/eslint-factory')(__dirname, { ...arch.frontend });
 *   module.exports = mergeRestrictedSyntax(factory, frontendBoundarySelectors);
 *
 * @param {Record<string, unknown>} config - eslint-factory output
 * @param {Array<{selector: string, message: string}>} selectors - additional selectors
 * @returns {Record<string, unknown>} config with merged no-restricted-syntax
 */
function mergeRestrictedSyntax(config, selectors) {
  if (!selectors || selectors.length === 0) return config;

  const existing = config.rules?.['no-restricted-syntax'] ?? ['warn'];
  const severity = existing[0] ?? 'warn';
  const existingSelectors = existing.slice(1);

  return {
    ...config,
    rules: {
      ...config.rules,
      'no-restricted-syntax': [severity, ...existingSelectors, ...selectors],
    },
  };
}

/**
 * Credential-boundary selectors for the automation-content packages
 * (AAP-96687).
 *
 * The content plugin's security posture is a pair of facts an operator can
 * verify: registry credentials arrive through Backstage configuration,
 * resolved from environment variables the deployment injects, and the plugin
 * never talks to the cluster API — which is why its runtime service account
 * needs no Kubernetes permissions. These selectors keep a future commit from
 * eroding those facts by accident:
 *
 * - Kubernetes/OpenShift clients cannot be loaded, in any import spelling,
 *   in source or test files
 * - production source cannot take the whole `process.env` object as a value
 *   (enumerate, spread, alias, serialize, pass it on) or read it with a
 *   computed key; named reads (`process.env.NAME`) stay allowed, and test
 *   files keep the freedom to seed a subprocess with `{ ...process.env }`
 *
 * The operator guide for the boundary is
 * workspaces/content-management/docs/guides/registry-credentials.md.
 */

/**
 * Module specifiers that hand code a Kubernetes/OpenShift cluster client.
 * Written with `.` for the package separators: esquery regex values cannot
 * contain forward slashes, which delimit the regex itself.
 */
const CLUSTER_CLIENT_SOURCES =
  '^(@kubernetes.client-node|kubernetes-client|openshift-rest-client|@backstage.plugin-kubernetes-)';

/** The whole environment object, in both member spellings. */
const ENV_OBJECT = [
  "MemberExpression[object.name='process'][property.name='env']",
  "MemberExpression[object.name='process'][computed=true][property.value='env']",
];

/**
 * Node types where a direct `process.env` child means the whole environment
 * object was taken as a value: a call argument, a spread, a declaration's
 * initializer, a property value, a return — and the rest. `process.env.NAME`
 * never matches: there the direct child is the outer member access, not the
 * environment object itself.
 */
const ENV_VALUE_PARENTS = [
  'ArrayExpression',
  'ArrowFunctionExpression',
  'AssignmentExpression',
  'AssignmentPattern',
  'AwaitExpression',
  'BinaryExpression',
  'CallExpression',
  'ConditionalExpression',
  'ExpressionStatement',
  'ForInStatement',
  'ForOfStatement',
  'LogicalExpression',
  'NewExpression',
  'Property',
  'PropertyDefinition',
  'ReturnStatement',
  'SequenceExpression',
  'SpreadElement',
  'TemplateLiteral',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'UnaryExpression',
  'VariableDeclarator',
  'YieldExpression',
  'ExportDefaultDeclaration',
  'ThrowStatement',
];

/** Whole-environment member expressions that bypass a bare `process` node. */
const ENV_ALIAS_OBJECTS = [
  "MemberExpression[property.name='env'][computed=false][object.type='MemberExpression'][object.object.name=/^(globalThis|global)$/][object.property.name='process']",
  "MemberExpression[property.name='env'][computed=false][object.type='CallExpression'][object.callee.name='require'][object.arguments.0.value=/^(node:)?process$/]",
];

/** Computed lookups — `process.env[name]` — in both env spellings. */
const ENV_COMPUTED = [
  "MemberExpression[computed=true][property.type!='Literal'][object.object.name='process'][object.property.name='env']",
  "MemberExpression[computed=true][property.type!='Literal'][object.object.name='process'][object.computed=true][object.property.value='env']",
];

const clusterClientMessage =
  'Automation content must not load Kubernetes/OpenShift clients: registry credentials arrive through Backstage configuration, and the plugin needs no cluster API access. See workspaces/content-management/docs/guides/registry-credentials.md (AAP-96687).';

const envObjectMessage =
  'Production code must not take the whole process.env object as a value: read named variables (process.env.NAME) or receive configuration through Backstage config. Tests may spread it to seed a subprocess. See workspaces/content-management/docs/guides/registry-credentials.md (AAP-96687).';

const envComputedMessage =
  "Computed process.env access hides which variable is read: use a literal name (process.env.NAME or process.env['NAME']).";

const envImportMessage =
  'Do not import the environment object from the process module: read named variables (process.env.NAME) instead.';

/**
 * The credential boundary for the automation-content packages. `restrictedSyntax`
 * applies to source and test files alike; `restrictedSrcSyntax` applies to
 * source files only, which is what keeps `{ ...process.env }` legal in the
 * subprocess tests.
 * @type {Record<string, unknown>}
 */
const contentCredentialBoundary = {
  restrictedSyntax: [
    `ImportDeclaration[source.value=/${CLUSTER_CLIENT_SOURCES}/]`,
    `ExportNamedDeclaration[source.value=/${CLUSTER_CLIENT_SOURCES}/]`,
    `ExportAllDeclaration[source.value=/${CLUSTER_CLIENT_SOURCES}/]`,
    `CallExpression[callee.name='require'][arguments.0.value=/${CLUSTER_CLIENT_SOURCES}/]`,
    `ImportExpression[source.value=/${CLUSTER_CLIENT_SOURCES}/]`,
    `TSImportEqualsDeclaration > TSExternalModuleReference[expression.value=/${CLUSTER_CLIENT_SOURCES}/]`,
  ].map(selector => ({ selector, message: clusterClientMessage })),

  restrictedSrcSyntax: [
    {
      selector:
        "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
      message: envObjectMessage,
    },
    {
      selector:
        "VariableDeclarator[init.name='process'] > ObjectPattern > Property[computed=true][key.value='env']",
      message: envObjectMessage,
    },
    {
      selector:
        "AssignmentExpression[right.name='process'] > ObjectPattern > Property[key.name='env']",
      message: envObjectMessage,
    },
    {
      selector:
        "AssignmentExpression[right.name='process'] > ObjectPattern > Property[computed=true][key.value='env']",
      message: envObjectMessage,
    },
    {
      selector:
        "AssignmentPattern[right.name='process'] > ObjectPattern > Property[key.name='env']",
      message: envObjectMessage,
    },
    {
      selector:
        "AssignmentPattern[right.name='process'] > ObjectPattern > Property[computed=true][key.value='env']",
      message: envObjectMessage,
    },
    ...ENV_VALUE_PARENTS.flatMap(parent =>
      ENV_OBJECT.map(ref => ({
        selector: `${parent}:has(> ${ref})`,
        message: envObjectMessage,
      })),
    ),
    ...ENV_COMPUTED.map(selector => ({
      selector,
      message: envComputedMessage,
    })),
    {
      selector:
        "ImportDeclaration[source.value=/^(node:)?process$/] ImportSpecifier[imported.name='env']",
      message: envImportMessage,
    },
    {
      selector:
        'ImportDeclaration[source.value=/^(node:)?process$/] ImportNamespaceSpecifier',
      message: envImportMessage,
    },
    {
      selector:
        'ImportDeclaration[source.value=/^(node:)?process$/] ImportDefaultSpecifier',
      message: envImportMessage,
    },
    ...ENV_ALIAS_OBJECTS.map(selector => ({
      selector,
      message: envObjectMessage,
    })),
  ],
};

module.exports = {
  frontend,
  backend,
  common,
  frontendBoundarySelectors,
  mergeRestrictedSyntax,
  contentCredentialBoundary,
};
