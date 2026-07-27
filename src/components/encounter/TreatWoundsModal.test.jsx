// TreatWoundsModal as a RollSheet configuration (#1688, Roll Resolution
// redesign workstream F). Rendered under the real provider stack
// (renderWithProviders) rather than mocked contexts, because RollSheet mounts
// the real RollEntry/DamageEntry primitives — mocking them would only prove
// the shell talks to a stub (the RollSheet.test.jsx idiom). Table-dice mode is
// forced so the tap pad renders deterministically; the pad and finish inputs
// replace the old raw `<input>` fields.
import React from 'react';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import TreatWoundsModal from './TreatWoundsModal';
import * as treatWounds from '../../utils/treatWounds';
import { IMMUNITY_EFFECT_ID } from '../../utils/treatWounds';
import { setDevicePref } from '../../hooks/useDevicePref';
import { TABLE_DICE_PREF } from '../../utils/tableDice';

// Expert Medicine (rank 2), level 5, wisdom 14 → +9 (level+rank*2) + 2 = +11.
// DC 15 unlocks at rank 1, DC 20 at rank 2 — availableDcs(2) = [15, 20].
const healer = makeCharacter({
  id: 'h1', name: 'Pellias', level: 5,
  abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 14, charisma: 10 },
  skills: { medicine: { proficiency: 2 } },
});
const mortalHealer = makeCharacter({
  ...healer, id: 'h1', name: 'Blu', feats: [{ name: 'Mortal Healing' }],
});
const brakor = makeCharacter({ id: 'c1', name: 'Brakor', maxHp: 40 });
const godlessBrakor = makeCharacter({ id: 'c1', name: 'Brakor', maxHp: 40, feats: [{ name: 'Godless Healing' }] });

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  mode: 'treat-wounds',
  healer,
  themeColor: '#aaa',
  actionCost: 0,
};

function renderModal(props = {}, opts = {}) {
  return renderWithProviders(<TreatWoundsModal {...defaultProps} {...props} />, opts);
}

const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
const pad = () => screen.getByRole('group', { name: 'raw d20' });
const tapFace = (n) => fireEvent.click(within(pad()).getByRole('button', { name: String(n), exact: true }));
const pickTarget = (name) => fireEvent.click(screen.getByRole('button', { name }));
const pickDc = (dc) => fireEvent.click(screen.getByText(`DC ${dc}`).closest('button'));
// Modal's own × close button is also named "Close" (aria-label) — scope to
// the sheet body so the settled screen's Close pill is unambiguous.
const sheet = () => document.querySelector('.rs');
const sheetButton = (name) => within(sheet()).getByRole('button', { name });

beforeEach(() => {
  vi.spyOn(treatWounds, 'applyTreatWounds').mockImplementation(() => {});
  vi.spyOn(treatWounds, 'applyStaunchBleeding').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  setDevicePref(TABLE_DICE_PREF, false);
});

// ── Visibility / guard ───────────────────────────────────────────────────────

describe('visibility', () => {
  it('renders null when isOpen is false', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders null when healer is null', () => {
    const { container } = renderModal({ healer: null });
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal title for Treat Wounds', () => {
    renderModal({ mode: 'treat-wounds' });
    expect(screen.getByRole('heading', { level: 2, name: 'Treat Wounds' })).toBeInTheDocument();
  });

  it('renders the modal title for Battle Medicine', () => {
    renderModal({ mode: 'battle-medicine' });
    expect(screen.getByRole('heading', { level: 2, name: 'Battle Medicine' })).toBeInTheDocument();
  });
});

// ── Summary + block gating ────────────────────────────────────────────────────

describe('summary strip and hard block', () => {
  beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));

  it('shows the summary line with cost and Medicine bonus', () => {
    renderModal({}, { content: { character: [healer, brakor] } });
    expect(screen.getByText(/No target · 10 minutes · Medicine \+11/)).toBeInTheDocument();
  });

  it('battle medicine costs 1 action in the summary', () => {
    renderModal({ mode: 'battle-medicine' }, { content: { character: [healer, brakor] } });
    expect(screen.getByText(/1 action · Medicine \+11/)).toBeInTheDocument();
  });

  it('blocks with "select a target" until a target is picked', () => {
    renderModal({}, { content: { character: [healer, brakor] } });
    expect(screen.getByText('Select a target to treat.')).toHaveClass('rs-block');
    const commit = screen.getByRole('button', { name: /Treat Wounds/ });
    expect(commit).toBeDisabled();
  });

  it('blocks with "select a DC" once a target is picked', () => {
    renderModal({}, { content: { character: [healer, brakor] } });
    edit();
    pickTarget('Brakor');
    expect(screen.getByText('Select a DC.')).toHaveClass('rs-block');
  });

  it('clears the block once target and DC are both set', () => {
    renderModal({}, { content: { character: [healer, brakor] } });
    edit();
    pickTarget('Brakor');
    pickDc(15);
    expect(screen.queryByText(/Select a/)).not.toBeInTheDocument();
    // The pill itself still needs a face — the block was the only gate this
    // step clears.
    tapFace(5);
    expect(screen.getByRole('button', { name: /Treat Wounds/ })).not.toBeDisabled();
  });

  it('blocks with a training-required notice when medicine rank is 0', () => {
    const untrained = makeCharacter({ id: 'h1', name: 'Pellias', skills: {} });
    renderModal({ healer: untrained }, { content: { character: [untrained, brakor] } });
    expect(screen.getByText(/training required/i)).toHaveClass('rs-block');
  });

  it('blocks on an immune target', () => {
    renderModal({}, {
      content: { character: [healer, brakor] },
      session: { state: { [brakor.id]: { effects: [{ effectId: IMMUNITY_EFFECT_ID, appliedBy: healer.id }] } } },
    });
    edit();
    pickTarget('Brakor');
    expect(screen.getByText(/is immune to your Treat Wounds/)).toHaveClass('rs-block');
  });
});

