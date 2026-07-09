// Standalone jest project for the Foundry bridge module.
//
// The app's tests run under Vitest (Vite) scoped to src/. The bridge lives
// outside src/ and is plain ESM with no React, so it runs under the root-installed
// jest with an inline @babel/preset-env transform (no shared babelrc, so this
// config can never perturb the Vite build).
//
//   npm run test:bridge          # one-shot
//   npm run test:bridge -- --watch
//
// The suite is designed to run with NO real Foundry present: test/setup.js installs
// mocked Foundry globals (game, canvas, Hooks, CONFIG, WebSocket) before each test.
module.exports = {
  rootDir: __dirname,
  displayName: 'foundry-bridge',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testMatch: ['<rootDir>/**/*.test.js'],
  // bridge.js registers Foundry hooks at import time and config.js holds secrets;
  // neither is unit-tested here, so keep them out of the coverage denominator.
  collectCoverageFrom: [
    '<rootDir>/*.js',
    '!<rootDir>/jest.config.js',
    '!<rootDir>/config.js',
    '!<rootDir>/bridge.js',
  ],
  // Gate against regression. Floors sit just under current coverage
  // (branches ~80%, the rest 95%+) so unrelated PRs aren't blocked but a
  // meaningful drop fails CI. Raise these as coverage improves.
  coverageThreshold: {
    global: {
      branches: 78,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  transform: {
    '^.+\\.js$': ['babel-jest', {
      babelrc: false,
      configFile: false,
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    }],
  },
};
