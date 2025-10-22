// eslint.config.js
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  // Extends TypeScript's recommended rules
  ...tseslint.configs.recommended,
  // This is the most important part: it disables ESLint formatting rules
  eslintConfigPrettier,
  {
    ignores: [
      'node_modules/**',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-img-element': 'warn',
    },
  },
  {
    globals: {
      chrome: true,
    },
  }
];
