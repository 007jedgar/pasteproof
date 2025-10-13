// eslint.config.js
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  // Extends TypeScript's recommended rules
  ...tseslint.configs.recommended,
  // This is the most important part: it disables ESLint formatting rules
  eslintConfigPrettier,
];
