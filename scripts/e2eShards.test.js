import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parseArgs, shardPort, shardBlobDir, buildPlaywrightArgs, buildShardEnv } from './e2eShards.mjs';

describe('parseArgs', () => {
  it('defaults to 4 shards with no flags or env', () => {
    expect(parseArgs([], {})).toEqual({ shardCount: 4, passthroughArgs: [] });
  });

  it('reads --shards=N off argv', () => {
    expect(parseArgs(['--shards=2'], {})).toEqual({ shardCount: 2, passthroughArgs: [] });
  });

  it('falls back to E2E_SHARDS when no CLI flag is given', () => {
    expect(parseArgs([], { E2E_SHARDS: '6' })).toEqual({ shardCount: 6, passthroughArgs: [] });
  });

  it('CLI flag wins over E2E_SHARDS', () => {
    expect(parseArgs(['--shards=3'], { E2E_SHARDS: '6' })).toEqual({ shardCount: 3, passthroughArgs: [] });
  });

  it('passes through every other arg untouched, in order', () => {
    expect(parseArgs(['--shards=2', '--grep', 'doors', '-x'], {})).toEqual({
      shardCount: 2,
      passthroughArgs: ['--grep', 'doors', '-x'],
    });
  });

  it('rejects a non-positive-integer shard count', () => {
    expect(() => parseArgs(['--shards=0'], {})).toThrow(/positive integer/);
    expect(() => parseArgs([], { E2E_SHARDS: 'nope' })).toThrow(/positive integer/);
  });
});

describe('shardPort', () => {
  it('assigns consecutive ports starting at the base port', () => {
    expect(shardPort(1)).toBe(8788);
    expect(shardPort(2)).toBe(8789);
    expect(shardPort(4)).toBe(8791);
  });

  it('honors a custom base port', () => {
    expect(shardPort(3, 9000)).toBe(9002);
  });
});

describe('shardBlobDir', () => {
  it('gives each shard its own subdirectory under the report root', () => {
    expect(shardBlobDir(1)).toBe(path.join('blob-report-shards', 'shard-1'));
    expect(shardBlobDir(2, 'custom-root')).toBe(path.join('custom-root', 'shard-2'));
  });
});

describe('buildPlaywrightArgs', () => {
  it('builds the shard flag and blob reporter, with passthrough args appended', () => {
    expect(buildPlaywrightArgs(2, 4, ['--grep', 'doors'])).toEqual([
      'playwright',
      'test',
      '--shard=2/4',
      '--reporter=blob',
      '--grep',
      'doors',
    ]);
  });

  it('works with no passthrough args', () => {
    expect(buildPlaywrightArgs(1, 1, [])).toEqual(['playwright', 'test', '--shard=1/1', '--reporter=blob']);
  });
});

describe('buildShardEnv', () => {
  it('sets a distinct port, skips the build step, and points at a distinct blob dir', () => {
    const env = buildShardEnv(2, 4, { PATH: '/usr/bin' });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.E2E_PORT).toBe('8789');
    expect(env.E2E_SKIP_BUILD).toBe('1');
    expect(env.PLAYWRIGHT_BLOB_OUTPUT_DIR).toMatch(/shard-2$/);
  });

  it('never lets two shards collide on port or blob dir', () => {
    const envs = [1, 2, 3, 4].map((i) => buildShardEnv(i, 4, {}));
    expect(new Set(envs.map((e) => e.E2E_PORT)).size).toBe(4);
    expect(new Set(envs.map((e) => e.PLAYWRIGHT_BLOB_OUTPUT_DIR)).size).toBe(4);
  });
});
