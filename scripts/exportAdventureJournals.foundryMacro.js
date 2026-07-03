/*
 * CNMH adventure-room import — raw dump from a premium adventure module. NOT a
 * Node script: paste the whole file into a Foundry script Macro (or the F12
 * console) and run it AS GM in the world where the module is enabled.
 * Foundry v13 / PF2e v6.x.
 *
 * Exports one JSON file containing:
 *   - journals   : every JournalEntry (full page HTML) — room text (#1074)
 *   - hazards    : every hazard-type Actor with Stealth DCs (#1074)
 *   - lootActors : every loot-type Actor WITH its embedded items — these are the
 *                  treasure chests placed on scenes; their items are the real
 *                  PF2e item docs a room's Treasure points at (#1085 T0)
 *   - items      : standalone Item-pack docs + Adventure-embedded items (#1085)
 *   - actorIndex : { _id, name, type } for every actor seen, so the analysis can
 *                  classify each Treasure @UUID[Actor.<id>] reference (#1085)
 * whether the packs hold these directly or embedded in Adventure documents
 * (how Paizo premium modules are packaged).
 *
 * The dump is Paizo book text — this repo is PUBLIC, so NEVER commit it. Save it
 * under adventure-dumps/ (gitignored) and import it via World → Rooms (or the
 * CLI). Fields are additive: the existing room transform ignores the new ones.
 */

(async () => {
  const MODULE_ID = 'pf2e-ap200-seven-dooms-for-sandpoint';
  // Optional case-insensitive substring on journal names to dump a subset
  // (e.g. 'chapter 1' for a first sample). Empty string = everything.
  const JOURNAL_FILTER = '';

  const save = foundry?.utils?.saveDataToFile ?? saveDataToFile;
  const packs = game.packs.filter((p) => p.metadata.packageName === MODULE_ID);
  if (!packs.length) {
    ui.notifications.error(
      `CNMH dump | no compendium packs found for "${MODULE_ID}" — is the module installed and enabled in this world?`
    );
    return;
  }

  const wanted = (name) =>
    !JOURNAL_FILTER || (name ?? '').toLowerCase().includes(JOURNAL_FILTER.toLowerCase());

  const journals = [];
  const hazards = [];
  const lootActors = [];
  const items = [];
  const actorIndex = [];
  const packIndex = [];

  // Record an actor: always index it (id/name/type), and keep the full object
  // for hazards (Stealth DCs) and loot actors (embedded treasure items).
  const takeActor = (a) => {
    actorIndex.push({ _id: a._id ?? a.id, name: a.name, type: a.type });
    if (a.type === 'hazard') hazards.push(a.toObject());
    else if (a.type === 'loot') lootActors.push(a.toObject());
  };

  for (const pack of packs) {
    const type = pack.metadata.type;
    packIndex.push({
      collection: pack.collection,
      type,
      label: pack.metadata.label,
      size: pack.index.size,
    });
    if (!['Adventure', 'JournalEntry', 'Actor', 'Item'].includes(type)) continue;
    console.log(`CNMH dump | reading ${pack.collection} (${type})...`);
    const docs = await pack.getDocuments();
    for (const doc of docs) {
      if (type === 'Adventure') {
        // Premium Paizo modules ship as Adventure documents embedding the
        // journals/actors/items wholesale — unwrap them.
        for (const j of doc.journal) if (wanted(j.name)) journals.push(j.toObject());
        for (const a of doc.actors) takeActor(a);
        for (const it of doc.items ?? []) items.push(it.toObject());
      } else if (type === 'JournalEntry') {
        if (wanted(doc.name)) journals.push(doc.toObject());
      } else if (type === 'Actor') {
        takeActor(doc);
      } else if (type === 'Item') {
        items.push(doc.toObject());
      }
    }
  }

  const out = {
    module: MODULE_ID,
    foundry: game.version,
    system: `${game.system.id} ${game.system.version}`,
    exportedAt: new Date().toISOString(),
    journalFilter: JOURNAL_FILTER || null,
    packs: packIndex,
    journals,
    hazards,
    lootActors,
    items,
    actorIndex,
  };
  save(JSON.stringify(out, null, 2), 'text/json', `${MODULE_ID}-journal-dump.json`);
  ui.notifications.info(
    `CNMH dump | exported ${journals.length} journals, ${hazards.length} hazards, ` +
      `${lootActors.length} loot actors, ${items.length} items (${actorIndex.length} actors indexed) ` +
      `from ${packs.length} packs — check your downloads folder.`
  );
})();
