// Token-image resolution for the bestiary (#394).
//
// A Foundry actor's `img` is a *server-relative* path like "tokens/goblin.webp".
// Emitting it verbatim makes the app render it against its OWN origin (Cloudflare),
// where it 404s. The bridge is the only session peer that can read the bytes — it
// runs inside the Foundry browser, same origin as the Foundry asset server — so it
// fetches them and POSTs to the Worker's BRIDGE_SECRET-gated /api/bridge/image
// endpoint, which stores them in R2 (content-addressed) and returns a stable,
// public /api/images URL. That URL is what we put in bestiary.img; the app
// persists it verbatim onto the monster doc, so it survives past the encounter.
//
// The encounter payload is built synchronously while resolution is async, so we
// cache by raw image path: resolveTokenUrl() returns the cached URL (or null on
// first sighting) and ensureTokenUploaded() fills the cache, invoking a callback
// so the caller can re-push the encounter once the URL is known.

import { WORKER_WSS_URL } from './config.js';
import { getBridgeSecret } from './secret.js';
import { getModuleSetting } from './pf2eAdapter.js';

const MODULE_ID = 'cnmh-bridge';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 1.5 * 1024 * 1024;

const _cache = new Map();     // rawImg → resolved url (stable, or absolute fallback)
const _inflight = new Set();  // rawImg currently resolving (dedupe concurrent sightings)

// Reset caches — called on (re)connection so a changed worker URL can't linger.
export function initTokenImages() {
  _cache.clear();
  _inflight.clear();
}

// Synchronous: the resolved URL for this image if we've already resolved it, else
// null (first sighting — caller should kick off ensureTokenUploaded()).
export function resolveTokenUrl(rawImg) {
  if (!rawImg) return null;
  return _cache.get(rawImg) ?? null;
}

// Async, idempotent per rawImg. Resolves the image to a stable app URL (uploading
// the bytes to R2) and caches it; falls back to the absolute Foundry URL when the
// bytes can't be fetched (cross-origin/opaque, e.g. Forge CDN art) or uploaded.
// Invokes onResolved() once, when the cache is first populated for this image.
export async function ensureTokenUploaded(rawImg, onResolved) {
  if (!rawImg || _cache.has(rawImg) || _inflight.has(rawImg)) return;
  _inflight.add(rawImg);

  // data: URLs render cross-origin as-is — cache verbatim, no upload.
  if (rawImg.startsWith('data:')) {
    finish(rawImg, rawImg, onResolved);
    return;
  }

  let abs;
  try {
    abs = new URL(rawImg, window.location.origin).href;
  } catch {
    _inflight.delete(rawImg);
    return; // unparseable / no window — leave unresolved (app hides the broken img)
  }

  try {
    const res = await fetch(abs);
    if (res.ok) {
      const blob = await res.blob();
      if (ALLOWED_TYPES.includes(blob.type) && blob.size > 0 && blob.size <= MAX_BYTES) {
        const stable = await uploadBytes(blob, rawImg);
        if (stable) { finish(rawImg, stable, onResolved); return; }
      }
    }
  } catch {
    // unreadable (cross-origin/opaque) or upload failed — fall through to fallback
  }

  // Fallback: the absolute Foundry/CDN URL. Renders when public (e.g. Forge); for a
  // private self-hosted instance it still won't load off-origin, but that's the best
  // we can do without the bytes.
  finish(rawImg, abs, onResolved);
}

// POST the bytes to the Worker's bridge-secret-gated upload endpoint. Returns the
// stable /api/images URL on success, or null on any failure.
async function uploadBytes(blob, rawImg) {
  const secret = getBridgeSecret();
  if (!secret) return null;  // unconfigured world — the POST could only 403
  const base = workerHttpBase();
  const url = `${base}/api/bridge/image?key=${encodeURIComponent(secret)}`
    + `&name=${encodeURIComponent(nameFromPath(rawImg))}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

function finish(rawImg, resolvedUrl, onResolved) {
  _cache.set(rawImg, resolvedUrl);
  _inflight.delete(rawImg);
  if (typeof onResolved === 'function') {
    try { onResolved(); } catch { /* re-push is best-effort */ }
  }
}

// wss://host → https://host (ws://→http://) so we can reach the Worker over HTTPS.
function workerHttpBase() {
  const wss = getModuleSetting(MODULE_ID, 'workerUrl') || WORKER_WSS_URL;
  return wss.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

// Human-ish catalog name from the path: basename without extension.
function nameFromPath(rawImg) {
  const base = rawImg.split(/[?#]/)[0].split('/').pop() || rawImg;
  return base.replace(/\.[^.]+$/, '') || base;
}
