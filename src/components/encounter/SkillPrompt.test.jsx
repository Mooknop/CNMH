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
import SkillPrompt from './SkillPrompt';

const skillMods = { arcana: 7, nature: 4, occultism: 9, religion: 2, society: 5 };

let setPrompt;
const PromptDriver = ({ charId }) => {
  const [, sp] = useSyncedState(`cnmh_skillprompt_${charId}`, null);
  React.useEffect(() => { setPrompt = sp; }, [sp]);
  return null;
};

function setup(charId = 'thorn') {
  render(
    <>
      <PromptDriver charId={charId} />
      <SkillPrompt charId={charId} characterName="Thorn" skillModifiers={skillMods} />
    </>
  );
}

beforeEach(() => { __reset(); mockAppendLog.mockClear(); });

describe('SkillPrompt', () => {
  it('renders nothing with no active prompt', () => {
    setup();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('shows skill name, DC, modifier and d20 input when a prompt arrives', () => {
    setup();
    act(() => setPrompt({ reqId: 'r1', skill: 'arcana', dc: 22, label: 'Recall Knowledge: Dragon' }));
    expect(screen.getByLabelText('Arcana skill prompt')).toBeInTheDocument();
    expect(screen.getByText('Recall Knowledge: Dragon')).toBeInTheDocument();
    expect(screen.getByText('DC 22')).toBeInTheDocument();
    expect(screen.getByText(/\+7/)).toBeInTheDocument();
    expect(screen.getByLabelText('d20 roll')).toBeInTheDocument();
  });

  it('shows skill label when no label string provided', () => {
    setup();
    act(() => setPrompt({ reqId: 'r1', skill: 'nature', dc: 18 }));
    expect(screen.getByText('Recall Knowledge')).toBeInTheDocument();
    expect(screen.getByText('Nature')).toBeInTheDocument();
  });

  it('Submit button disabled when d20 input is empty', () => {
    setup();
    act(() => setPrompt({ reqId: 'r1', skill: 'arcana', dc: 22 }));
    expect(screen.getByLabelText('Submit Arcana check')).toBeDisabled();
  });

  it('submitting adds skill modifier, computes degree, logs result', () => {
    setup();
    act(() => setPrompt({ reqId: 'r1', skill: 'occultism', dc: 20, label: 'Recall: Demon' }));
    // d20=14, mod=9, total=23 ≥ DC 20 → success
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Occultism check'));

    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.queryByLabelText('Submit Occultism check')).toBeNull();
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('23'),
    }));
  });

  it('natural 20 shifts degree up (success → crit success)', () => {
    setup();
    // d20=20, arcana mod=7, total=27, DC=22: 27≥22 → success; nat20 shifts up → crit success
    act(() => setPrompt({ reqId: 'r2', skill: 'arcana', dc: 22 }));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '20' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
  });

  it('natural 1 shifts degree down (success → failure)', () => {
    let setPrompt2;
    const Driver2 = () => {
      const [, sp] = useSyncedState('cnmh_skillprompt_lira', null);
      React.useEffect(() => { setPrompt2 = sp; }, [sp]);
      return null;
    };
    render(
      <>
        <Driver2 />
        <SkillPrompt charId="lira" characterName="Lira" skillModifiers={{ society: 19 }} />
      </>
    );
    // d20=1, mod=19, total=20, DC=20: base success; nat1 → failure
    act(() => setPrompt2({ reqId: 'r3', skill: 'society', dc: 20 }));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Submit Society check'));
    expect(screen.getByText('Failure')).toBeInTheDocument();
  });

  it('dismiss button clears the result', () => {
    setup();
    act(() => setPrompt({ reqId: 'r1', skill: 'arcana', dc: 22 }));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    fireEvent.click(screen.getByLabelText('Dismiss skill result'));
    expect(screen.queryByText('Success')).toBeNull();
    expect(screen.getByLabelText('d20 roll')).toBeInTheDocument();
  });

  it('a new prompt clears the previous result', () => {
    setup();
    act(() => setPrompt({ reqId: 'r1', skill: 'arcana', dc: 22 }));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    act(() => setPrompt({ reqId: 'r2', skill: 'nature', dc: 18, label: 'Recall: Wolf' }));
    expect(screen.queryByText('Success')).toBeNull();
    expect(screen.getByText('Recall: Wolf')).toBeInTheDocument();
  });
});

