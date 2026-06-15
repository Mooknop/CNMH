import { describe, test, expect } from 'vitest';
import { scanImageReferences, imageIdFromUrl } from './imageReferences.js';

describe('imageIdFromUrl', () => {
  test('extracts the id from a public image URL', () => {
    expect(imageIdFromUrl('/api/images/tok_abc.webp')).toBe('tok_abc.webp');
    expect(imageIdFromUrl('https://cnmh.example/api/images/img_123.png')).toBe('img_123.png');
  });

  test('ignores query/hash and decodes', () => {
    expect(imageIdFromUrl('/api/images/img_1.png?v=2')).toBe('img_1.png');
  });

  test('returns null for non-image URLs and non-strings', () => {
    expect(imageIdFromUrl('/foo/bar')).toBeNull();
    expect(imageIdFromUrl('tok_abc.webp')).toBeNull(); // bare id, not a URL
    expect(imageIdFromUrl(null)).toBeNull();
    expect(imageIdFromUrl(42)).toBeNull();
  });
});

describe('scanImageReferences', () => {
  test('finds top-level image refs on items, lore, and characters', () => {
    const payload = {
      item: [{ id: 'i1', name: 'Sword', image: 'img_a.png' }],
      lore: [{ id: 'l1', title: 'Sandpoint', image: 'img_b.png' }],
      character: [{ id: 'c1', name: 'Vex', image: 'img_c.png' }],
    };
    const map = scanImageReferences(payload);
    expect(map.get('img_a.png')).toEqual([{ collection: 'item', id: 'i1', name: 'Sword' }]);
    expect(map.get('img_b.png')).toEqual([{ collection: 'lore', id: 'l1', name: 'Sandpoint' }]);
    expect(map.get('img_c.png')).toEqual([{ collection: 'character', id: 'c1', name: 'Vex' }]);
  });

  test('finds nested familiar / animalCompanion images under the owning character', () => {
    const payload = {
      character: [{
        id: 'c1', name: 'Vex',
        familiar: { image: 'img_fam.png' },
        animalCompanion: { image: 'img_pet.png' },
      }],
    };
    const map = scanImageReferences(payload);
    expect(map.get('img_fam.png')).toEqual([{ collection: 'character', id: 'c1', name: 'Vex' }]);
    expect(map.get('img_pet.png')).toEqual([{ collection: 'character', id: 'c1', name: 'Vex' }]);
  });

  test('finds DEEPLY nested ability/action images (the shallow-scan blind spot)', () => {
    const payload = {
      character: [{
        id: 'c1', name: 'Vex',
        feats: [
          { name: 'Feat', abilities: [{ name: 'Power', image: 'img_deep.png' }] },
        ],
      }],
    };
    const map = scanImageReferences(payload);
    expect(map.get('img_deep.png')).toEqual([{ collection: 'character', id: 'c1', name: 'Vex' }]);
  });

  test('matches monster bestiary.img token URLs by id', () => {
    const payload = {
      monster: [{ id: 'm1', name: 'Goblin', bestiary: { img: '/api/images/tok_g.webp' } }],
    };
    const map = scanImageReferences(payload);
    expect(map.get('tok_g.webp')).toEqual([{ collection: 'monster', id: 'm1', name: 'Goblin' }]);
  });

  test('normalizes an image field given as a URL to the bare id', () => {
    const payload = { item: [{ id: 'i1', name: 'Sword', image: '/api/images/img_a.png' }] };
    expect(scanImageReferences(payload).get('img_a.png')).toEqual([
      { collection: 'item', id: 'i1', name: 'Sword' },
    ]);
  });

  test('lists every doc that references the same (deduped) image', () => {
    const payload = {
      monster: [
        { id: 'm1', name: 'Goblin A', bestiary: { img: '/api/images/tok_g.webp' } },
        { id: 'm2', name: 'Goblin B', bestiary: { img: '/api/images/tok_g.webp' } },
      ],
    };
    const refs = scanImageReferences(payload).get('tok_g.webp');
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.id).sort()).toEqual(['m1', 'm2']);
  });

  test('lists a doc once even if it references the same image in multiple spots', () => {
    const payload = {
      character: [{
        id: 'c1', name: 'Vex',
        image: 'img_dup.png',
        familiar: { image: 'img_dup.png' },
      }],
    };
    expect(scanImageReferences(payload).get('img_dup.png')).toEqual([
      { collection: 'character', id: 'c1', name: 'Vex' },
    ]);
  });

  test('returns an empty map for unreferenced images and tolerates junk input', () => {
    expect(scanImageReferences({ item: [{ id: 'i1', name: 'No image' }] }).size).toBe(0);
    expect(scanImageReferences({}).size).toBe(0);
    expect(scanImageReferences(null).size).toBe(0);
    expect(scanImageReferences({ item: [null, 'nope', 42] }).size).toBe(0);
  });

  test('ignores imagePosition and other non-image object fields', () => {
    const payload = {
      item: [{ id: 'i1', name: 'Sword', image: 'img_a.png', imagePosition: { x: 50, y: 50 } }],
    };
    const map = scanImageReferences(payload);
    expect(map.size).toBe(1);
    expect(map.has('img_a.png')).toBe(true);
  });
});
