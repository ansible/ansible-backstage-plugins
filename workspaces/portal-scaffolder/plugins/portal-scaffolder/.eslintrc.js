const arch = require('../../../../.config/eslint-architecture');

module.exports = arch.mergeRestrictedSyntax(
  require('@backstage/cli/config/eslint-factory')(__dirname, {
    ...arch.frontend,
    rules: {
      '@backstage/no-relative-monorepo-imports': 'off',
    },
  }),
  arch.frontendBoundarySelectors,
);