// ── Full arc — degrees ────────────────────────────────────────────────────────

describe('resolving a check', () => {
  beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));

  it('success: rolls healing and applies the entered amount', () => {
    renderModal({}, { content: { character: [healer, brakor] } });
    edit();
    pickTarget('Brakor');
    pickDc(15);
    // d20 5 + 11 = 16 vs DC 15 → success.
    tapFace(5);
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));

    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(treatWounds.applyTreatWounds).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Roll healing' }));
    expect(screen.getByText('HP healed · 2d8')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('rolled damage total'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Heal Brakor' }));

    expect(treatWounds.applyTreatWounds).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.objectContaining({ id: 'c1', name: 'Brakor' }),
      dc: 15,
      degree: 'success',
      amount: 12,
      actionName: 'Treat Wounds',
    }));
  });

  it('critical success: 4d8 heading and hint', () => {
    renderModal({}, { content: { character: [healer, brakor] } });
    edit();
    pickTarget('Brakor');
    pickDc(15);
    // d20 14 + 11 = 25 vs DC 15 → critical success (>= DC+10).
    tapFace(14);
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));
    expect(screen.getByText('Critical Success')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roll healing' }));
    expect(screen.getByText('HP healed · 4d8')).toBeInTheDocument();
  });

  it('failure: applies immediately at commit, no amount phase', () => {
    renderModal({}, { content: { character: [healer, brakor] } });
    edit();
    pickTarget('Brakor');
    pickDc(15);
    // d20 2 + 11 = 13 vs DC 15 → failure.
    tapFace(2);
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));

    expect(screen.getByText('Failure')).toBeInTheDocument();
    expect(treatWounds.applyTreatWounds).toHaveBeenCalledWith(expect.objectContaining({
      degree: 'failure',
      amount: 0,
    }));
    expect(screen.queryByLabelText('rolled damage total')).not.toBeInTheDocument();
    expect(sheetButton('Close')).toBeInTheDocument();
  });

  it('critical failure: deals damage instead of healing', () => {
    renderModal({}, { content: { character: [healer, brakor] } });
    edit();
    pickTarget('Brakor');
    pickDc(15);
    // Nat 1 shifts failure down one step to critical failure.
    tapFace(1);
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));
    expect(screen.getByText('Critical Failure')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roll damage' }));
    expect(screen.getByText('Damage dealt · 1d8')).toBeInTheDocument();
    expect(screen.getByText('1d8 damage')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('rolled damage total'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply damage' }));

    expect(treatWounds.applyTreatWounds).toHaveBeenCalledWith(expect.objectContaining({
      degree: 'criticalFailure',
      amount: 5,
    }));
  });

  it('spends actions on commit when actionCost > 0 (Battle Medicine)', () => {
    renderModal(
      { mode: 'battle-medicine', actionCost: 1 },
      {
        content: { character: [healer, brakor] },
        session: { state: { global: { encounter: { active: true, phase: 'in-progress', order: [] } } } },
      },
    );
    edit();
    pickTarget('Brakor');
    pickDc(15);
    tapFace(2); // failure — commits and spends immediately
    fireEvent.click(screen.getByRole('button', { name: /Battle Medicine \(1 act\)/ }));
    expect(screen.getByText('Failure')).toBeInTheDocument();
  });
});

// ── Feat modifiers (#224 — Mortal Healing, Godless Healing) ───────────────────

