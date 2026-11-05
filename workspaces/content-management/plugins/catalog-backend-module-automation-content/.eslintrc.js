const arch = require('../../../../.config/eslint-architecture');

module.exports = require('@backstage/cli/config/eslint-factory')(__dirname, {
  ...arch.contentCredentialBoundary,
});
