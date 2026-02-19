import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  js.configs.recommended,
  jsdoc.configs['flat/recommended'],
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }
    },
    plugins: { jsdoc },
    rules: {
      'sort-imports': [
        'warn',
        {
          allowSeparatedGroups: false,
          ignoreCase: true,
          ignoreDeclarationSort: false,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single']
        }
      ]
    }
  }
];
