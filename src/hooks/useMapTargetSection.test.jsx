import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { useMapTargetSection } from './useMapTargetSection';
import { RELAY } from '../sync/keys';
import { MAP_TARGET_PROTOCOL } from '../utils/movement';

// useSyncedState mirrors every incoming update to REAL window.localStorage, so
// a snapdone left behind by an earlier test would hydrate the next hook
// instance and defeat the capture-gate assertions.
beforeEach(() => window.localStorage.clear());

const ORDER = [
  { entryId: 'e-pc', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e-goblin', kind: 'enemy', name: 'Goblin', disposition: -1 },
  { entryId: 'e-orc', kind: 'enemy', name: 'Orc', disposition: -1 },
  { entryId: 'e-skulker', kind: 'enemy', name: 'Skulker', disposition: -1, hidden: true },
];

// `selectable` is what useTargeting would hand over — hidden entries already
// dropped (#1749 OQ-5, wave 1).
const SELECTABLE = ORDER.filter((e) => !e.hidden && e.entryId !== 'e-pc');

const POSITIONS = {
  gridSize: 100,
  positions: {
    'e-pc': { col: 5, row: 5, width: 1, height: 1, hidden: false },
    'e-goblin': { col: 6, row: 5, width: 1, height: 1, hidden: false },
    'e-orc': { col: 8, row: 5, width: 1, height: 1, hidden: false },
    'e-skulker': { col: 7, row: 7, width: 1, height: 1, hidden: true },
  },
};

// Identity transform over a 1000x1000 world; gridSize 100 → world/1000 = nx.
const ackFor = (id, overrides = {}) => ({
  id,
  ok: true,
  url: '/api/images/aim.webp',
  capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000, sceneId: 'scene-1' },
  worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
  gridSize: 100,
  moverId: 'Pellias',
  trigger: 'request',
  ts: Date.now(),
  ...overrides,
});

const mount = ({ protocol = MAP_TARGET_PROTOCOL, positionsState = POSITIONS, ...opts } = {}) => {
  const toggleTarget = vi.fn();
  const hook = renderHookWithProviders(
    (props) => useMapTargetSection({
      charId: 'Pellias',
      ability: { name: 'Longsword', type: 'melee' },
      order: ORDER,
      positionsState,
      casterEntryId: 'e-pc',
      selectable: SELECTABLE,
      toggleTarget,
      ...props,
    }),
    {
      session: {
        state: {
          global: {
            [RELAY.BRIDGEHELLO]: { protocol },
            [RELAY.FLANKED]: { 'e-goblin': { byCharIds: ['Pellias'] } },
          },
        },
      },
      initialProps: opts,
    }
  );
  return { ...hook, toggleTarget };
};

const sentOf = (session, key) => session.sent.filter((m) => m.stateType === key).at(-1);
const snapreqs = (session) => session.sent.filter((m) => m.stateType === RELAY.SNAPREQ);

// Render the section the hook produced and hand back a tap helper. The image
// occupies a known rect so a tap's normalized position (and the CSS-px snap
// radius that rides with it) are exact.
const showMap = async (hook) => {
  const view = render(hook.result.current.section);
  await act(async () => { fireEvent.click(screen.getByTestId('map-target-show')); });
  return view;
};

const rerenderSection = (view, hook) => view.rerender(hook.result.current.section);

const tapAt = (view, nx, ny) => {
  const img = view.container.querySelector('.msv-img');
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 });
  const frame = view.getByTestId('map-snapshot-frame');
  fireEvent.pointerDown(frame, { pointerId: 1, clientX: nx * 1000, clientY: ny * 1000 });
  fireEvent.pointerUp(frame, { pointerId: 1, clientX: nx * 1000, clientY: ny * 1000 });
};

