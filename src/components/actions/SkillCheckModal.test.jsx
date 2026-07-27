import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SkillCheckModal from './SkillCheckModal';
import { getSkillAction, augmentSkillAction } from '../../data/skillActions';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { resolveActionRoll } from '../../utils/rollResolution';
import { setDevicePref } from '../../hooks/useDevicePref';
import { TABLE_DICE_PREF } from '../../utils/tableDice';

// SkillCheckModal now renders RollSheet (#1690) rather than its own Modal
// body — the DC input and every pre-roll picker move into RollSheet's Edit
// panel, and the degree + outcome note only ever appear in the result card
// after commit. Mocking `../shared/Modal` here also intercepts RollSheet's
// Modal import: both resolve to the same module (src/components/shared/Modal.jsx).
vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <h2>{title}</h2>
        <button onClick={onClose}>×</button>
        {children}
      </div>
    );
  },
}));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/useEffects', () => ({ useEffects: vi.fn() }));
vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../utils/rollResolution', () => ({ resolveActionRoll: vi.fn() }));
vi.mock('../../utils/CharacterUtils', () => ({
  getSkillModifier: (_c, s) => ({ survival: 7 }[s] ?? 0),
  getUnarmedAttackModifier: () => 9,
  hasFeat: (c, name) => (c?.feats || []).some((f) => f.name?.toLowerCase() === name.toLowerCase()),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ effects: [] }),
}));

const character = { id: 'ashka', name: 'Ashka', feats: [] };
const ranger = { id: 'ashka', name: 'Ashka', feats: [{ name: 'Ranger Dedication' }] };

// RollSheet interaction helpers (RollSheet.test.jsx idiom). Foundry dice are
// never "available" under these mocks (no SessionContext provider at all, so
// useSession() falls back to the NOOP session with foundryConnected: false),
// so the pad renders regardless of the table-dice pref — set it anyway for
// clarity and to stay in sync if that ever changes.
const pad = () => screen.getByRole('group', { name: 'raw d20' });
const tapFace = (n) => fireEvent.click(within(pad()).getByRole('button', { name: String(n), exact: true }));
const sheet = () => document.querySelector('.rs');
const pill = (name) => within(sheet()).getByRole('button', { name });

beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));
afterEach(() => setDevicePref(TABLE_DICE_PREF, false));

beforeEach(() => {
  useCharacter.mockReturnValue({ flags: {} });
  useEffects.mockReturnValue({ effects: [] });
  useSyncedState.mockImplementation(() => [[], vi.fn()]);
  resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 6 });
});

describe('SkillCheckModal (Track)', () => {
  const track = getSkillAction('track');

  it('renders nothing when closed', () => {
    const { container } = render(
      <SkillCheckModal isOpen={false} onClose={() => {}} action={track} character={character} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the net modifier, blocks until a DC is entered, and shows the degree + outcome only after commit', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={track} character={character} />);
    expect(screen.getByText('Track +6')).toBeInTheDocument();
    expect(screen.getByText('Enter a DC in Edit before rolling.')).toBeInTheDocument();
    expect(screen.queryByText(/Success/)).not.toBeInTheDocument();

    fireEvent.click(pill('Edit'));
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
    fireEvent.click(pill('Done'));
    tapFace(15);
    fireEvent.click(pill('Resolve Track'));

    // d20 15 + 6 = 21 vs DC 20 → success
    expect(screen.getByText('+6 = 21')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText(/Follow the trail/)).toBeInTheDocument();
  });

  it('renders the crit-failure note when the roll misses the DC by 10+', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={track} character={character} />);
    fireEvent.click(pill('Edit'));
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
    fireEvent.click(pill('Done'));
    // d20 1 + 6 = 7 vs DC 20 → critical failure (miss by 13, nat-1 also steps down)
    tapFace(1);
    fireEvent.click(pill('Resolve Track'));
    expect(screen.getByText('Critical Failure')).toBeInTheDocument();
  });

  it('offers the Hunt Prey +2 toggle for a Ranger Dedication PC and applies it to the running total', () => {
    const augmented = augmentSkillAction(ranger, track);
    render(<SkillCheckModal isOpen onClose={() => {}} action={augmented} character={ranger} />);
    fireEvent.click(pill('Edit'));
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
    tapFace(12);
    expect(screen.getByText('12 + 6 = 18')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hunt Prey vs prey/ }));
    expect(screen.getByText('12 + 8 = 20')).toBeInTheDocument();
    expect(screen.getByText(/incl\. \+2 circumstance/)).toBeInTheDocument();
  });

  it('applies a free-form circumstance modifier to the running total', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={track} character={character} />);
    fireEvent.click(pill('Edit'));
    fireEvent.change(screen.getByLabelText(/Other circumstance/), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
    tapFace(10);
    expect(screen.getByText('10 + 5 = 15')).toBeInTheDocument(); // 10 + 6 - 1
  });

  it('shows no Hunt Prey toggle for a PC without the feat', () => {
    const augmented = augmentSkillAction(character, track); // no feat → same ref
    render(<SkillCheckModal isOpen onClose={() => {}} action={augmented} character={character} />);
    fireEvent.click(pill('Edit'));
    expect(screen.queryByRole('button', { name: /Hunt Prey/ })).not.toBeInTheDocument();
  });
});