describe('SkillPrompt — VP challenge prompts', () => {
  const challenge = (overrides = {}) => ({
    reqId: 'vpc-1-thorn',
    challengeId: 'vpc-1',
    skills: [
      { skill: 'arcana', dc: 19 },
      { skill: 'occultism', dc: 19 },
      { skill: 'religion', dc: 21 },
    ],
    label: 'Bolster the Ritual',
    ...overrides,
  });

  const readVpResult = (charId = 'thorn') => {
    let value;
    const Reader = () => {
      [value] = useSyncedState(`cnmh_vpresult_${charId}`, null);
      return null;
    };
    render(<Reader />);
    return value;
  };

  it('renders one choice per allowed skill with DC and modifier', () => {
    setup();
    act(() => setPrompt(challenge()));
    expect(screen.getByText('Bolster the Ritual')).toBeInTheDocument();
    const choices = screen.getAllByRole('radio');
    expect(choices).toHaveLength(3);
    expect(screen.getByText('Arcana')).toBeInTheDocument();
    expect(screen.getByText('Occultism')).toBeInTheDocument();
    expect(screen.getByText('Religion')).toBeInTheDocument();
    expect(screen.getAllByText('DC 19')).toHaveLength(2);
    expect(screen.getByText('DC 21')).toBeInTheDocument();
    expect(screen.getByText('+7')).toBeInTheDocument();  // arcana mod
    expect(screen.getByText('+9')).toBeInTheDocument();  // occultism mod
  });

  it('submit is disabled until a skill is chosen', () => {
    setup();
    act(() => setPrompt(challenge()));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    expect(screen.getByLabelText('Submit check')).toBeDisabled();
    fireEvent.click(screen.getByText('Occultism'));
    expect(screen.getByLabelText('Submit Occultism check')).toBeEnabled();
  });

  it('submitting uses the chosen skill modifier/DC and writes the vp result', () => {
    setup();
    act(() => setPrompt(challenge()));
    // occultism mod 9, d20=12 → total 21 ≥ DC 19 → success → +1 VP
    fireEvent.click(screen.getByText('Occultism'));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('Submit Occultism check'));

    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('+1 VP')).toBeInTheDocument();
    expect(readVpResult()).toEqual(expect.objectContaining({
      challengeId: 'vpc-1',
      reqId: 'vpc-1-thorn',
      skill: 'occultism',
      d20: 12,
      total: 21,
      degree: 'success',
      vp: 1,
    }));
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('+1 VP'),
    }));
  });

  it('critical success contributes +2 VP', () => {
    setup();
    act(() => setPrompt(challenge()));
    // arcana mod 7, d20=20: total 27, DC 19 → success; nat 20 shifts up → crit success
    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '20' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(screen.getByText('+2 VP')).toBeInTheDocument();
    expect(readVpResult()).toEqual(expect.objectContaining({ vp: 2, degree: 'criticalSuccess' }));
  });

  it('critical failure contributes -1 VP', () => {
    setup();
    act(() => setPrompt(challenge()));
    // religion mod 2, d20=1: total 3, DC 21 → crit failure
    fireEvent.click(screen.getByText('Religion'));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Submit Religion check'));
    expect(screen.getByText('-1 VP')).toBeInTheDocument();
    expect(readVpResult()).toEqual(expect.objectContaining({ vp: -1, degree: 'criticalFailure' }));
  });

  it('challenge results are locked — no dismiss button, no re-entry', () => {
    setup();
    act(() => setPrompt(challenge()));
    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(screen.queryByLabelText('Dismiss skill result')).toBeNull();
    expect(screen.queryByLabelText('d20 roll')).toBeNull();
  });

  it('a rehydrated vp result for the same reqId renders as already submitted', () => {
    let setVp;
    const VpDriver = () => {
      const [, sv] = useSyncedState('cnmh_vpresult_thorn', null);
      React.useEffect(() => { setVp = sv; }, [sv]);
      return null;
    };
    render(
      <>
        <PromptDriver charId="thorn" />
        <VpDriver />
        <SkillPrompt charId="thorn" characterName="Thorn" skillModifiers={skillMods} />
      </>
    );
    act(() => setPrompt(challenge()));
    act(() => setVp({
      challengeId: 'vpc-1', reqId: 'vpc-1-thorn', skill: 'arcana',
      d20: 14, total: 21, degree: 'success', vp: 1, at: 1,
    }));
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('+1 VP')).toBeInTheDocument();
    expect(screen.queryByLabelText('d20 roll')).toBeNull();
  });

  it('a new reqId resets the chosen skill and result', () => {
    setup();
    act(() => setPrompt(challenge()));
    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    act(() => setPrompt(challenge({ reqId: 'vpc-2-thorn', challengeId: 'vpc-2' })));
    expect(screen.queryByText('+1 VP')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByLabelText('d20 roll')).toBeInTheDocument();
  });

  it('single-entry skills array skips the chooser but still writes the vp result', () => {
    setup();
    act(() => setPrompt(challenge({ skills: [{ skill: 'arcana', dc: 19 }] })));
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(readVpResult()).toEqual(expect.objectContaining({ skill: 'arcana', vp: 1 }));
  });
});
