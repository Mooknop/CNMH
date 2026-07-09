import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Flat-config ESLint setup for the Vite/Vitest app. Replaces the old
// eslint-config-react-app preset (which shipped via react-scripts). We mirror
// react-app's effective rule surface — eslint:recommended + the two classic
// react-hooks rules + JSX var usage — without the React-Compiler rule pack the
// modern react-hooks plugin now bundles, to preserve the existing zero-warning
// baseline. The `lint` script covers src/ AND foundry-bridge/ (#1313); e2e/
// keeps its own Playwright tooling.

// Foundry globals the BRIDGE is built against. Feature modules must reach them
// through pf2eAdapter.js (the v14-migration seam) — enforced below.
const FOUNDRY_GLOBALS = ['Hooks', 'game', 'canvas', 'CONFIG', 'ui', 'CONST', 'ChatMessage', 'fromUuid', 'fromUuidSync', 'foundry'];

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
    ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**', 'e2e/**'],
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
  {
    // Foundry bridge (#1313): browser env + the Foundry globals declared so
    // no-undef stays meaningful in the files that ARE allowed to use them.
    files: ['foundry-bridge/**/*.js'],
    languageOptions: {
      globals: Object.fromEntries(FOUNDRY_GLOBALS.map((g) => [g, 'readonly'])),
    },
  },
  {
    // The pf2eAdapter seam: feature modules must not touch Foundry globals —
    // every canvas/actor/combat/hook access goes through pf2eAdapter.js so a
    // v14 API change is a one-file fix (see foundry-bridge/MIGRATION.md).
    // Allowed at the globals: pf2eAdapter.js itself and bridge.js (the module
    // entry point — Foundry requires settings registration + lifecycle hooks
    // there). Tests build the mock world, so they're exempt too.
    files: ['foundry-bridge/**/*.js'],
    ignores: [
      'foundry-bridge/pf2eAdapter.js',
      'foundry-bridge/bridge.js',
      'foundry-bridge/test/**',
      'foundry-bridge/**/*.test.js',
    ],
    rules: {
      'no-restricted-globals': ['error',
        ...FOUNDRY_GLOBALS.map((name) => ({
          name,
          message: `Foundry global — route it through pf2eAdapter.js (the v14 seam), never a feature module.`,
        })),
      ],
    },
  },
  {
    // CJS tooling files in the bridge (jest config) run under node.
    files: ['foundry-bridge/jest.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // Bridge jest tests: node-ish globals + jest, and they legitimately build
    // the mocked Foundry world on globalThis.
    files: ['foundry-bridge/**/*.test.js', 'foundry-bridge/test/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
  {
    // #1307: every cnmh_ sync key must come from the registry (src/sync/keys.js
    // → foundry-bridge/syncKeys.js). Tests are exempt on purpose — literal key
    // strings there double as guards on the builders' output.
    files: ['src/**/*.{js,jsx}'],
    ignores: ['**/*.test.{js,jsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'Literal[value=/^cnmh_/]',
          message: 'Hand-written cnmh_ key — import it from the sync-key registry (src/sync/keys.js) instead.',
        },
        {
          selector: 'TemplateElement[value.raw=/^cnmh_/]',
          message: 'Hand-written cnmh_ key template — compose it with syncKey()/globalKey() from src/sync/keys.js.',
        },
      ],
    },
  },
];
