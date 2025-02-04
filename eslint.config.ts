import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'public/',
      'src/__generated__/',
      'pnpm-lock.yaml',
      'node_modules/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.typescript,
  prettierConfig,
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
          ],
          alphabetize: { order: 'asc' },
          'newlines-between': 'always',
        },
      ],
      'sort-imports': [
        'error',
        { ignoreDeclarationSort: true },
      ] /* https://github.com/import-js/eslint-plugin-import/issues/1732#issuecomment-616246894 */,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },
);
