module.exports = {
  ...require('@backstage/cli/config/eslint-factory')(__dirname),
  rules: {
    'react/react-in-jsx-scope': 'off',
  },
};
