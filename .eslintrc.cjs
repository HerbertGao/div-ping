module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'local-rules'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    // Custom i18n rules
    'local-rules/no-chinese-characters': 'error',
    'local-rules/no-hardcoded-user-strings': ['warn', { allowConsole: true }],
  },
  env: {
    browser: true,
    es2020: true,
    webextensions: true,
  },
};
