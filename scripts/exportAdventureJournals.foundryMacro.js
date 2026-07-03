/*
 * CNMH adventure-room import, S0 — raw journal/hazard dump from a premium
 * adventure module. NOT a Node script: paste the whole file into a Foundry
 * script Macro (or the F12 console) and run it AS GM in the world where the
 * module is enabled. Foundry v13 / PF2e v6.x.
 *
 * It downloads one JSON file via the browser containing every JournalEntry
 * (full page HTML included) and every hazard-type Actor the module ships,
 * whether the packs hold them directly or embedded in Adventure documents
 * (how Paizo premium modules are packaged).
 *
 * The dump is Paizo book text — this repo is PUBLIC, so NEVER commit it.
 * Save it under adventure-dumps/ (gitignored) and hand it to the transform
 * script from there.
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
  const packIndex = [];

  for (const pack of packs) {
    const type = pack.metadata.type;
    packIndex.push({
      collection: pack.collection,
      type,
      label: pack.metadata.label,
      size: pack.index.size,
    });
    if (!['Adventure', 'JournalEntry', 'Actor'].includes(type)) continue;
    console.log(`CNMH dump | reading ${pack.collection} (${type})...`);
    const docs = await pack.getDocuments();
    for (const doc of docs) {
      if (type === 'Adventure') {
        // Premium Paizo modules ship as Adventure documents embedding the
        // journals/actors wholesale — unwrap them.
        for (const j of doc.journal) if (wanted(j.name)) journals.push(j.toObject());
        for (const a of doc.actors) if (a.type === 'hazard') hazards.push(a.toObject());
      } else if (type === 'JournalEntry') {
        if (wanted(doc.name)) journals.push(doc.toObject());
      } else if (doc.type === 'hazard') {
        hazards.push(doc.toObject());
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
  };
  save(JSON.stringify(out, null, 2), 'text/json', `${MODULE_ID}-journal-dump.json`);
  ui.notifications.info(
    `CNMH dump | exported ${journals.length} journals + ${hazards.length} hazards from ${packs.length} packs — check your downloads folder.`
  );
})();
