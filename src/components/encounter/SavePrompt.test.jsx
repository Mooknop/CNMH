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
  return { __esModule: true, useSyncedState, __reset: () => { for (const k of Object.keys(store)) delete store[k]; } };
});

const mockAppendLog = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ appendLog: mockAppendLog }),
}));

// useCharacter resolves the inventory for the affixed save-bonus talisman (#254).
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: c.__inventory || [] } : null),
}));

import { __reset, useSyncedState } from '../../hooks/useSyncedState';
import { affixedKey } from '../../utils/affix';
import SavePrompt from './SavePrompt';

const prompt = { reqId: 'r1', save: 'reflex', dc: 18, effectName: 'Fireball', basic: true };
const saves   = { fortitude: 5, reflex: 8, will: 4 };

let setPrompt;
const PromptDriver = ({ charId }) => {
  const [, sp] = useSyncedState(`cnmh_saveprompt_${charId}`, null);
  React.useEffect(() => { setPrompt = sp; }, [sp]);
  return null;
};

function setup(charId = 'Pellias') {
  render(<><PromptDriver charId={charId} /><SavePrompt charId={charId} characterName="Pellias" saves={saves} /></>);
}

beforeEach(() => { __reset(); mockAppendLog.mockClear(); });

describe('SavePrompt', () => {
  it('renders nothing with no active prompt', () => {
    setup();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('shows save name, DC, modifier and d20 input when a prompt arrives', () => {
    setup();
    act(() => setPrompt(prompt));
    expect(screen.getByLabelText(/Reflex save prompt/)).toBeInTheDocument();
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('DC 18')).toBeInTheDocument();
    expect(screen.getByText(/\+8/)).toBeInTheDocument(); // modifier
    expect(screen.getByLabelText('d20 roll')).toBeInTheDocument();
  });

  it('Submit button disabled when d20 input is empty', () => {
    setup();
    act(() => setPrompt(prompt));
    expect(screen.getByLabelText('Submit Reflex save')).toBeDisabled();
  });

  it('submitting adds modifier, computes degree, logs result, shows outcome', () => {
    setup();
    act(() => setPrompt(prompt));
    // Roll 14: total = 14 + 8 = 22 ≥ DC 18 → success
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Reflex save'));

    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    // Roll button gone, result visible
    expect(screen.queryByLabelText('Submit Reflex save')).toBeNull();
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('22'),
    }));
  });

  it('natural 20 shifts degree up (success → crit success)', () => {
    setup();
    act(() => setPrompt({ reqId: 'r2', save: 'reflex', dc: 18 }));
    // d20=20, total=20+8=28 ≥ DC+10=28 → crit success already; natural 20 keeps it there
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '20' } });
    fireEvent.click(screen.getByLabelText('Submit Reflex save'));
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
  });

  it('natural 1 shifts degree down (success → failure)', () => {
    // Use a separate charId so the store key is fresh.
    let setPrompt2;
    const Driver2 = () => {
      const [, sp] = useSyncedState('cnmh_saveprompt_T2', null);
      React.useEffect(() => { setPrompt2 = sp; }, [sp]);
      return null;
    };
    render(
      <><Driver2 /><SavePrompt charId="T2" characterName="T2" saves={{ reflex: 17 }} /></>
    );
    // d20=1, modifier=17, total=18 → base success (meets DC); nat 1 → failure
    act(() => setPrompt2({ reqId: 'r3', save: 'reflex', dc: 18 }));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Submit Reflex save'));
    expect(screen.getByText('Failure')).toBeInTheDocument();
  });

  it('dismiss button clears the result', () => {
    setup();
    act(() => setPrompt(prompt));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Reflex save'));
    fireEvent.click(screen.getByLabelText('Dismiss save result'));
    expect(screen.queryByText('Success')).toBeNull();
    expect(screen.getByLabelText('d20 roll')).toBeInTheDocument();
  });

  it('a new prompt clears the previous result', () => {
    setup();
    act(() => setPrompt(prompt));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Reflex save'));
    // New prompt arrives.
    act(() => setPrompt({ reqId: 'r-new', save: 'will', dc: 20, effectName: 'Mind Crush' }));
    expect(screen.queryByText('Success')).toBeNull();
    expect(screen.getByText('Mind Crush')).toBeInTheDocument();
  });
});

describe('SavePrompt — Sanitizing Pin (#254/#339)', () => {
  const pin = {
    uid: 'pin1', name: 'Sanitizing Pin', traits: ['Talisman'],
    talisman: { affixTo: 'armor', activation: { cost: 'reaction', trigger: 'A save vs an affliction', effect: { kind: 'save-bonus', save: 'fortitude', bonus: 2, value: 'status', critFailToFail: true } } },
  };
  const character = { id: 'Ashka', name: 'Ashka', __inventory: [pin, { uid: 'a1', name: 'Plate', armor: { ac: 6 } }] };
  const fortSaves = { fortitude: 5, reflex: 8, will: 4 };

  let setAff, setPromptF, affVal, conVal;
  const Capture = ({ charId }) => {
    const [a, sa] = useSyncedState(affixedKey(charId), {});
    const [c] = useSyncedState(`cnmh_consumed_${charId}`, {});
    const [, sp] = useSyncedState(`cnmh_saveprompt_${charId}`, null);
    React.useEffect(() => { setAff = sa; setPromptF = sp; }, [sa, sp]);
    affVal = a; conVal = c;
    return null;
  };

  const setupPin = (save = 'fortitude') => {
    render(<><Capture charId="Ashka" /><SavePrompt charId="Ashka" characterName="Ashka" saves={fortSaves} character={character} /></>);
    act(() => setAff({ pin1: 'a1' }));
    act(() => setPromptF({ reqId: 'p1', save, dc: 18, effectName: 'Giant Centipede Venom' }));
  };

  it('shows the +2 toggle for a Fortitude prompt, not for a Reflex one', () => {
    setupPin('fortitude');
    expect(screen.getByLabelText(/Sanitizing Pin/)).toBeInTheDocument();
    // A reflex prompt: the pin (Fort-only) does not apply.
    act(() => setPromptF({ reqId: 'p2', save: 'reflex', dc: 18 }));
    expect(screen.queryByLabelText(/Sanitizing Pin/)).not.toBeInTheDocument();
  });

  it('toggling adds +2 to the total, flips the degree, and consumes the pin', () => {
    setupPin('fortitude');
    fireEvent.click(screen.getByLabelText(/Sanitizing Pin/));
    // d20 11 + 5 + 2 = 18 ≥ DC 18 → success (would be 16 → failure without the pin).
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '11' } });
    fireEvent.click(screen.getByLabelText('Submit Fortitude save'));
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('(Sanitizing Pin)'),
    }));
    expect(conVal).toEqual({ 'Sanitizing Pin': 1 });
    expect(affVal).toEqual({}); // unaffixed (consumed) on use
  });

  it('upgrades a critical failure to a failure when active', () => {
    setupPin('fortitude');
    fireEvent.click(screen.getByLabelText(/Sanitizing Pin/));
    // d20 1 + 5 + 2 = 8 = DC-10 → critical failure, upgraded to Failure by the pin.
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Submit Fortitude save'));
    expect(screen.getByText('Failure')).toBeInTheDocument();
    expect(screen.queryByText('Critical Failure')).toBeNull();
  });

  it('does not consume the pin when the toggle is left off', () => {
    setupPin('fortitude');
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '11' } });
    fireEvent.click(screen.getByLabelText('Submit Fortitude save'));
    expect(conVal).toEqual({});
    expect(affVal).toEqual({ pin1: 'a1' });
  });
});