describe('Mortal Healing (pre-declared)', () => {
  beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));

  it('offers the toggle in the edit panel for a feat-holder in treat-wounds mode', () => {
    renderModal({ healer: mortalHealer }, { content: { character: [mortalHealer, brakor] } });
    edit();
    expect(screen.getByText(/Mortal Healing/)).toBeInTheDocument();
  });

  it('hides the toggle without the feat', () => {
    renderModal({}, { content: { character: [healer, brakor] } });
    edit();
    expect(screen.queryByText(/Mortal Healing/)).not.toBeInTheDocument();
  });

  it('hides the toggle in Battle Medicine mode even with the feat', () => {
    renderModal({ healer: mortalHealer, mode: 'battle-medicine' }, { content: { character: [mortalHealer, brakor] } });
    edit();
    expect(screen.queryByText(/Mortal Healing/)).not.toBeInTheDocument();
  });

  it('upgrades a success to a critical success when checked before the roll', () => {
    renderModal({ healer: mortalHealer }, { content: { character: [mortalHealer, brakor] } });
    edit();
    pickTarget('Brakor');
    pickDc(15);
    fireEvent.click(screen.getByRole('checkbox'));
    // d20 5 + 11 = 16 → raw success, upgraded to critical success.
    tapFace(5);
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));
    expect(screen.getByText('Critical Success')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roll healing' }));
    fireEvent.change(screen.getByLabelText('rolled damage total'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Heal Brakor' }));
    expect(treatWounds.applyTreatWounds).toHaveBeenCalledWith(expect.objectContaining({ degree: 'criticalSuccess', amount: 30 }));
  });

  it('leaves a critical success alone (nothing to upgrade)', () => {
    renderModal({ healer: mortalHealer }, { content: { character: [mortalHealer, brakor] } });
    edit();
    pickTarget('Brakor');
    pickDc(15);
    fireEvent.click(screen.getByRole('checkbox'));
    tapFace(14); // already a critical success
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
  });
});

describe('Godless Healing', () => {
  beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));

  it('adds +2 to the healed amount for a target with the feat', () => {
    renderModal({}, { content: { character: [healer, godlessBrakor] } });
    edit();
    pickTarget('Brakor');
    pickDc(15);
    tapFace(5); // success
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll healing' }));
    expect(screen.getByText(/Godless Healing/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('rolled damage total'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Heal Brakor' }));
    expect(treatWounds.applyTreatWounds).toHaveBeenCalledWith(expect.objectContaining({ amount: 14 }));
  });

  it('does not add the bonus to critical-failure damage', () => {
    renderModal({}, { content: { character: [healer, godlessBrakor] } });
    edit();
    pickTarget('Brakor');
    pickDc(15);
    tapFace(1); // critical failure
    fireEvent.click(screen.getByRole('button', { name: /Treat Wounds/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll damage' }));
    expect(screen.queryByText(/Godless Healing/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('rolled damage total'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply damage' }));
    expect(treatWounds.applyTreatWounds).toHaveBeenCalledWith(expect.objectContaining({ degree: 'criticalFailure', amount: 5 }));
  });
});

// ── Staunch Bleeding mode (#224) ──────────────────────────────────────────────

describe('Staunch Bleeding mode', () => {
  beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));

  const staunchHealer = makeCharacter({ ...healer, id: 'h1', name: 'Blu' });
  const staunchProps = { mode: 'staunch-bleeding', healer: staunchHealer };
  const seed = {
    content: { character: [staunchHealer, brakor] },
    session: {
      state: {
        global: {
          encounter: {
            active: false, phase: 'idle',
            order: [{ entryId: 'e-brakor', charId: 'c1', kind: 'pc', name: 'Brakor' }],
          },
          persistent: { 'e-brakor': [{ id: 'pd1', type: 'bleed', dice: '1d4', sourceName: 'Shard Strike' }] },
        },
      },
    },
  };

  it('titles the modal Staunch Bleeding and offers the action-cost toggle', () => {
    renderModal(staunchProps, seed);
    expect(screen.getByRole('heading', { level: 2, name: 'Staunch Bleeding' })).toBeInTheDocument();
    edit();
    expect(screen.getByText('1 action')).toBeInTheDocument();
    expect(screen.getByText('2 actions')).toBeInTheDocument();
  });

  it('shows the tracked bleeds and never offers Mortal Healing', () => {
    renderModal({ ...staunchProps, healer: { ...staunchHealer, feats: [{ name: 'Mortal Healing' }] } }, seed);
    edit();
    pickTarget('Brakor');
    expect(screen.getByText(/1d4 persistent bleed/)).toBeInTheDocument();
    expect(screen.queryByText(/Mortal Healing/)).not.toBeInTheDocument();
  });

  it('the two-action variant lowers the effective DC by 10', () => {
    renderModal(staunchProps, seed);
    edit();
    pickTarget('Brakor');
    pickDc(15);
    fireEvent.click(screen.getByText('2 actions').closest('button'));
    // d20 2 + 11 = 13 vs effective DC 5 → success.
    tapFace(2);
    fireEvent.click(screen.getByRole('button', { name: /Staunch Bleeding/ }));
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('confirms via applyStaunchBleeding with the resolved entry and bleeds, no amount phase', () => {
    renderModal(staunchProps, seed);
    edit();
    pickTarget('Brakor');
    pickDc(15);
    tapFace(5); // success at DC 15
    fireEvent.click(screen.getByRole('button', { name: /Staunch Bleeding/ }));

    expect(treatWounds.applyStaunchBleeding).toHaveBeenCalledWith(expect.objectContaining({
      entryId: 'e-brakor',
      degree: 'success',
      dc: 15,
      bleeds: [expect.objectContaining({ id: 'pd1' })],
    }));
    expect(treatWounds.applyTreatWounds).not.toHaveBeenCalled();
    expect(sheetButton('Close')).toBeInTheDocument();
  });
});
