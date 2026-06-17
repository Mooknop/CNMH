import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __get: (key) => store[key],
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

let mockEncounter;
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter }),
}));

let mockTurnState;
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ turnState: mockTurnState }),
}));

let mockReactions;
let mockStaffSpells;
let mockFocusSpells;
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => ({
    reactions: mockReactions,
    staffSpells: mockStaffSpells,
    focusSpells: mockFocusSpells,
    inventory: [],
  }),
}));

let mockCatalogSpells;
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ spells: mockCatalogSpells }),
}));

let mockShield;
vi.mock('../../hooks/useShield', () => ({
  useShield: () => mockShield,
}));

vi.mock('./UseAbilityModal', () => ({
  __esModule: true,
  default: ({ ability, cost, verb, castSource, onClose }) => (
    <div data-testid="use-ability-modal">
      {verb} {ability.name} ({cost}{castSource ? ` from ${castSource}` : ''})
      <button onClick={onClose} aria-label="close modal">close</button>
    </div>
  ),
}));

vi.mock('./ShieldBlockBar', () => ({
  __esModule: true,
  default: ({ charId }) => <div data-testid="shield-block-bar">{charId}</div>,
}));

import { __get, __reset, useSyncedState } from '../../hooks/useSyncedState';
import ReactionPrompt from './ReactionPrompt';

const character = { id: 'Blu', name: 'Blu' };
const KEY = 'cnmh_reactprompt_Blu';

let setPrompt;
const PromptDriver = () => {
  const [, sp] = useSyncedState(KEY, null);
  React.useEffect(() => { setPrompt = sp; }, [sp]);
  return null;
};

const prompt = {
  reqId: 'r1',
  eventId: 'ranged-attack',
  label: 'Ranged attack incoming',
  note: 'archer on the ledge',
  round: 2,
};

function setup() {
  render(
    <>
      <PromptDriver />
      <ReactionPrompt character={character} themeColor="#abc" />
    </>
  );
}

beforeEach(() => {
  __reset();
  mockEncounter = { active: true, phase: 'in-progress', round: 2 };
  mockTurnState = { hasStartedFirstTurn: true, reactionAvailable: true, reactionSpent: false };
  mockReactions = [
    { name: 'Deflect Projectile', triggerType: 'attack-ranged' },
    { name: 'Wing Deflection',    triggerType: 'attack-any' },
  ];
  mockStaffSpells = [];
  mockFocusSpells = [];
  mockCatalogSpells = [];
  mockShield = { raised: false, broken: false };
});

