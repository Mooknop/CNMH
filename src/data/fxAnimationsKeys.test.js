// fxAnimations catalog validation (#1456, epic #1414) — the CI gate that keeps
// growing the animation catalog safe. A typo'd or Patreon-only Sequencer key
// plays NOTHING at the table with no visible error, so every rule in the shard
// is checked here against the vendored free-tier JB2A database
// (scripts/data/jb2a-free-database-paths.json — refresh with
// `node scripts/refreshJb2aDatabase.js` after a JB2A release).
//
// This runs on content PRs — exactly where new animations arrive.
import fs from 'fs';
import path from 'path';
import { FX_SHAPES } from '../../foundry-bridge/animations';
import { strikeFxFacts, spellFxFacts } from '../utils/fxPlay';

const rules = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'snapshot', 'fxAnimations.json'), 'utf8')
);
const db = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'scripts', 'data', 'jb2a-free-database-paths.json'), 'utf8')
);

// A key is playable when it's an exact database leaf or a dot-boundary prefix
// of one — Sequencer resolves prefixes to their variants (random pick for
// numbered leaves, distance pick for ranged `...ft` leaves).
const playable = (key) =>
  db.paths.some((p) => p === key || p.startsWith(`${key}.`));

// The matcher vocabulary is whatever facts the resolver actually produces —
// a `when` key outside it can never match anything (fxPlay.js degrades it to
// a dead rule, silently), which on a catalog entry is always a typo. Union of
// the strike and spell fact bags.
const MATCHER_KEYS = new Set([
  ...Object.keys(strikeFxFacts({})),
  ...Object.keys(spellFxFacts({})),
]);

// Opts the bridge honors (pf2eAdapter playMeleeEffect/playProjectileEffect).
// Unknown opts are silently ignored bridge-side — flag them here instead.
const OPTS_KEYS = new Set(['scale', 'tint']);

describe('fxAnimations catalog (#1456)', () => {
  it('vendored JB2A database is present and plausible', () => {
    expect(Array.isArray(db.paths)).toBe(true);
    expect(db.paths.length).toBeGreaterThan(1000);
    expect(db.module).toMatch(/free/i);
  });

  it.each(rules.map((r) => [r.id, r]))('%s plays a real free-tier JB2A key', (id, rule) => {
    expect(typeof rule.play?.file).toBe('string');
    if (!playable(rule.play.file)) {
      throw new Error(
        `${id}: "${rule.play.file}" is not in the free JB2A database — check the key in ` +
        'Sequencer\'s Database Viewer (it may be Patreon-only or renamed), or refresh the ' +
        'vendored database with `node scripts/refreshJb2aDatabase.js`.'
      );
    }
  });

  it.each(rules.map((r) => [r.id, r]))('%s uses a shape the bridge implements', (id, rule) => {
    expect(FX_SHAPES).toContain(rule.play?.shape);
  });

  it.each(rules.map((r) => [r.id, r]))('%s matcher keys are in the resolver vocabulary', (id, rule) => {
    for (const key of Object.keys(rule.when || {})) {
      if (!MATCHER_KEYS.has(key)) {
        throw new Error(
          `${id}: when.${key} is not a resolver fact (${[...MATCHER_KEYS].join(', ')}) — ` +
          'the rule would silently never match.'
        );
      }
    }
  });

  it.each(rules.map((r) => [r.id, r]))('%s opts are bridge-honored keys', (id, rule) => {
    for (const key of Object.keys(rule.play?.opts || {})) {
      expect(OPTS_KEYS).toContain(key);
    }
  });
});
