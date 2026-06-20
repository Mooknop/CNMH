import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseConsumableModal from './UseConsumableModal';
import * as consumables from '../../utils/consumables';

// ── Context / hook mocks ─────────────────────────────────────────────────────

const mockGetState   = vi.fn(() => undefined);
const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

const mockEffectCatalog = [
  { id: 'drakeheart-mutagen', name: 'Drakeheart Mutagen', description: '+2 item bonus to AC.' },
];
const mockCharacters = [
  { id: 'c1', name: 'Blu', maxHp: 30, feats: [] },
  { id: 'a1', name: 'Vex', maxHp: 24, feats: [] },
];
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ effects: mockEffectCatalog, characters: mockCharacters }),
}));

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));

const mockAppendLog = vi.fn();
let mockEncounter = { active: false, phase: 'idle', order: [] };
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter, appendLog: mockAppendLog }),
}));

const mockSpendActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ spendActions: mockSpendActions }),
}));

const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

let consumedState = {};
const mockSetConsumed = vi.fn((updater) => {
  consumedState = typeof updater === 'function' ? updater(consumedState) : updater;
});
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [consumedState, mockSetConsumed],
}));

let mockCharData = { inventory: [] };
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => mockCharData,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const character = { id: 'c1', name: 'Blu', maxHp: 30, feats: [] };

const healingPotion = {
  name: 'Minor Healing Potion',
  quantity: 2,
  traits: ['Consumable', 'Potion'],
  consumable: { kind: 'healing', note: '1d8 HP' },
};

const mutagen = {
  name: 'Drakeheart Mutagen',
  quantity: 1,
  traits: ['Alchemical', 'Mutagen'],
  consumable: { kind: 'effect', effectId: 'drakeheart-mutagen', durationMinutes: 10 },
};

const defaultProps = {
  isOpen:     true,
  onClose:    vi.fn(),
  item:       healingPotion,
  character,
  themeColor: '#aaa',
};

function renderModal(props = {}) {
  return render(<UseConsumableModal {...defaultProps} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  consumedState = {};
  mockCharData = { inventory: [] };
  mockEncounter = { active: false, phase: 'idle', order: [] };
  vi.spyOn(consumables, 'applyHealing').mockImplementation(() => {});
  vi.spyOn(consumables, 'applyHealingConsumable').mockImplementation(() => {});
  vi.spyOn(consumables, 'applyEffectConsumable').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Visibility / guards ──────────────────────────────────────────────────────

describe('visibility', () => {
  it('renders null when closed, item missing, or item not a consumable', () => {
    expect(render(<UseConsumableModal {...defaultProps} isOpen={false} />).container.firstChild).toBeNull();
    expect(render(<UseConsumableModal {...defaultProps} item={null} />).container.firstChild).toBeNull();
    expect(render(<UseConsumableModal {...defaultProps} item={{ name: 'Sword' }} />).container.firstChild).toBeNull();
  });

  it('titles the modal with the trait-derived verb', () => {
    renderModal();
    expect(screen.getByRole('heading', { level: 2, name: 'Drink Minor Healing Potion' })).toBeInTheDocument();
  });

  it('shows the remaining count and the authored note', () => {
    renderModal();
    expect(screen.getByLabelText('remaining count')).toHaveTextContent('×2 remaining');
    expect(screen.getByText('1d8 HP')).toBeInTheDocument();
  });
});

// ── Healing flow ─────────────────────────────────────────────────────────────

describe('healing consumable', () => {
  it('disables confirm until an amount is entered', () => {
    renderModal();
    const btn = screen.getByRole('button', { name: 'Drink' });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '6' } });
    expect(btn).not.toBeDisabled();
  });

  it('increments the consumed overlay, applies healing, and closes', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Drink' }));

    expect(consumedState).toEqual({ 'Minor Healing Potion': 1 });
    expect(consumables.applyHealingConsumable).toHaveBeenCalledWith(expect.objectContaining({
      user:     { id: 'c1', name: 'Blu', maxHp: 30 },
      itemName: 'Minor Healing Potion',
      amount:   6,
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not spend actions outside an encounter and logs to the session log', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Drink' }));

    expect(mockSpendActions).not.toHaveBeenCalled();
    const { appendLog } = consumables.applyHealingConsumable.mock.calls[0][0];
    appendLog({ type: 'action', text: 'x' });
    expect(mockAppendEvent).toHaveBeenCalledWith({ type: 'action', text: 'x' });
    expect(mockAppendLog).not.toHaveBeenCalled();
  });

  it('hides the Godless Healing hint without the feat', () => {
    renderModal();
    expect(screen.queryByText(/Godless Healing/)).not.toBeInTheDocument();
  });

  it('shows the Godless Healing hint for a feat-holder', () => {
    renderModal({ character: { ...character, feats: [{ name: 'Godless Healing' }] } });
    expect(screen.getByText(/Godless Healing/)).toBeInTheDocument();
  });
});