describe('ReactionPrompt', () => {
  it('renders nothing with no active prompt', () => {
    setup();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('shows the event, note, and every matching reaction when a prompt arrives', () => {
    setup();
    act(() => setPrompt(prompt));
    expect(screen.getByLabelText('Reaction trigger prompt')).toBeInTheDocument();
    expect(screen.getByText('Ranged attack incoming')).toBeInTheDocument();
    expect(screen.getByText('archer on the ledge')).toBeInTheDocument();
    // ranged-attack wakes both attack-ranged and attack-any
    expect(screen.getByLabelText('Use Deflect Projectile')).toBeInTheDocument();
    expect(screen.getByLabelText('Use Wing Deflection')).toBeInTheDocument();
  });

  it('renders nothing when no reaction matches the event', () => {
    mockReactions = [{ name: 'Retributive Strike', triggerType: 'damaged-ally' }];
    setup();
    act(() => setPrompt(prompt));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('renders nothing when the reaction is not available', () => {
    mockTurnState = { hasStartedFirstTurn: false, reactionAvailable: false, reactionSpent: false };
    setup();
    act(() => setPrompt(prompt));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('renders nothing when the encounter is not active', () => {
    mockEncounter = { active: false };
    setup();
    act(() => setPrompt(prompt));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('a round-stamped prompt expires when the round advances', () => {
    setup();
    act(() => setPrompt({ ...prompt, round: 1 }));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('Pass clears the synced prompt key', () => {
    setup();
    act(() => setPrompt(prompt));
    fireEvent.click(screen.getByLabelText('Pass on reaction'));
    expect(screen.queryByRole('region')).toBeNull();
    expect(__get(KEY)).toBeNull();
  });

  it('Use opens UseAbilityModal with the reaction at reaction cost; cancel keeps the prompt', () => {
    setup();
    act(() => setPrompt(prompt));
    fireEvent.click(screen.getByLabelText('Use Deflect Projectile'));
    expect(screen.getByTestId('use-ability-modal')).toHaveTextContent('Deflect Projectile (reaction)');

    // Cancelling the modal leaves the trigger prompt up — the player can still Pass.
    fireEvent.click(screen.getByLabelText('close modal'));
    expect(screen.queryByTestId('use-ability-modal')).toBeNull();
    expect(screen.getByLabelText('Reaction trigger prompt')).toBeInTheDocument();
    expect(__get(KEY)).not.toBeNull();
  });

  it('Shield Block row renders the damage-split bar instead of a Use button — only while raised', () => {
    mockReactions = [{ name: 'Shield Block', triggerType: 'damaged-self' }];
    mockShield = { raised: true, broken: false };
    setup();
    act(() => setPrompt({ ...prompt, eventId: 'damaged', label: 'PC was damaged' }));
    expect(screen.getByTestId('shield-block-bar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Use Shield Block')).toBeNull();
  });

  it('Shield Block does not match while the shield is not raised', () => {
    mockReactions = [{ name: 'Shield Block', triggerType: 'damaged-self' }];
    mockShield = { raised: false, broken: false };
    setup();
    act(() => setPrompt({ ...prompt, eventId: 'damaged', label: 'PC was damaged' }));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('reaction-cost staff spells match and Cast from the staff', () => {
    mockReactions = [];
    mockStaffSpells = [
      {
        name: 'Overselling Flourish',
        actions: 'Reaction',
        triggerType: 'damaged-self',
        fromStaff: true,
        active: true,
      },
      // Non-reaction staff spells never enter the matching pool.
      { name: 'Mirror Image', actions: 'Two Actions', triggerType: 'damaged-self', fromStaff: true, active: true },
    ];
    setup();
    act(() => setPrompt({ ...prompt, eventId: 'damaged', label: 'PC was damaged' }));
    expect(screen.queryByText('Mirror Image')).toBeNull();

    fireEvent.click(screen.getByLabelText('Use Overselling Flourish'));
    expect(screen.getByTestId('use-ability-modal'))
      .toHaveTextContent('Cast Overselling Flourish (reaction from staff)');
  });

  it('a stowed staff cannot offer its reaction spells', () => {
    mockReactions = [];
    mockStaffSpells = [
      { name: 'Overselling Flourish', actions: 'Reaction', triggerType: 'damaged-self', fromStaff: true, active: false },
    ];
    setup();
    act(() => setPrompt({ ...prompt, eventId: 'damaged', label: 'PC was damaged' }));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('reaction-cost focus spells match and Cast from focus', () => {
    mockReactions = [];
    mockFocusSpells = [
      { spellRef: 'counter-performance' },
      // A non-reaction focus spell never enters the matching pool.
      { spellRef: 'inspire-courage' },
    ];
    mockCatalogSpells = [
      {
        id: 'counter-performance',
        name: 'Counter Performance',
        actions: 'Reaction',
        triggerType: 'auditory-visual-effect',
      },
      {
        id: 'inspire-courage',
        name: 'Inspire Courage',
        actions: 'Single Action',
        triggerType: 'auditory-visual-effect',
      },
    ];
    setup();
    act(() => setPrompt({ ...prompt, eventId: 'auditory-visual-effect', label: 'Auditory/visual effect' }));
    expect(screen.queryByText('Inspire Courage')).toBeNull();

    fireEvent.click(screen.getByLabelText('Use Counter Performance'));
    expect(screen.getByTestId('use-ability-modal'))
      .toHaveTextContent('Cast Counter Performance (reaction from focus)');
  });

  it('a dangling focus spellRef is skipped without matching', () => {
    mockReactions = [];
    mockFocusSpells = [{ spellRef: 'counter-performance' }];
    mockCatalogSpells = []; // ref resolves to an "(unknown spell)" stub with no actions
    setup();
    act(() => setPrompt({ ...prompt, eventId: 'auditory-visual-effect', label: 'Auditory/visual effect' }));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('consumes the prompt once the reaction is spent', () => {
    setup();
    act(() => setPrompt(prompt));
    expect(screen.getByLabelText('Reaction trigger prompt')).toBeInTheDocument();

    // The reaction gets spent (e.g. UseAbilityModal confirm → spendReaction).
    mockTurnState = { ...mockTurnState, reactionSpent: true };
    act(() => setPrompt({ ...prompt })); // force a re-render with the new turn state
    expect(screen.queryByRole('region')).toBeNull();
    expect(__get(KEY)).toBeNull();
  });
});
