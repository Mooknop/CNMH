import { expect, type Page, type WebSocketRoute } from '@playwright/test';

/**
 * Mock the campaign session relay (`/session/<campaignId>`) with
 * `page.routeWebSocket`, mirroring `worker/CampaignSession.js`:
 *
 *   - on connect, server → client: { type:'FULL_STATE', payload }
 *     where payload = { [characterId]: { [stateType]: value } }
 *   - client → server: { type:'UPDATE', characterId, key:stateType, value }
 *     the real DO records it and broadcasts to *other* peers (never the sender);
 *     `SessionContext.sendUpdate` already notifies local subscribers, so this
 *     mock likewise must NOT echo a client UPDATE back.
 *
 * Test authors work in `cnmh_<type>_<id>` keys (what `useSyncedState` consumes);
 * the fixture decomposes them with the same regex the hook uses
 * (`src/hooks/useSyncedState.jsx`): `cnmh_<type>_<id>` → (characterId=<id>,
 * stateType=<type>). So `cnmh_moveopts_e2e-mover` → ('e2e-mover', 'moveopts').
 *
 * Use it to (a) seed synced state deterministically and (b) *simulate a peer the
 * real backend can't provide* — above all the Foundry bridge (movement, roster,
 * requested saves, applied damage). It composes with the real backend: only
 * `/session` is intercepted, so `/content-sync` + `/api/content` still load real
 * content from the local stack.
 *
 * Opt-in: only specs that call `mockSession` are mocked; everything else keeps
 * the real relay. Call it BEFORE `page.goto` — routeWebSocket intercepts on connect.
 */

// One campaign per deployment; matches CAMPAIGN_ID in src/data/campaign.js and
// worker/index.js. e2e is a separate TS project, so it's duplicated here.
const DEFAULT_CAMPAIGN_ID = 'osprey-covey';

const KEY_RE = /^cnmh_([^_]+)_(.+)$/;

const decompose = (key: string): { characterId: string; stateType: string } => {
  const m = typeof key === 'string' ? key.match(KEY_RE) : null;
  if (!m) throw new Error(`mockSession: "${key}" is not a synced cnmh_<type>_<id> key`);
  return { stateType: m[1], characterId: m[2] };
};

export type SentMessage = { characterId: string; stateType: string; value: unknown };
type SentHandler = (value: any, msg: SentMessage) => void;

export type MockSession = {
  /** Push an UPDATE to the page as if from another peer (e.g. the bridge). */
  push(cnmhKey: string, value: unknown): void;
  /** React to a client UPDATE for `cnmhKey`; the handler may `push` a response. */
  onSent(cnmhKey: string, handler: SentHandler): void;
  /** Wait until the app has sent an UPDATE for `cnmhKey` (optionally matching). */
  expectSent(
    cnmhKey: string,
    matcher?: (value: any) => boolean,
    opts?: { timeout?: number },
  ): Promise<any>;
  /** Raw recorded client → server UPDATEs, in order, for ad-hoc assertions. */
  readonly sent: SentMessage[];
};

export async function mockSession(
  page: Page,
  { seed = {}, campaignId = DEFAULT_CAMPAIGN_ID }: { seed?: Record<string, unknown>; campaignId?: string } = {},
): Promise<MockSession> {
  const sent: SentMessage[] = [];
  const handlers: Array<{ characterId: string; stateType: string; handler: SentHandler }> = [];
  let activeWs: WebSocketRoute | null = null;

  // Build the FULL_STATE payload from the seed (each value keyed by cnmh_*).
  const payload: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(seed)) {
    const { characterId, stateType } = decompose(key);
    (payload[characterId] ??= {})[stateType] = value;
  }

  await page.routeWebSocket(`**/session/${campaignId}`, (ws) => {
    activeWs = ws;
    // Replay seeded state on (re)connect, exactly like the DO does.
    ws.send(JSON.stringify({ type: 'FULL_STATE', payload }));

    ws.onMessage((raw) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
      } catch {
        return;
      }
      if (msg?.type !== 'UPDATE' || !msg.characterId || !msg.key) return;
      const record: SentMessage = { characterId: msg.characterId, stateType: msg.key, value: msg.value };
      sent.push(record);
      // No echo to the sender (the real server excludes it).
      for (const h of handlers) {
        if (h.characterId === record.characterId && h.stateType === record.stateType) {
          h.handler(record.value, record);
        }
      }
    });
  });

  return {
    sent,

    push(cnmhKey, value) {
      const { characterId, stateType } = decompose(cnmhKey);
      if (!activeWs) {
        throw new Error(`mockSession.push("${cnmhKey}"): no active socket yet — the page hasn't connected`);
      }
      activeWs.send(JSON.stringify({ type: 'UPDATE', characterId, key: stateType, value }));
    },

    onSent(cnmhKey, handler) {
      const { characterId, stateType } = decompose(cnmhKey);
      handlers.push({ characterId, stateType, handler });
    },

    async expectSent(cnmhKey, matcher, opts = {}) {
      const { characterId, stateType } = decompose(cnmhKey);
      let value: any;
      await expect
        .poll(
          () => {
            const hit = sent.find(
              (m) => m.characterId === characterId && m.stateType === stateType && (!matcher || matcher(m.value)),
            );
            value = hit?.value;
            return !!hit;
          },
          { timeout: opts.timeout ?? 5000, message: `app never sent ${cnmhKey} matching the predicate` },
        )
        .toBe(true);
      return value;
    },
  };
}