describe('SkillCheckModal — check-bonus talisman (Sneaky Key, #1093)', () => {
  const sneakyKey = {
    uid: 'key-1',
    name: 'Sneaky Key',
    traits: ['Consumable', 'Magical', 'Talisman'],
    talisman: {
      affixTo: 'armor',
      activation: {
        cost: 1,
        trigger: 'You attempt to Pick a Lock',
        effect: { kind: 'check-bonus', skill: 'thievery', bonus: 1, value: 'status', note: 'to Pick a Lock for 1 minute' },
      },
    },
  };
  const pickLock = { id: 'pick-a-lock', name: 'Pick a Lock', skill: 'thievery', traits: [], outcomes: {} };

  let affixed;
  let consumed;
  const setAffixed = vi.fn((next) => { affixed = typeof next === 'function' ? next(affixed) : next; });
  const setConsumed = vi.fn((next) => { consumed = typeof next === 'function' ? next(consumed) : next; });

  beforeEach(() => {
    affixed = { 'key-1': 'armor-1' };
    consumed = {};
    setAffixed.mockClear();
    setConsumed.mockClear();
    useCharacter.mockReturnValue({ flags: {}, inventory: [sneakyKey, { uid: 'armor-1', name: 'Leather Armor' }] });
    useSyncedState.mockImplementation((key) => {
      if (String(key).startsWith('cnmh_affixed_')) return [affixed, setAffixed];
      if (String(key).startsWith('cnmh_consumed_')) return [consumed, setConsumed];
      return [[], vi.fn()];
    });
  });

  it('offers the opt-in and adds the bonus to the net modifier', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={pickLock} character={character} />);
    fireEvent.click(pill('Edit'));
    expect(screen.getByText('Pick a Lock +6')).toBeInTheDocument(); // talisman off
    fireEvent.click(screen.getByLabelText('Sneaky Key (+1 status)'));
    expect(screen.getByText('Pick a Lock +7')).toBeInTheDocument();
  });

  it('consumes the talisman on close when used on a committed roll', () => {
    // RollSheet owns the settled phase once Close is reached, so — unlike the
    // old typed-input dialect — this can't be exercised as one render reused
    // across two rolls; a real close unmounts the whole tree (isOpen flips to
    // false upstream) and RollSheet remounts fresh next open, so two separate
    // mounts is the faithful equivalent.
    render(<SkillCheckModal isOpen onClose={() => {}} action={pickLock} character={character} />);
    fireEvent.click(pill('Edit'));
    fireEvent.click(screen.getByLabelText('Sneaky Key (+1 status)'));
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '15' } });
    fireEvent.click(pill('Done'));
    tapFace(15);
    fireEvent.click(pill('Resolve Pick a Lock'));
    // No damage parts on this surface: the result screen's CTA is already
    // labeled Close but only settles the sheet; the settled screen's own
    // Close is the one that fires onClose.
    fireEvent.click(pill('Close'));
    fireEvent.click(pill('Close'));
    expect(setConsumed).toHaveBeenCalled();
    expect(setAffixed).toHaveBeenCalled();
    expect(affixed).toEqual({});
  });

  it('does not consume the talisman on close when toggled on but no roll was committed', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={pickLock} character={character} />);
    fireEvent.click(pill('Edit'));
    fireEvent.click(screen.getByLabelText('Sneaky Key (+1 status)'));
    fireEvent.click(screen.getByText('×'));
    expect(setConsumed).not.toHaveBeenCalled();
  });

  it('shows no opt-in for a non-matching skill or unaffixed talisman', () => {
    const track = { id: 'track', name: 'Track', skill: 'survival', traits: [], outcomes: {} };
    render(<SkillCheckModal isOpen onClose={() => {}} action={track} character={character} />);
    fireEvent.click(pill('Edit'));
    expect(screen.queryByText(/Sneaky Key/)).not.toBeInTheDocument();
  });

  it('shows no opt-in for an unaffixed talisman', () => {
    affixed = {};
    useSyncedState.mockImplementation((key) => {
      if (String(key).startsWith('cnmh_affixed_')) return [affixed, setAffixed];
      if (String(key).startsWith('cnmh_consumed_')) return [consumed, setConsumed];
      return [[], vi.fn()];
    });
    render(<SkillCheckModal isOpen onClose={() => {}} action={pickLock} character={character} />);
    fireEvent.click(pill('Edit'));
    expect(screen.queryByText(/Sneaky Key/)).not.toBeInTheDocument();
  });
});

