import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.jsx', '.js', '.tsx', '.ts', '.json'],
  },
  test: {
    globals: true,
    // happy-dom over jsdom: ~40% faster per-file environment setup (the dominant
    // cost on a 300+ file suite) with full RTL compatibility. See PR for benchmarks.
    environment: 'happy-dom',
    setupFiles: './src/setupTests.js',
    // Match CRA's react-scripts Jest preset, which defaulted to resetMocks:true.
    // Many suites rely on mock state + implementations being wiped before each
    // test (they re-install via beforeEach).
    mockReset: true,
    // Exclude Playwright specs — they use @playwright/test globals, not Vitest.
    // '.claude/**' keeps Vitest from picking up stale duplicate test files in
    // on-disk agent worktrees (.claude/worktrees/**) during local single-file runs.
    exclude: ['node_modules', 'e2e/**', 'foundry-bridge/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}', 'worker/**/*.js'],
      exclude: [
        'src/index.jsx',
        'src/reportWebVitals.js',
        'src/**/*.test.{js,jsx}',
        'src/**/__mocks__/**',
        'worker/**/*.test.js',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
        // #1309 ratchet: worker/ gets its own gate so a DO coverage regression
        // fails test:ci (files matching the glob leave the global 80% bucket).
        // Raised with the #1318 route-table rework (dispatcher + route smoke
        // tests took index.js 0% → ~42%). Keep raising as it grows.
        'worker/**': {
          branches: 58,
          functions: 68,
          lines: 62,
          statements: 60,
        },
      },
    },
  },
});
