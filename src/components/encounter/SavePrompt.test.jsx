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

import { __reset, useSyncedState } from '../../hooks/useSyncedState';
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
