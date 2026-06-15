// Single source of truth for "which docs reference which image?" — shared by the
// image delete-guard and the orphaned-image GC (#399).
//
// Images are referenced two ways across the content model:
//   - a bare catalog id in an `image` field (items, lore, characters, and —
//     crucially — nested ability/action/feat subforms, see AbilitySubforms), and
//   - a full `/api/images/<id>` URL in `bestiary.img` on captured monster docs.
// Both normalize to the same id space (the R2 key / catalog id, incl. extension).
//
// The scan is a DEEP walk: an `image` key anywhere in a doc counts as a
// reference to that doc, so nested ability images are not missed (the previous
// shallow, hand-enumerated walk did miss them).

// Extract `<id>` from a `…/api/images/<id>` URL, else null.
export function imageIdFromUrl(str) {
  if (typeof str !== 'string') return null;
  const m = str.match(/\/api\/images\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// An `image` field may hold a bare id or (defensively) a public URL; normalize
// either to the bare id.
function normalizeImageId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return imageIdFromUrl(trimmed) || trimmed;
}

// Collect every image id referenced anywhere within a single doc.
//   - key `image` → bare id (or normalized from a URL)
//   - key `img`   → only when it's a `/api/images/<id>` URL (conservative, so
//                   arbitrary `img` strings elsewhere aren't treated as ids)
function collectImageIds(node, out) {
  if (Array.isArray(node)) {
    for (const v of node) collectImageIds(v, out);
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'image' && typeof value === 'string') {
      const id = normalizeImageId(value);
      if (id) out.add(id);
    } else if (key === 'img' && typeof value === 'string') {
      const id = imageIdFromUrl(value.trim());
      if (id) out.add(id);
    } else if (value && typeof value === 'object') {
      collectImageIds(value, out);
    }
  }
  return out;
}

// Build a Map<imageId, Array<{collection, id, name}>> over a content snapshot
// payload ({ item: [...], lore: [...], character: [...], monster: [...], ... }).
// Each entry lists the docs that reference that image, so the delete-guard can
// report them and the GC can treat any keyed image as "referenced".
export function scanImageReferences(payload) {
  const map = new Map();
  const add = (imageId, ref) => {
    if (!imageId) return;
    let refs = map.get(imageId);
    if (!refs) { refs = []; map.set(imageId, refs); }
    // A doc may reference the same image in several nested spots — list it once.
    if (!refs.some((r) => r.collection === ref.collection && r.id === ref.id)) {
      refs.push(ref);
    }
  };

  for (const [collection, docs] of Object.entries(payload || {})) {
    if (!Array.isArray(docs)) continue;
    for (const doc of docs) {
      if (!doc || typeof doc !== 'object') continue;
      const ref = { collection, id: doc.id, name: doc.name || doc.title || doc.id };
      const ids = collectImageIds(doc, new Set());
      for (const imageId of ids) add(imageId, ref);
    }
  }
  return map;
}

export default scanImageReferences;
