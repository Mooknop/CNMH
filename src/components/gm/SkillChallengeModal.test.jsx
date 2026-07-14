import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));

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
import { __reset, __store } from '../../hooks/useSyncedState';
import SkillChallengeModal from './SkillChallengeModal';

// ─── fixtures ────────────────────────────────────────────────
const CHARACTERS = [
  { id: 'thorn', name: 'Thorn' },
  { id: 'lira',  name: 'Lira'  },
];

beforeEach(() => {
  __reset();
  mockAppendEvent.mockClear();
  useContent.mockReturnValue({ characters: CHARACTERS });
});

afterEach(() => vi.restoreAllMocks());

const fillBasics = () => {
  fireEvent.change(screen.getByLabelText('challenge name'), { target: { value: 'Bolster the Ritual' } });
  fireEvent.change(screen.getByLabelText('skill 1 DC'), { target: { value: '19' } });
  fireEvent.change(screen.getByLabelText('victory point threshold'), { target: { value: '3' } });
};

const sentChallenges = () => Object.values(__store['cnmh_vpchallenge_global'] ?? {});

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

  it('sending adds the challenge to the global collection with defaults', () => {
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    fillBasics();
    fireEvent.click(screen.getByLabelText('Add skill'));
    fireEvent.change(screen.getByLabelText('skill 2'), { target: { value: 'intimidation' } });
    fireEvent.change(screen.getByLabelText('skill 2 DC'), { target: { value: '19' } });
    fireEvent.click(screen.getByLabelText('Start skill challenge'));

    const sent = sentChallenges();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(expect.objectContaining({
      name: 'Bolster the Ritual',
      threshold: 3,
      target: 'all',
      targetIds: ['thorn', 'lira'],
      mode: 'once',
      actionCost: 0,
      skills: [
        { skill: 'arcana', dc: 19 },
        { skill: 'intimidation', dc: 19 },
      ],
    }));
    expect(__store['cnmh_vpchallenge_global'][sent[0].id]).toBe(sent[0]);
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'challenge',
      text: expect.stringContaining('Bolster the Ritual'),
    }));
  });

  it('cadence and action-cost selections land on the challenge doc', () => {
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    fillBasics();
    fireEvent.change(screen.getByLabelText('challenge cadence'), { target: { value: 'perRound' } });
    fireEvent.change(screen.getByLabelText('action cost'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Start skill challenge'));

    expect(sentChallenges()[0]).toEqual(expect.objectContaining({
      mode: 'perRound',
      actionCost: 1,
    }));
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('repeats each round'),
    }));
  });

  it('single-target challenge targets only that character', () => {
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    fillBasics();
    fireEvent.change(screen.getByLabelText('target characters'), { target: { value: 'lira' } });
    fireEvent.click(screen.getByLabelText('Start skill challenge'));
    expect(sentChallenges()[0].targetIds).toEqual(['lira']);
  });

  it('sending adds a second concurrent track instead of replacing', () => {
    __store['cnmh_vpchallenge_global'] = {
      'vpc-old': { id: 'vpc-old', name: 'Old Hunt', targetIds: ['thorn'] },
    };
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    fillBasics();
    fireEvent.click(screen.getByLabelText('Start skill challenge'));

    const map = __store['cnmh_vpchallenge_global'];
    expect(Object.keys(map)).toHaveLength(2);
    expect(map['vpc-old'].name).toBe('Old Hunt');
  });

  it('upgrades the legacy single-challenge shape when adding a track', () => {
    __store['cnmh_vpchallenge_global'] = { id: 'vpc-old', name: 'Old Hunt', targetIds: ['thorn'] };
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    fillBasics();
    fireEvent.click(screen.getByLabelText('Start skill challenge'));

    const map = __store['cnmh_vpchallenge_global'];
    expect(Object.keys(map)).toHaveLength(2);
    expect(map['vpc-old']).toEqual(expect.objectContaining({ name: 'Old Hunt', mode: 'once' }));
  });

  it('notes how many tracks are already running', () => {
    __store['cnmh_vpchallenge_global'] = {
      'vpc-a': { id: 'vpc-a', name: 'A' },
      'vpc-b': { id: 'vpc-b', name: 'B' },
    };
    render(<SkillChallengeModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByRole('note')).toHaveTextContent('2 tracks already running');
  });

  it('calls onClose after sending', () => {
    const onClose = vi.fn();
    render(<SkillChallengeModal isOpen={true} onClose={onClose} />);
    fillBasics();
    fireEvent.click(screen.getByLabelText('Start skill challenge'));
    expect(onClose).toHaveBeenCalled();
  });
});
