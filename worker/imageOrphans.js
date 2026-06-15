// Pure orphan bucketing for the image GC (#399). The audit endpoint supplies the
// live R2 listing, the `image` catalog, and the referenced-id set (from
// scanImageReferences); this just diffs them into reapable buckets.
//
// Inputs:
//   r2Objects:     [{ key, uploaded(ms), size }]        live R2 listing
//   catalog:       [{ id, name, createdAt(ms), ... }]   `image` collection docs
//   referencedIds: Set<string> of image ids referenced by any content doc
//   now:           ms timestamp ("now")
//   graceMs:       protect anything created within this window (in-flight writes)
//
// Buckets:
//   unreferenced         — bytes + catalog present, not referenced  → reap both
//   catalogWithoutBytes  — catalog row whose R2 object is gone       → reap row
//   bytesWithoutCatalog  — R2 object with no catalog row, unreferenced → reap bytes
//
// Reference status only gates the buckets that delete *bytes* (a referenced image
// is never reaped). catalogWithoutBytes deletes a metadata row only — the bytes
// are already gone — so it is not reference-gated.
export function computeImageOrphans({
  r2Objects = [],
  catalog = [],
  referencedIds = new Set(),
  now = Date.now(),
  graceMs = 0,
} = {}) {
  const withinGrace = (ts) => ts != null && now - ts < graceMs;

  const r2Keys = new Set(r2Objects.map((o) => o.key));
  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  const unreferenced = [];
  const bytesWithoutCatalog = [];
  const catalogWithoutBytes = [];

  for (const obj of r2Objects) {
    if (referencedIds.has(obj.key)) continue; // in use — never an orphan
    const cat = catalogById.get(obj.key);
    if (cat) {
      if (withinGrace(obj.uploaded) || withinGrace(cat.createdAt)) continue;
      unreferenced.push({
        id: obj.key,
        name: cat.name || obj.key,
        size: obj.size ?? null,
        uploaded: obj.uploaded ?? null,
      });
    } else {
      if (withinGrace(obj.uploaded)) continue;
      bytesWithoutCatalog.push({
        id: obj.key,
        size: obj.size ?? null,
        uploaded: obj.uploaded ?? null,
      });
    }
  }

  for (const cat of catalog) {
    if (r2Keys.has(cat.id)) continue; // present-in-both handled above
    if (withinGrace(cat.createdAt)) continue;
    catalogWithoutBytes.push({
      id: cat.id,
      name: cat.name || cat.id,
      createdAt: cat.createdAt ?? null,
    });
  }

  return {
    unreferenced,
    catalogWithoutBytes,
    bytesWithoutCatalog,
    referencedCount: referencedIds.size,
    totalR2: r2Objects.length,
    totalCatalog: catalog.length,
  };
}

export default computeImageOrphans;
