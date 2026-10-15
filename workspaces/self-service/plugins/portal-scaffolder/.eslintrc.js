module.exports = require('@backstage/cli/config/eslint-factory')(__dirname, {
  rules: {
    '@backstage/no-relative-monorepo-imports': 'off',
  },
});