describe('SkillCheckModal — outcome-shift talisman (Mesmerizing Opal, #1085)', () => {
  const opal = {
    uid: 'opal-1',
    name: 'Mesmerizing Opal',
    traits: ['Consumable', 'Magical', 'Talisman'],
    talisman: {
      affixTo: 'armor',
      activation: {
        cost: 1,
        trigger: 'You attempt to Feint',
        effect: { kind: 'check-bonus', skill: 'deception', successToCrit: true, critFailToFail: true, note: 'to Feint' },
      },
    },
  };
  const feint = {
    id: 'feint', name: 'Feint', skill: 'deception', traits: [],
    outcomes: { criticalSuccess: { note: 'Target is off-guard until your next turn.' }, success: { note: 'Target is off-guard against your next attack.' } },
  };

  let affixed;
  const setAffixed = vi.fn((next) => { affixed = typeof next === 'function' ? next(affixed) : next; });

  beforeEach(() => {
    affixed = { 'opal-1': 'armor-1' };
    setAffixed.mockClear();
    useCharacter.mockReturnValue({ flags: {}, inventory: [opal, { uid: 'armor-1', name: 'Leather Armor' }] });
    useSyncedState.mockImplementation((key) => {
      if (String(key).startsWith('cnmh_affixed_')) return [affixed, setAffixed];
      if (String(key).startsWith('cnmh_consumed_')) return [{}, vi.fn()];
      return [[], vi.fn()];
    });
  });

  it('does not shift the degree when not opted in', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={feint} character={character} />);
    fireEvent.click(pill('Edit'));
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
    fireEvent.click(pill('Done'));
    // d20 15 + 6 = 21 vs DC 20 → success
    tapFace(15);
    fireEvent.click(pill('Resolve Feint'));
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.queryByText('Critical Success')).not.toBeInTheDocument();
  });

  it('upgrades a success to a critical success when opted in before the commit (no flat bonus)', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={feint} character={character} />);
    fireEvent.click(pill('Edit'));
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
    fireEvent.click(screen.getByLabelText('Mesmerizing Opal (outcome shift)'));
    fireEvent.click(pill('Done'));
    // d20 15 + 6 = 21 vs DC 20 → success, shifted by the opal to a critical
    // success. The net modifier is unchanged — the opal grants no numeric bonus.
    tapFace(15);
    fireEvent.click(pill('Resolve Feint'));
    expect(screen.getByText('+6 = 21')).toBeInTheDocument();
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
  });
});
