module.exports = require('@backstage/cli/config/eslint-factory')(__dirname, {
  ...require('../../.config/eslint-architecture').frontend,
  rules: {
    '@backstage/no-relative-monorepo-imports': 'off',
  },
});