describe('useMapTargetSection (#1749 S4/S5)', () => {
  describe('eligibility — the chip row is always the fallback', () => {
    it('offers nothing below MAP_TARGET_PROTOCOL', () => {
      const { result } = mount({ protocol: MAP_TARGET_PROTOCOL - 1 });
      expect(result.current.section).toBeNull();
    });

    it('offers nothing without a positions payload', () => {
      const { result } = mount({ positionsState: null });
      expect(result.current.section).toBeNull();
    });

    it('offers nothing when nothing is selectable', () => {
      const { result } = mount({ selectable: [] });
      expect(result.current.section).toBeNull();
    });
  });

  describe('the capture gate (OQ-6/OQ-7 rulings)', () => {
    it('never captures on mount — only an explicit tap does', () => {
      const { result, session } = mount();
      expect(result.current.section).not.toBeNull();
      expect(snapreqs(session)).toHaveLength(0);

      render(result.current.section);
      expect(snapreqs(session)).toHaveLength(0);
      expect(screen.getByTestId('map-target-show')).toBeInTheDocument();
    });

    it('sends ONE attacker-centered snapreq when the player asks for the map', async () => {
      const hook = mount();
      await showMap(hook);

      expect(snapreqs(hook.session)).toHaveLength(1);
      const req = sentOf(hook.session, RELAY.SNAPREQ);
      expect(req.characterId).toBe('global');
      // Melee: framed at the close-quarters radius, centred on the attacker.
      expect(req.value).toMatchObject({ moverId: 'Pellias', radiusFeet: 25 });
    });

    it('refreshes positions at the same moment, so the markers match the picture', async () => {
      const hook = mount();
      expect(sentOf(hook.session, RELAY.POSITIONSREQ)).toBeUndefined();
      await showMap(hook);
      expect(sentOf(hook.session, RELAY.POSITIONSREQ)).toBeDefined();
    });

    it('frames a ranged Strike on its range increment instead', async () => {
      const hook = mount({
        ability: { name: 'Shortbow', type: 'ranged', range: '20 feet' },
        isRangedStrike: true,
      });
      await showMap(hook);
      expect(sentOf(hook.session, RELAY.SNAPREQ).value.radiusFeet).toBe(40);
    });

    it('falls back to a note (never a broken map) when no snapshot comes back', async () => {
      const hook = mount();
      const view = await showMap(hook);
      const req = sentOf(hook.session, RELAY.SNAPREQ);

      await act(async () => {
        hook.session.push('global', RELAY.SNAPDONE, { id: req.value.id, ok: false, ts: Date.now() });
      });
      rerenderSection(view, hook);
      expect(screen.getByText(/No map came back/)).toBeInTheDocument();
      expect(view.container.querySelector('.msv-img')).toBeNull();
    });
  });

  describe('tap → target', () => {
    const ready = async (opts) => {
      const hook = mount(opts);
      const view = await showMap(hook);
      const req = sentOf(hook.session, RELAY.SNAPREQ);
      await act(async () => { hook.session.push('global', RELAY.SNAPDONE, ackFor(req.value.id)); });
      rerenderSection(view, hook);
      return { hook, view };
    };

    it('draws a marker per visible combatant and none for the hidden one', async () => {
      const { view } = await ready();
      const drawn = Array.from(view.container.querySelectorAll('.tmo-marker'))
        .map((g) => g.getAttribute('data-entry-id'));
      expect(drawn).toContain('e-goblin');
      expect(drawn).toContain('e-pc');
      expect(drawn).not.toContain('e-skulker');
    });

    it('a tap on a token toggles exactly that entryId and records the tap order', async () => {
      const { hook, view } = await ready();
      // The goblin occupies world 600..700 → its centre is nx/ny 0.65 / 0.55.
      tapAt(view, 0.65, 0.55);
      expect(hook.toggleTarget).toHaveBeenCalledWith('e-goblin');
      expect(hook.result.current.tapOrder.order).toEqual(['e-goblin']);
    });

    it('a tap on empty ground is a no-op — it never clears the set', async () => {
      const { hook, view } = await ready();
      tapAt(view, 0.05, 0.95);
      expect(hook.toggleTarget).not.toHaveBeenCalled();
      expect(hook.result.current.tapOrder.order).toEqual([]);
    });

    it('a hidden combatant is not tappable even where its token stands', async () => {
      const { hook, view } = await ready();
      tapAt(view, 0.75, 0.75);   // the skulker's cell
      expect(hook.toggleTarget).not.toHaveBeenCalled();
    });

    it('records tap ORDER, which multi-ray consumes as its per-ray default', async () => {
      const { hook, view } = await ready();
      tapAt(view, 0.85, 0.55);   // orc first
      tapAt(view, 0.65, 0.55);   // goblin second
      expect(hook.result.current.tapOrder.order).toEqual(['e-orc', 'e-goblin']);
    });

    it('caps the tap order at maxTaps without disturbing the target set', async () => {
      const { hook, view } = await ready({ maxTaps: 1 });
      tapAt(view, 0.85, 0.55);
      tapAt(view, 0.65, 0.55);
      expect(hook.result.current.tapOrder.order).toEqual(['e-orc']);
      // useTargeting is still told about BOTH taps — the cap is the map's own
      // ordering contract, not a targeting maximum (there has never been one).
      expect(hook.toggleTarget).toHaveBeenCalledTimes(2);
    });
  });

  describe('what the markers say (S5)', () => {
    const readyWith = async (opts) => {
      const hook = mount(opts);
      const view = await showMap(hook);
      const req = sentOf(hook.session, RELAY.SNAPREQ);
      await act(async () => { hook.session.push('global', RELAY.SNAPDONE, ackFor(req.value.id)); });
      rerenderSection(view, hook);
      return view;
    };

    it('rings the markers already in the target set', async () => {
      const view = await readyWith({ targets: ['e-orc'] });
      const selected = Array.from(view.container.querySelectorAll('.tmo-marker--selected'))
        .map((g) => g.getAttribute('data-entry-id'));
      expect(selected).toEqual(['e-orc']);
    });

    it('badges the enemy this attacker flanks', async () => {
      const view = await readyWith({ flankedIds: ['e-goblin'] });
      const badge = view.container.querySelector('.tmo-flank');
      expect(badge.closest('.tmo-marker').getAttribute('data-entry-id')).toBe('e-goblin');
    });

    it('draws the reach ring, labelled a hint, for a melee ability', async () => {
      const view = await readyWith();
      const labels = Array.from(view.container.querySelectorAll('.rbo-label')).map((n) => n.textContent);
      expect(labels).toEqual(['reach 5 ft · hint']);
    });

    it('draws the increment bands for a ranged Strike', async () => {
      const view = await readyWith({
        ability: { name: 'Shortbow', type: 'ranged', range: '20 feet' },
        isRangedStrike: true,
      });
      const labels = Array.from(view.container.querySelectorAll('.rbo-label')).map((n) => n.textContent);
      expect(labels).toContain('20 ft');
      expect(labels).toContain('40 ft · -2');
      expect(labels).toContain('80 ft · -6 · max');
    });
  });
});
