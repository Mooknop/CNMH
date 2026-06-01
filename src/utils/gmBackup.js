// Client-side backup/restore safety net for GM content. No backend change:
// the backup is just the public /api/content snapshot, and restore feeds it
// back through the existing force-seed route (see gmApi.seedFromBackup).

import { seedFromBackup } from './gmApi';

const KNOWN = ['quest', 'faction', 'calendar', 'lore', 'trait', 'character', 'theme'];

// A backup may be the bare snapshot ({ quest: [...] }) or the /api/content
// envelope ({ payload: { quest: [...] } }). Accept either.
const unwrap = (parsed) =>
  parsed && typeof parsed === 'object' && parsed.payload && typeof parsed.payload === 'object'
    ? parsed.payload
    : parsed;

// Keep only known collections that are arrays; reject if none qualify so a
// malformed/unrelated file can't wipe the store via a force reseed.
const sanitize = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Backup file is not valid JSON content.');
  }
  const out = {};
  for (const key of KNOWN) {
    if (Array.isArray(snapshot[key])) out[key] = snapshot[key];
  }
  if (Object.keys(out).length === 0) {
    throw new Error('Backup file has no recognizable campaign collections.');
  }
  return out;
};

export const downloadBackup = async () => {
  const res = await fetch('/api/content', { credentials: 'include' });
  if (!res.ok) throw new Error(`Couldn’t fetch content (HTTP ${res.status}).`);
  const body = await res.json();
  const snapshot = unwrap(body);
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cnmh-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return snapshot;
};

export const restoreBackup = async (file) => {
  if (!file) throw new Error('No backup file selected.');
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  const collections = sanitize(unwrap(parsed));
  return seedFromBackup(collections);
};
