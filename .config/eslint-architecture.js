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

module.exports = {
  frontend,
  backend,
  common,
  frontendBoundarySelectors,
  mergeRestrictedSyntax,
};
