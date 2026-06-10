import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../contexts/SessionContext',  () => ({ useSession:  vi.fn() }));

const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent, log: [] }),
}));

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
    __store: store,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

import { useContent } from '../../contexts/ContentContext';
import { useSession }  from '../../contexts/SessionContext';
import { __reset, __store } from '../../hooks/useSyncedState';
import SkillChallengeModal from './SkillChallengeModal';

// ─── fixtures ────────────────────────────────────────────────
const CHARACTERS = [
  { id: 'thorn', name: 'Thorn' },
  { id: 'lira',  name: 'Lira'  },
];

let sendUpdate;

beforeEach(() => {
  __reset();
  sendUpdate = vi.fn();
  mockAppendEvent.mockClear();
  useContent.mockReturnValue({ characters: CHARACTERS });
  useSession.mockReturnValue({ sendUpdate });
});

afterEach(() => vi.restoreAllMocks());

const fillBasics = () => {
  fireEvent.change(screen.getByLabelText('challenge name'), { target: { value: 'Bolster the Ritual' } });
  fireEvent.change(screen.getByLabelText('skill 1 DC'), { target: { value: '19' } });
  fireEvent.change(screen.getByLabelText('victory point threshold'), { target: { value: '3' } });
};

// ─── tests ───────────────────────────────────────────────────
describe('SkillChallengeModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SkillChallengeModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('start button disabled until name, DC, and threshold are filled', () => {
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    const start = screen.getByLabelText('Start skill challenge');
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('challenge name'), { target: { value: 'Ritual' } });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('skill 1 DC'), { target: { value: '19' } });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('victory point threshold'), { target: { value: '3' } });
    expect(start).toBeEnabled();
  });

  it('adds and removes skill rows; sole row cannot be removed', () => {
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByLabelText('Remove skill 1')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Add skill'));
    expect(screen.getByLabelText('skill 2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove skill 2'));
    expect(screen.queryByLabelText('skill 2')).toBeNull();
  });

  it('all skill rows must have a DC before sending', () => {
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    fillBasics();
    fireEvent.click(screen.getByLabelText('Add skill'));
    expect(screen.getByLabelText('Start skill challenge')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('skill 2 DC'), { target: { value: '21' } });
    expect(screen.getByLabelText('Start skill challenge')).toBeEnabled();
  });

  it('sending sets the global challenge and prompts every character', () => {
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    fillBasics();
    fireEvent.click(screen.getByLabelText('Add skill'));
    fireEvent.change(screen.getByLabelText('skill 2'), { target: { value: 'intimidation' } });
    fireEvent.change(screen.getByLabelText('skill 2 DC'), { target: { value: '19' } });
    fireEvent.click(screen.getByLabelText('Start skill challenge'));

    const challenge = __store['cnmh_vpchallenge_global'];
    expect(challenge).toEqual(expect.objectContaining({
      name: 'Bolster the Ritual',
      threshold: 3,
      target: 'all',
      targetIds: ['thorn', 'lira'],
      skills: [
        { skill: 'arcana', dc: 19 },
        { skill: 'intimidation', dc: 19 },
      ],
    }));

    // per character: vpresult cleared + skillprompt pushed
    expect(sendUpdate).toHaveBeenCalledWith('thorn', 'vpresult', null);
    expect(sendUpdate).toHaveBeenCalledWith('lira',  'vpresult', null);
    expect(sendUpdate).toHaveBeenCalledWith('thorn', 'skillprompt', expect.objectContaining({
      challengeId: challenge.id,
      label: 'Bolster the Ritual',
      skills: challenge.skills,
    }));
    expect(sendUpdate).toHaveBeenCalledWith('lira', 'skillprompt', expect.objectContaining({
      challengeId: challenge.id,
    }));
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'challenge',
      text: expect.stringContaining('Bolster the Ritual'),
    }));
  });

  it('single-target challenge prompts only that character', () => {
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    fillBasics();
    fireEvent.change(screen.getByLabelText('target characters'), { target: { value: 'lira' } });
    fireEvent.click(screen.getByLabelText('Start skill challenge'));

    expect(__store['cnmh_vpchallenge_global'].targetIds).toEqual(['lira']);
    const promptCalls = sendUpdate.mock.calls.filter(([, type]) => type === 'skillprompt');
    expect(promptCalls).toHaveLength(1);
    expect(promptCalls[0][0]).toBe('lira');
  });

  it('warns when a challenge is already active', () => {
    __store['cnmh_vpchallenge_global'] = { id: 'vpc-old', name: 'Old Hunt' };
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByRole('note')).toHaveTextContent('Old Hunt');
  });

  it('calls onClose after sending', () => {
    const onClose = vi.fn();
    render(<SkillChallengeModal isOpen={true} onClose={onClose} />);
    fillBasics();
    fireEvent.click(screen.getByLabelText('Start skill challenge'));
    expect(onClose).toHaveBeenCalled();
  });
});
