#!/usr/bin/env node
// Local cross-process E2E shard fan-out (#685 Track 1b).
//
// `npm run test:e2e:local` is single-worker against one wrangler-dev stack
// (the content DO is a hardcoded singleton and /api/gm/_test/reset is a
// global wipe — see playwright.config.ts). This script gets the wall-clock
// win a different way: it boots N *separate* wrangler-dev stacks, each on
// its own port with its own DO/R2 state dir (playwright.config.ts's
// E2E_PORT / E2E_STATE_DIR), and runs one Playwright shard against each,
// concurrently, on this one machine. Same mechanism CI already uses across
// runners (.github/workflows/e2e-local.yml), just as OS processes instead
// of CI jobs.
//
// Not CPU-count-based: each shard is a full wrangler-dev process (its own
// Worker + two Durable Objects + simulated R2) plus a headless Chromium
// instance, so the practical ceiling is machine memory, not cores. Default
// of 4 mirrors the CI matrix; raise it only if you've checked you have the
// RAM (a rough rule of thumb: ~1-1.5GB per shard).
//
// Usage:
//   node scripts/e2eShards.mjs [--shards=N] [-- passthrough playwright args]
//   npm run test:e2e:local:sharded -- --shards=2 --grep "doors"
//
// Any args not consumed by this script (i.e. not --shards=N) are passed
// through verbatim to every `playwright test` child — e.g. --grep, -x.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SHARD_COUNT = 4;
const BASE_PORT = 8788;
const REPORT_ROOT = 'blob-report-shards';

// ---- pure helpers (exported for unit testing) -----------------------------

/** Parse `--shards=N` out of argv, falling back to E2E_SHARDS, then the default.
 *  Returns { shardCount, passthroughArgs } — everything else in argv is
 *  forwarded to each `playwright test` child untouched. */
export function parseArgs(argv, env = {}) {
  const passthroughArgs = [];
  let shardCount;
  for (const arg of argv) {
    const match = /^--shards=(\d+)$/.exec(arg);
    if (match) {
      shardCount = Number(match[1]);
    } else {
      passthroughArgs.push(arg);
    }
  }
  if (shardCount === undefined) {
    shardCount = env.E2E_SHARDS ? Number(env.E2E_SHARDS) : DEFAULT_SHARD_COUNT;
  }
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(`--shards must be a positive integer, got: ${shardCount}`);
  }
  return { shardCount, passthroughArgs };
}

/** Port for shard i (1-based) of N — one wrangler-dev instance per port. */
export function shardPort(index, basePort = BASE_PORT) {
  return basePort + (index - 1);
}

/** Per-shard blob output dir. Each shard gets its own directory (not a
 *  shared one) because BlobReporter deletes its output dir on every run
 *  (see PWTEST_BLOB_DO_NOT_REMOVE in Playwright's reporters/blob.ts) —
 *  sharing a dir means a later-finishing shard wipes an earlier one's zip. */
export function shardBlobDir(index, root = REPORT_ROOT) {
  return path.join(root, `shard-${index}`);
}

/** `playwright test` argv for shard i/N, with passthrough args appended. */
export function buildPlaywrightArgs(index, total, passthroughArgs = []) {
  return ['playwright', 'test', `--shard=${index}/${total}`, '--reporter=blob', ...passthroughArgs];
}

/** Env for shard i/N's child process: its own port (so its own wrangler-dev
 *  stack + DO/R2 state dir per playwright.config.ts), no rebuild (the caller
 *  builds once up front — see main()), and its own blob output dir. */
export function buildShardEnv(index, total, baseEnv, { basePort = BASE_PORT, reportRoot = REPORT_ROOT } = {}) {
  return {
    ...baseEnv,
    E2E_PORT: String(shardPort(index, basePort)),
    E2E_SKIP_BUILD: '1',
    PLAYWRIGHT_BLOB_OUTPUT_DIR: path.resolve(shardBlobDir(index, reportRoot)),
  };
}

// ---- process orchestration -------------------------------------------------

function prefixedPipe(childStream, outStream, prefix) {
  let buffer = '';
  childStream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); // last element may be a partial line — hold it
    for (const line of lines) outStream.write(`${prefix}${line}\n`);
  });
  childStream.on('end', () => {
    if (buffer.length) outStream.write(`${prefix}${buffer}\n`);
  });
}

function runShard(index, total, passthroughArgs) {
  const prefix = `[shard ${index}/${total}] `;
  return new Promise((resolve) => {
    const child = spawn('npx', buildPlaywrightArgs(index, total, passthroughArgs), {
      env: buildShardEnv(index, total, process.env),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    prefixedPipe(child.stdout, process.stdout, prefix);
    prefixedPipe(child.stderr, process.stderr, prefix);
    child.on('exit', (code) => {
      process.stdout.write(`${prefix}exited with code ${code}\n`);
      resolve(code ?? 1);
    });
    child.on('error', (err) => {
      process.stderr.write(`${prefix}failed to start: ${err.message}\n`);
      resolve(1);
    });
  });
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: true, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      process.stderr.write(`${command} failed to start: ${err.message}\n`);
      resolve(1);
    });
  });
}

/** Collect every shard's blob zip(s) into one flat directory — merge-reports
 *  reads its input directory non-recursively (playwright/lib/runner's
 *  sortedShardFiles does a plain readdir + *.zip filter), so the per-shard
 *  subdirectories from buildShardEnv() must be flattened first. */
function collectBlobsInto(mergedDir, shardCount, reportRoot) {
  mkdirSync(mergedDir, { recursive: true });
  for (let i = 1; i <= shardCount; i++) {
    const dir = shardBlobDir(i, reportRoot);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.zip')) {
        copyFileSync(path.join(dir, file), path.join(mergedDir, file));
      }
    }
  }
}

async function main() {
  const { shardCount, passthroughArgs } = parseArgs(process.argv.slice(2), process.env);

  console.log(
    `[e2eShards] fanning out ${shardCount} shard(s), ports ${shardPort(1)}-${shardPort(shardCount)}` +
      (passthroughArgs.length ? `, passthrough args: ${passthroughArgs.join(' ')}` : '')
  );

  rmSync(REPORT_ROOT, { recursive: true, force: true });

  console.log('[e2eShards] building app once (npx vite build) — shards reuse this build, they do not rebuild');
  const buildCode = await run('npx', ['vite', 'build']);
  if (buildCode !== 0) {
    console.error(`[e2eShards] build failed (exit ${buildCode}) — aborting before starting any shard`);
    process.exit(buildCode);
  }

  const results = await Promise.all(
    Array.from({ length: shardCount }, (_, i) => runShard(i + 1, shardCount, passthroughArgs))
  );
  const failed = results.some((code) => code !== 0);

  const mergedDir = path.join(REPORT_ROOT, 'merged');
  collectBlobsInto(mergedDir, shardCount, REPORT_ROOT);
  console.log('[e2eShards] merging shard reports into one HTML report (playwright-report/)');
  const mergeCode = await run('npx', ['playwright', 'merge-reports', '--reporter', 'html', mergedDir]);
  if (mergeCode !== 0) {
    console.error(`[e2eShards] merge-reports failed (exit ${mergeCode})`);
  }

  if (failed) {
    console.error('[e2eShards] one or more shards failed — see prefixed output above and playwright-report/');
    process.exit(1);
  }
  console.log('[e2eShards] all shards passed. Report: playwright-report/index.html');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('[e2eShards] fatal:', err);
    process.exit(1);
  });
}