// ── Administering to a focused ally (#434) ───────────────────────────────────

describe('administer to a focused ally', () => {
  it('heals the ally (their maxHp), titles + logs as administered, not self', () => {
    renderModal({ defaultTargetId: 'a1' });
    expect(screen.getByRole('heading', { level: 2, name: 'Drink Minor Healing Potion → Vex' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Drink' }));

    expect(consumables.applyHealing).toHaveBeenCalledWith(expect.objectContaining({
      target: { id: 'a1', name: 'Vex', maxHp: 24 },
      amount: 6,
      logText: 'Blu administered Minor Healing Potion to Vex — healed 6 HP',
    }));
    // Self-use path is not taken when administering.
    expect(consumables.applyHealingConsumable).not.toHaveBeenCalled();
    // The item still comes from the user's overlay.
    expect(consumedState).toEqual({ 'Minor Healing Potion': 1 });
  });

  it('falls back to self when the target id is the user', () => {
    renderModal({ defaultTargetId: 'c1' });
    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Drink' }));
    expect(consumables.applyHealingConsumable).toHaveBeenCalled();
    expect(consumables.applyHealing).not.toHaveBeenCalled();
  });

  it('ignores defaultTargetId for an effect consumable (effects are self-use)', () => {
    renderModal({ item: mutagen, defaultTargetId: 'a1' });
    fireEvent.click(screen.getByRole('button', { name: 'Drink' }));
    expect(consumables.applyEffectConsumable).toHaveBeenCalledWith(expect.objectContaining({
      user: { id: 'c1', name: 'Blu', maxHp: 30 },
    }));
    expect(consumables.applyHealing).not.toHaveBeenCalled();
  });
});

// ── Effect flow ──────────────────────────────────────────────────────────────

describe('effect consumable', () => {
  it('shows the catalog effect name, description, and duration', () => {
    renderModal({ item: mutagen });
    expect(screen.getByText(/Drakeheart Mutagen/, { selector: '.ucm-effect-name' })).toBeInTheDocument();
    expect(screen.getByText('+2 item bonus to AC.')).toBeInTheDocument();
    expect(screen.getByText(/10 minutes/)).toBeInTheDocument();
  });

  it('applies the effect with game-clock seconds on confirm', () => {
    renderModal({ item: mutagen });
    fireEvent.click(screen.getByRole('button', { name: 'Drink' }));

    expect(consumedState).toEqual({ 'Drakeheart Mutagen': 1 });
    expect(consumables.applyEffectConsumable).toHaveBeenCalledWith(expect.objectContaining({
      itemName: 'Drakeheart Mutagen',
      meta:     mutagen.consumable,
      nowSecs:  expect.any(Number),
    }));
  });
});

// ── Encounter integration ────────────────────────────────────────────────────

describe('in an active encounter', () => {
  beforeEach(() => {
    mockEncounter = { active: true, phase: 'in-progress', order: [] };
  });

  it('labels confirm with the action cost and spends 1 action', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '6' } });
    const btn = screen.getByRole('button', { name: 'Drink (1 act)' });
    fireEvent.click(btn);
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Drink Minor Healing Potion');
  });

  it('logs through the combat log, not the session log', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Drink (1 act)' }));
    const { appendLog } = consumables.applyHealingConsumable.mock.calls[0][0];
    appendLog({ type: 'action', text: 'x' });
    expect(mockAppendLog).toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

// ── Item-target flow (oils, #339) ────────────────────────────────────────────

describe('item-target consumable (oil)', () => {
  const oil = {
    id: 'oil-of-weightlessness',
    name: 'Oil of Weightlessness',
    quantity: 1,
    traits: ['Consumable', 'Oil'],
    consumable: { kind: 'effect', target: 'item', label: 'Weightless', note: 'Negligible Bulk', durationMinutes: 60 },
  };

  beforeEach(() => {
    mockCharData = {
      inventory: [
        { id: 'plate-1', name: 'Full Plate' },
        { id: 'oil-of-weightlessness', name: 'Oil of Weightlessness' }, // the oil itself — excluded
        { id: 'pack', name: 'Backpack', container: { contents: [{ id: 'rope', name: 'Rope' }] } },
      ],
    };
  });

  it('lists target items (flattened, excluding the oil itself) and gates confirm on a pick', () => {
    renderModal({ item: oil });
    expect(screen.getByRole('button', { name: 'Full Plate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rope' })).toBeInTheDocument();
    // The oil cannot target itself.
    expect(screen.queryByRole('button', { name: 'Oil of Weightlessness' })).not.toBeInTheDocument();
    // No creature-effect section for an item-target consumable.
    expect(screen.queryByText('Effect')).not.toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: 'Apply' });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Full Plate' }));
    expect(confirm).not.toBeDisabled();
  });

  it('writes the item-effect overlay (not creature effects) and consumes the oil', () => {
    renderModal({ item: oil });
    fireEvent.click(screen.getByRole('button', { name: 'Full Plate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(consumables.applyEffectConsumable).not.toHaveBeenCalled();
    expect(consumedState).toEqual({ 'Oil of Weightlessness': 1 });
    expect(mockSendUpdate).toHaveBeenCalledWith(
      'c1',
      'itemeffects',
      expect.arrayContaining([expect.objectContaining({
        itemId: 'plate-1', itemName: 'Full Plate', label: 'Weightless', source: 'Oil of Weightlessness',
      })]),
    );
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Blu applied Oil of Weightlessness to Full Plate (60 min)',
    }));
  });

  it('transient consumable (Rust Scrub) logs the application but writes no overlay', () => {
    const rustScrub = {
      id: 'rust-scrub',
      name: 'Rust Scrub',
      quantity: 1,
      traits: ['Consumable'],
      consumable: { kind: 'effect', target: 'item', transient: true, note: 'Restore 2d4 HP to rust damage (GM adjudicates)' },
    };
    mockCharData = { inventory: [{ id: 'plate-1', name: 'Full Plate' }, rustScrub] };
    renderModal({ item: rustScrub });
    fireEvent.click(screen.getByRole('button', { name: 'Full Plate' }));
    // Rust Scrub isn't an oil, so the verb is "Use".
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));

    expect(consumedState).toEqual({ 'Rust Scrub': 1 });
    // No item-effect overlay write for an instantaneous consumable.
    expect(mockSendUpdate).not.toHaveBeenCalledWith('c1', 'itemeffects', expect.anything());
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Blu applied Rust Scrub to Full Plate — Restore 2d4 HP to rust damage (GM adjudicates)',
    }));
  });
});

// ── Race guard ───────────────────────────────────────────────────────────────

describe('depleted item', () => {
  it('disables confirm when no copies remain', () => {
    renderModal({ item: { ...healingPotion, quantity: 0 } });
    fireEvent.change(screen.getByLabelText('hp healed'), { target: { value: '6' } });
    expect(screen.getByRole('button', { name: 'Drink' })).toBeDisabled();
  });
});
