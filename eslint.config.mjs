import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Flat-config ESLint setup for the Vite/Vitest app. Replaces the old
// eslint-config-react-app preset (which shipped via react-scripts). We mirror
// react-app's effective rule surface — eslint:recommended + the two classic
// react-hooks rules + JSX var usage — without the React-Compiler rule pack the
// modern react-hooks plugin now bundles, to preserve the existing zero-warning
// baseline. The `lint` script targets src/ only; e2e/ and foundry-bridge/ are
// linted by their own tooling.

const vitestGlobals = {
  vi: 'readonly',
  vitest: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
};

export default [
  // Never lint build output or vendored/foreign trees. (The `lint` script
  // already scopes to src/, but this keeps a bare `eslint .` sane too.)
  {
    ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**', 'e2e/**', 'foundry-bridge/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      // Keep React/JSX-referenced identifiers from tripping no-unused-vars.
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      // Classic react-hooks rules only (not the v6 React-Compiler rule pack).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Match react-app: ignore unused function args and the React import.
      'no-unused-vars': ['warn', {
        args: 'none',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^React$',
      }],
    },
  },
  {
    // Test files + jsdom setup run under Vitest with Node-ish globals.
    files: ['**/*.test.{js,jsx}', 'src/setupTests.js'],
    languageOptions: {
      globals: { ...globals.node, ...vitestGlobals },
    },
  },
];
