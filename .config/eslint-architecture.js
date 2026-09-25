/**
 * Architectural import boundaries for the plugin monorepo.
 * Enforces the dependency flow documented in AGENTS.md.
 *
 *   backstage-rhaap-common (foundation)
 *     └── backend modules (catalog, scaffolder, auth)
 *   frontend plugins → Backstage APIs only, not AAP/SCM clients from common
 *
 * Uses Backstage eslint-factory options (restrictedImportPatterns,
 * restrictedSrcSyntax) so rules merge with the base config.
 */

/** @type {Record<string, unknown>} */
const frontend = {
  restrictedImportPatterns: [
    '@ansible/plugin-scaffolder-backend-*',
    '@ansible/backstage-plugin-catalog-backend-*',
    '@ansible/backstage-plugin-auth-backend-*',
  ],
  restrictedSrcSyntax: [
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
  ],
};

/** @type {Record<string, unknown>} */
const backend = {
  restrictedImportPatterns: [
    '@ansible/plugin-backstage-rhaap',
    '@ansible/plugin-backstage-self-service',
  ],
};

/** @type {Record<string, unknown>} */
const common = {
  restrictedImportPatterns: [
    '@ansible/plugin-*',
    '@ansible/backstage-plugin-*',
  ],
};

module.exports = {
  frontend,
  backend,
  common,
};
