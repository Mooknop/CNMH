// Refresh the vendored free-tier JB2A database paths (#1456, epic #1414).
//
// JB2A publishes its Sequencer databases at Jules-Bens-Aa/jb2a-databases;
// the free module's database-paths.json is the flat list of every valid
// Sequencer key in the free pack. src/data/fxAnimationsKeys.test.js validates
// every fxAnimations `play.file` against this vendored copy, so a typo'd or
// Patreon-only key fails CI instead of silently playing nothing at the table.
//
// Re-run after installing a new JB2A release in Foundry (key names drift
// between versions):
//   node scripts/refreshJb2aDatabase.js
// then commit the updated scripts/data/jb2a-free-database-paths.json.
// Dev tooling only — the vendored file must never ship in the app bundle.

const fs = require('fs');
const path = require('path');

const SOURCE =
  'https://raw.githubusercontent.com/Jules-Bens-Aa/jb2a-databases/main/JB2A_DnD5e/json/database-paths.json';
const OUT = path.join(__dirname, 'data', 'jb2a-free-database-paths.json');

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  const paths = await res.json();
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('unexpected payload — wanted a non-empty array of database paths');
  }
  const out = {
    source: SOURCE,
    module: 'JB2A_DnD5e (free)',
    fetchedAt: new Date().toISOString().slice(0, 10),
    paths: [...paths].sort(),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${paths.length} paths to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
