import { describe, test, expect } from 'vitest';
import { computeImageOrphans, computeUnregisteredImages } from './imageOrphans.js';

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const GRACE = DAY;
const OLD = NOW - 2 * DAY;   // outside grace
const FRESH = NOW - 1000;    // inside grace

const run = (over = {}) =>
  computeImageOrphans({ now: NOW, graceMs: GRACE, ...over });

describe('computeImageOrphans (#399)', () => {
  test('buckets an unreferenced image that has both bytes and catalog', () => {
    const r = run({
      r2Objects: [{ key: 'img_a.png', uploaded: OLD, size: 100 }],
      catalog: [{ id: 'img_a.png', name: 'A', createdAt: OLD }],
      referencedIds: new Set(),
    });
    expect(r.unreferenced).toEqual([{ id: 'img_a.png', name: 'A', size: 100, uploaded: OLD }]);
    expect(r.bytesWithoutCatalog).toEqual([]);
    expect(r.catalogWithoutBytes).toEqual([]);
  });

  test('a referenced image is never an orphan', () => {
    const r = run({
      r2Objects: [{ key: 'tok_g.webp', uploaded: OLD, size: 50 }],
      catalog: [{ id: 'tok_g.webp', name: 'Goblin', createdAt: OLD }],
      referencedIds: new Set(['tok_g.webp']),
    });
    expect(r.unreferenced).toEqual([]);
    expect(r.referencedCount).toBe(1);
  });

  test('catalog row whose bytes are gone → catalogWithoutBytes', () => {
    const r = run({
      r2Objects: [],
      catalog: [{ id: 'img_gone.png', name: 'Gone', createdAt: OLD }],
      referencedIds: new Set(),
    });
    expect(r.catalogWithoutBytes).toEqual([{ id: 'img_gone.png', name: 'Gone', createdAt: OLD }]);
    expect(r.unreferenced).toEqual([]);
  });

  test('R2 object with no catalog row, unreferenced → bytesWithoutCatalog', () => {
    const r = run({
      r2Objects: [{ key: 'tok_orphan.webp', uploaded: OLD, size: 77 }],
      catalog: [],
      referencedIds: new Set(),
    });
    expect(r.bytesWithoutCatalog).toEqual([{ id: 'tok_orphan.webp', size: 77, uploaded: OLD }]);
  });

  test('bytes-without-catalog that ARE referenced are protected (partial-write safety)', () => {
    // bridge wrote tok bytes + the monster doc, but the catalog PUT failed.
    const r = run({
      r2Objects: [{ key: 'tok_ref.webp', uploaded: OLD, size: 77 }],
      catalog: [],
      referencedIds: new Set(['tok_ref.webp']),
    });
    expect(r.bytesWithoutCatalog).toEqual([]);
  });

  test('grace window protects freshly-created objects in every bucket', () => {
    const r = run({
      r2Objects: [
        { key: 'img_fresh.png', uploaded: FRESH, size: 1 },   // both, fresh
        { key: 'tok_fresh.webp', uploaded: FRESH, size: 2 },  // bytes-only, fresh
      ],
      catalog: [
        { id: 'img_fresh.png', name: 'Fresh', createdAt: FRESH },
        { id: 'cat_fresh.png', name: 'CatFresh', createdAt: FRESH }, // catalog-only, fresh
      ],
      referencedIds: new Set(),
    });
    expect(r.unreferenced).toEqual([]);
    expect(r.bytesWithoutCatalog).toEqual([]);
    expect(r.catalogWithoutBytes).toEqual([]);
  });

  test('grace is per-object: protects the fresh half of the byte upload pair', () => {
    // catalog row is old but the bytes were just re-uploaded → still protected.
    const r = run({
      r2Objects: [{ key: 'img_x.png', uploaded: FRESH, size: 1 }],
      catalog: [{ id: 'img_x.png', name: 'X', createdAt: OLD }],
      referencedIds: new Set(),
    });
    expect(r.unreferenced).toEqual([]);
  });

  test('reports scan totals and referenced count', () => {
    const r = run({
      r2Objects: [{ key: 'a', uploaded: OLD, size: 1 }, { key: 'b', uploaded: OLD, size: 1 }],
      catalog: [{ id: 'a', name: 'A', createdAt: OLD }],
      referencedIds: new Set(['a']),
    });
    expect(r.totalR2).toBe(2);
    expect(r.totalCatalog).toBe(1);
    expect(r.referencedCount).toBe(1);
    // 'a' is referenced; 'b' is bytes-without-catalog, unreferenced, old → reapable
    expect(r.bytesWithoutCatalog).toEqual([{ id: 'b', size: 1, uploaded: OLD }]);
  });

  test('tolerates empty input', () => {
    const r = computeImageOrphans();
    expect(r).toMatchObject({
      unreferenced: [], catalogWithoutBytes: [], bytesWithoutCatalog: [],
      referencedCount: 0, totalR2: 0, totalCatalog: 0,
    });
  });
});

describe('computeUnregisteredImages (#757)', () => {
  test('returns R2 objects with no catalog row', () => {
    const out = computeUnregisteredImages({
      r2Objects: [
        { key: 'img_a.png', uploaded: 10, size: 100 },  // registered
        { key: 'tok_b.webp', uploaded: 20, size: 200 },  // stranded
      ],
      catalog: [{ id: 'img_a.png', name: 'A' }],
    });
    expect(out).toEqual([{ id: 'tok_b.webp', size: 200, uploaded: 20 }]);
  });

  test('is NOT grace- or reference-gated — adoption only adds metadata', () => {
    // A fresh upload and a referenced-but-unregistered tok are both adoptable:
    // there is no `referencedIds`/grace input here at all.
    const out = computeUnregisteredImages({
      r2Objects: [
        { key: 'img_fresh.png', uploaded: Date.now(), size: 1 },
        { key: 'tok_ref.webp', uploaded: 5, size: 2 },
      ],
      catalog: [],
    });
    expect(out.map((o) => o.id)).toEqual(['img_fresh.png', 'tok_ref.webp']);
  });

  test('handles both id formats and missing size/uploaded', () => {
    const out = computeUnregisteredImages({
      r2Objects: [{ key: 'tok_c.jpg' }],
      catalog: [],
    });
    expect(out).toEqual([{ id: 'tok_c.jpg', size: null, uploaded: null }]);
  });

  test('empty when every R2 object is already catalogued', () => {
    const out = computeUnregisteredImages({
      r2Objects: [{ key: 'img_a.png', uploaded: 1, size: 1 }],
      catalog: [{ id: 'img_a.png' }],
    });
    expect(out).toEqual([]);
  });

  test('tolerates empty input', () => {
    expect(computeUnregisteredImages()).toEqual([]);
  });
});
