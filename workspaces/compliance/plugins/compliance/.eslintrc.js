module.exports = {
  ...require('@backstage/cli/config/eslint-factory')(__dirname),
  rules: {
    'react/react-in-jsx-scope': 'off',
    // Ported compliance UI (aap-compliance-pipelines): tighten incrementally in follow-up PRs.
    'no-console': 'off',
    'no-nested-ternary': 'off',
    'consistent-return': 'off',
    eqeqeq: 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/no-shadow': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'jsx-a11y/click-events-have-key-events': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'default-case': 'off',
    'react/sort-comp': 'off',
  },
};
