/**
 * 'While playing' state (#935) — the CONSUMERS of cnmh_playing_<charId> (#1048).
 *
 * The setting half of the flag is already covered through the real cast flow:
 * lingering-composition.spec.ts (both tests) and hymn-of-healing.spec.ts assert
 * a Composition cast writes cnmh_playing_<id> { active: true }. This spec picks
 * up everything keyed OFF the flag, and how it comes down:
 *
 *   - Playing chip (#1026): InitiativeStrip's PlayingChip renders the ♪♫ badge
 *     (aria-label "<name> is playing") while the flag is up, and only then.
 *   - Turn-boundary lapse (#1025): the cast stamps expireAt = the caster's NEXT
 *     turn-end ({ round: cast+1, entryId, boundary: 'turn-end' }); without a
 *     re-up, useEncounter.advanceTurn's expiry sweep (utils/turnEffects.js)
 *     writes the idle state on that boundary.
 *   - Vocoder of Invisibility (#1027): useVocoderConcealSweep writes the REAL
 *     `concealed` entry (tagged source: 'vocoder') into cnmh_conditions_<id>
 *     while the wielder plays, and removes exactly that entry when the
 *     performance stops — asserted on the synced write AND the self dossier.
 *   - Coda staves (#1029/#1030): useCodaPlayingSweep reconciles the stave's
 *     `playingEffect` catalog ref into cnmh_effects_<id> (grantedBy: 'playing').
 *     The Drums of War's +5-ft status Speed rides the Speed spine into the
 *     Stats tab, so the DISPLAYED stat flips with the flag — the applied
 *     consequence, not just the ledger entry.
 *
 * Both sweeps are GM-only writers (one client owns the write); the local stack
 * runs GM_DEV_BYPASS, so the player page reports isGm and owns them here —
 * the same caveat resonant-powers.spec.ts records for usePersistentReminders.
 * Pushed encounter transitions are ignored by useEncounterTurnEffects (it acts
 * only on foundryCombatId combats), so the lapse below is app-driven advanceTurn
 * doing the sweep — the same path a real table uses.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import {
  activeEncounter,
  encounterState,
  pcEntry,
  enemyEntry,
  readyTurnState,
  expectOffTurnLive,
} from '../../helpers/encounter';
import { expectMyTurnLive, openPlayTab } from '../../helpers/sheet';
import {
  snapshotSpells,
  snapshotItems,
  casterCharacter,
  gotoSheet,
  openSpellsSegment,
  castSpell,
} from '../../helpers/spellcasting';

// ── Playing chip + turn-boundary lapse ──────────────────────────────────────

const BARD_ID = 'e2e-bard';
const BARD_NAME = 'E2E Bard';

test.describe("'While playing' — chip and turn-boundary lapse", () => {
  test('a Composition cast raises the Playing chip; the unsustained flag lapses at the next turn-end', async ({
    page,
    seed,
    reset,
  }) => {
    await reset();
    await seed({
      spell: snapshotSpells('lingering-composition'),
      character: [
        casterCharacter({
          id: BARD_ID,
          name: BARD_NAME,
          charClass: 'Bard',
          focus: { max: 2, current: 2 },
          focusSpells: ['lingering-composition'],
        }),
      ],
    });

    // Two combatants so the turn can move off (and back to) the bard.
    const order = [pcEntry(BARD_ID, BARD_NAME, 20), enemyEntry('E2E Goblin', 10)];
    const at = (round: number, idx: number) =>
      encounterState({ phase: 'in-progress', round, currentTurnIndex: idx, order });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: at(1, 0),
        [`cnmh_turnstate_${BARD_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoSheet(page, BARD_ID, BARD_NAME);
    await openSpellsSegment(page);

    // No chip before the cast — the strip has rendered (the bard's own Focus
    // entry is the anchor), it just carries no ♪♫ badge yet.
    const chip = page.getByLabel(`${BARD_NAME} is playing`);
    await expect(page.getByRole('button', { name: `Focus ${BARD_NAME}` })).toBeVisible();
    await expect(chip).toHaveCount(0);

    // Cast Lingering Composition through the real flow (#1133 harness). The
    // check's outcome is irrelevant here — success or failure, it is a
    // Composition cast, so the performance starts either way.
    await castSpell(page, 'Lingering Composition');
    await page.locator('#lcm-d20').fill('15');
    await page.locator('#lcm-dc').fill('25');
    await page.getByRole('button', { name: 'Cast Lingering Composition' }).click();

    // THE write, with the real expiry stamp: cast on round 1 → lapses at the
    // caster's round-2 turn-end (resolveExpireAt { until: 'rounds', rounds: 1 }).
    const playing = await session.expectSent(
      `cnmh_playing_${BARD_ID}`,
      (v) => v?.active === true,
    );
    expect(playing.expireAt).toMatchObject({
      round: 2,
      entryId: order[0].entryId,
      boundary: 'turn-end',
    });

    // Close the resolver; the chip is up on the initiative strip (#1026).
    await page.locator('.lcm-footer').getByRole('button', { name: 'Close' }).click();
    await expect(chip).toBeVisible();

    // Walk the turn around: to the goblin (positive off-turn signal), then back
    // to the bard on round 2. The chip survives both hops — the flag lapses at
    // the caster's turn-END, not at any earlier boundary.
    session.push('cnmh_encounter_global', at(1, 1));
    await expectOffTurnLive(page);
    await expect(chip).toBeVisible();

    session.push('cnmh_encounter_global', at(2, 0));
    await expectMyTurnLive(page);
    await expect(chip).toBeVisible();

    // End the round-2 turn without a re-up: advanceTurn's sweep crosses the
    // expireAt boundary and writes the idle state; the chip goes with it.
    await page.getByRole('button', { name: 'End turn' }).click();
    await session.expectSent(`cnmh_playing_${BARD_ID}`, (v) => v?.active === false);
    await expect(chip).toHaveCount(0);
  });
});

// ── Vocoder of Invisibility — Concealed while playing ───────────────────────

const TROUB_ID = 'e2e-troubadour';
const TROUB_NAME = 'E2E Troubadour';

test.describe('Vocoder of Invisibility — Concealed while playing', () => {
  test('Concealed applies when the wielder starts playing and clears on Stop', async ({
    page,
    seed,
    reset,
  }) => {
    const [VOCODER] = snapshotItems('vocoder-of-invisibility');
    await reset();
    await seed({
      item: [VOCODER],
      character: [
        {
          id: TROUB_ID,
          name: TROUB_NAME,
          level: 5,
          maxHp: 40,
          speed: 25,
          inventory: [{ ref: VOCODER.id, quantity: 1, uid: 'uid-vocoder' }],
        },
      ],
    });
    const session = await mockSession(page, {
      seed: { cnmh_encounter_global: activeEncounter(TROUB_ID, TROUB_NAME) },
    });

    await gotoSheet(page, TROUB_ID, TROUB_NAME);
    await openPlayTab(page, 'Encounter');

    // Focus self → the personal dossier, whose condition chips read the same
    // synced cnmh_conditions_<id> the sweep writes. Baseline: not Concealed.
    await page.getByRole('button', { name: `Focus ${TROUB_NAME}` }).click();
    const dossier = page.getByRole('region', { name: `Focused: ${TROUB_NAME} (you)` });
    await expect(dossier).toBeVisible();
    const concealedChip = dossier.locator('.dossier-chip', { hasText: 'Concealed' });
    await expect(concealedChip).toHaveCount(0);

    // The performance starts (a peer's Composition cast would write exactly
    // this). The GM-owned sweep reacts: the REAL concealed condition lands in
    // the synced store, tagged with its source so removal can never touch a
    // manually toggled Concealed.
    session.push(`cnmh_playing_${TROUB_ID}`, { active: true, ts: Date.now() });
    await session.expectSent(
      `cnmh_conditions_${TROUB_ID}`,
      (v) =>
        Array.isArray(v) &&
        v.some((c: any) => c?.id === 'concealed' && c?.source === 'vocoder'),
    );
    await expect(concealedChip).toBeVisible();
    await expect(page.getByLabel(`${TROUB_NAME} is playing`)).toBeVisible();

    // Stop from the Stats tab — the manual override surface (#935). The flag
    // write and the veil removal both cross the session.
    await openPlayTab(page, 'Stats');
    await page.getByRole('button', { name: 'Stop playing' }).click();
    await session.expectSent(`cnmh_playing_${TROUB_ID}`, (v) => v?.active === false);
    await session.expectSent(
      `cnmh_conditions_${TROUB_ID}`,
      (v) => Array.isArray(v) && !v.some((c: any) => c?.id === 'concealed'),
    );

    // Back on the encounter surface: chip down, veil gone. The focus target is
    // a synced pointer, so the self dossier is still up when we return.
    await openPlayTab(page, 'Encounter');
    await expect(page.getByLabel(`${TROUB_NAME} is playing`)).toHaveCount(0);
    await expect(dossier).toBeVisible();
    await expect(concealedChip).toHaveCount(0);
  });
});

// ── Coda staves — stat delta flips with the flag ────────────────────────────

const DRUM_ID = 'e2e-drummer';
const DRUM_NAME = 'E2E Drummer';

test.describe('Coda staves — bonuses only while playing', () => {
  test("the Drums of War's +5-ft Speed applies while playing and falls off with the flag", async ({
    page,
    seed,
    reset,
  }) => {
    // Real catalog doc: drums-of-war carries playingEffect 'coda-drums-playing'
    // (+1 item Performance, +5-ft status Speed). The effect DEFS come from the
    // bundled fallback catalog — seeding any effect would REPLACE the whole
    // catalog (ContentContext takes the DO list instead of the bundle when it
    // is non-empty), the same trap resonant-powers.spec.ts records for runes.
    const [DRUMS] = snapshotItems('drums-of-war');
    await reset();
    await seed({
      item: [DRUMS],
      character: [
        {
          id: DRUM_ID,
          name: DRUM_NAME,
          level: 5,
          maxHp: 40,
          speed: 25,
          // Without a Strength score the Bulk auto-encumbrance (SP3, #1222)
          // derives Encumbered (−10 ft) and the Speed baseline reads 15, not 25.
          abilities: { strength: 14 },
          inventory: [{ ref: DRUMS.id, quantity: 1, uid: 'uid-drums' }],
        },
      ],
    });
    const session = await mockSession(page, {
      seed: { cnmh_encounter_global: activeEncounter(DRUM_ID, DRUM_NAME) },
    });

    await gotoSheet(page, DRUM_ID, DRUM_NAME);
    await openPlayTab(page, 'Stats');

    // Baseline: the drums are carried but nobody is playing — base Speed only.
    const speedChip = page.locator('.tchip', { hasText: 'Speed' });
    await expect(speedChip).toContainText('25 ft');

    // The performance starts. The GM-owned sweep writes a REAL effect entry
    // (grantedBy: 'playing') into cnmh_effects_<id> — the same store roll-time
    // consumers read — and the Speed spine folds its status bonus into the
    // displayed stat: 25 → 30 with a +5 delta badge.
    session.push(`cnmh_playing_${DRUM_ID}`, { active: true, ts: Date.now() });
    await session.expectSent(
      `cnmh_effects_${DRUM_ID}`,
      (v) =>
        Array.isArray(v) &&
        v.some((e: any) => e?.effectId === 'coda-drums-playing' && e?.grantedBy === 'playing'),
    );
    await expect(speedChip).toContainText('30');
    await expect(speedChip).toContainText('+5');

    // The music stops — the managed entry is reconciled away and the stat
    // falls straight back. A stale bonus here is exactly the bug the
    // grantedBy tag exists to prevent.
    session.push(`cnmh_playing_${DRUM_ID}`, { active: false, ts: Date.now() });
    await session.expectSent(
      `cnmh_effects_${DRUM_ID}`,
      (v) => Array.isArray(v) && !v.some((e: any) => e?.grantedBy === 'playing'),
    );
    await expect(speedChip).toContainText('25 ft');
    await expect(speedChip).not.toContainText('+5');
  });
});
