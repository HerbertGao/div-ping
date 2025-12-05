import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import commentsPlugin from 'eslint-plugin-eslint-comments';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localRules = require('./eslint-local-rules.cjs');

export default [
  eslint.configs.recommended,
  {
    files: ['src/ts/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        chrome: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        AbortController: 'readonly',
        MutationObserver: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLButtonElement: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        File: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'eslint-comments': commentsPlugin,
      'local-rules': {
        rules: localRules
      }
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': 'off',
      // Comment quality rules
      'eslint-comments/disable-enable-pair': 'error',
      'eslint-comments/no-aggregating-enable': 'error',
      'eslint-comments/no-duplicate-disable': 'error',
      'eslint-comments/no-unlimited-disable': 'error',
      'eslint-comments/no-unused-disable': 'warn',
      'eslint-comments/no-unused-enable': 'warn',
      'eslint-comments/require-description': ['warn', { ignore: [] }],
      // Detect low-quality comments
      'spaced-comment': ['warn', 'always', {
        line: {
          markers: ['/'],
          exceptions: ['-', '+', '*']
        },
        block: {
          markers: ['!'],
          exceptions: ['*'],
          balanced: true
        }
      }],
      'capitalized-comments': ['warn', 'always', {
        ignorePattern: 'pragma|ignored|prettier-ignore|webpack|TODO|FIXME|NOTE',
        ignoreInlineComments: true,
        ignoreConsecutiveComments: true
      }],
      'multiline-comment-style': ['warn', 'separate-lines'],
      'no-inline-comments': 'off',
      'no-warning-comments': ['warn', {
        terms: ['todo', 'fixme', 'hack', 'bug', 'xxx'],
        location: 'start'
      }],
      // I18n rules
      'local-rules/no-chinese-characters': 'error',
      'local-rules/no-hardcoded-user-strings': ['warn', { allowConsole: true }]
    }
  },
  {
    ignores: ['dist/', 'node_modules/', 'webpack.config.js']
  }
];
