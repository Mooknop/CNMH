import { useEffect, useRef } from 'react';
import { useEncounter } from './useEncounter';
import { useContent } from '../contexts/ContentContext';
import { useGmAuth } from './useGmAuth';
import { saveDocument } from '../utils/gmApi';

// GM-only writer that snapshots each enemy's full stat block into the `monster`
// collection the moment it enters an encounter (#332). The Foundry bridge packs
// a rich `bestiary` + `defenses` object onto every enemy `order` entry, but
// nothing persisted it before — only a GM `descriptionOverride` was stored, and
// the stats died when the encounter ended.
//
// Mirrors the EffectExpirySync / PersistentSync pattern: gated on isGm, writes
// via the gmApi REST helper (not useSyncedState — the monster collection lives
// in the content DO, not the session store). Stats refresh on each sighting; the
// GM `descriptionOverride` and the original `capturedAt` are preserved across the
// PUT (which replaces the whole doc). Null-creatureKey (manual/homebrew) enemies
// can't be keyed and are skipped.
export function useBestiaryCapture() {
  const { encounter } = useEncounter();
  const { monsters } = useContent();
  const { isGm } = useGmAuth();
  // creatureKeys already captured this mount — avoids a PUT storm when the
  // content store re-broadcasts our own write back through `monsters`.
  const writtenRef = useRef(new Set());

  useEffect(() => {
    if (!isGm) return;
    const order = encounter?.order || [];
    for (const e of order) {
      if (e.kind !== 'enemy') continue;
      const key = e.creatureKey;
      if (!key) continue; // manual/homebrew enemies have no stable key
      if (writtenRef.current.has(key)) continue;
      writtenRef.current.add(key);

      const existing = monsters.find((m) => m.id === key) || {};
      const now = Date.now();
      const doc = {
        id: key,
        name: existing.name || e.name,
        bestiary: e.bestiary || existing.bestiary || null, // refresh each sighting
        defenses: e.defenses || existing.defenses || null,
        capturedAt: existing.capturedAt || now, // first-seen timestamp is canonical
        lastSeenAt: now,
      };
      // Preserve the GM's redaction/override if one exists.
      if (existing.descriptionOverride !== undefined) {
        doc.descriptionOverride = existing.descriptionOverride;
      }
      // Fire-and-forget; non-GM clients are blocked server-side too.
      saveDocument('monster', key, doc).catch(() => {});
    }
  }, [isGm, encounter, monsters]);
}

export default useBestiaryCapture;
