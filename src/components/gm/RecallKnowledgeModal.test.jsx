import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../contexts/SessionContext',  () => ({ useSession:  vi.fn() }));
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: vi.fn(), log: [] }),
}));

import { useContent } from '../../contexts/ContentContext';
import { useSession }  from '../../contexts/SessionContext';
import RecallKnowledgeModal from './RecallKnowledgeModal';

// ─── fixtures ────────────────────────────────────────────────
const CHARACTERS = [
  { id: 'thorn', name: 'Thorn' },
  { id: 'lira',  name: 'Lira'  },
];

let sendUpdate;

beforeEach(() => {
  sendUpdate = vi.fn();
  useContent.mockReturnValue({ characters: CHARACTERS });
  useSession.mockReturnValue({ sendUpdate });
});

afterEach(() => vi.restoreAllMocks());

// ─── tests ───────────────────────────────────────────────────
describe('RecallKnowledgeModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<RecallKnowledgeModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows skill picker, DC input, and target select when open', () => {
    render(<RecallKnowledgeModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByLabelText('knowledge skill')).toBeInTheDocument();
    expect(screen.getByLabelText('recall knowledge DC')).toBeInTheDocument();
    expect(screen.getByLabelText('target characters')).toBeInTheDocument();
    expect(screen.getByText('Thorn')).toBeInTheDocument();
    expect(screen.getByText('Lira')).toBeInTheDocument();
  });

  it('Send Prompt button is disabled when DC is empty', () => {
    render(<RecallKnowledgeModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByLabelText('Send recall knowledge prompt')).toBeDisabled();
  });

  it('shows suggested DC when level is entered', () => {
    render(<RecallKnowledgeModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('creature level'), { target: { value: '5' } });
    // Level 5 common → DC 20
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByLabelText(/Use suggested DC 20/)).toBeInTheDocument();
  });

  it('Use button populates the DC field with the suggested value', () => {
    render(<RecallKnowledgeModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('creature level'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText(/Use suggested DC 20/));
    expect(screen.getByLabelText('recall knowledge DC').value).toBe('20');
  });

  it('rarity bump adjusts suggested DC (uncommon +2)', () => {
    render(<RecallKnowledgeModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('creature level'),  { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('creature rarity'), { target: { value: 'uncommon' } });
    // Level 5 uncommon → DC 22
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('sends skillprompt to all characters when target is "all"', () => {
    render(<RecallKnowledgeModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('creature or subject label'), { target: { value: 'Red Dragon' } });
    fireEvent.change(screen.getByLabelText('knowledge skill'), { target: { value: 'arcana' } });
    fireEvent.change(screen.getByLabelText('recall knowledge DC'), { target: { value: '24' } });
    fireEvent.click(screen.getByLabelText('Send recall knowledge prompt'));

    expect(sendUpdate).toHaveBeenCalledTimes(2);
    expect(sendUpdate).toHaveBeenCalledWith('thorn', 'skillprompt', expect.objectContaining({
      skill: 'arcana', dc: 24, label: 'Red Dragon',
    }));
    expect(sendUpdate).toHaveBeenCalledWith('lira', 'skillprompt', expect.objectContaining({
      skill: 'arcana', dc: 24, label: 'Red Dragon',
    }));
  });

  it('sends skillprompt only to the selected character when a specific target is chosen', () => {
    render(<RecallKnowledgeModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('knowledge skill'), { target: { value: 'nature' } });
    fireEvent.change(screen.getByLabelText('recall knowledge DC'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('target characters'), { target: { value: 'thorn' } });
    fireEvent.click(screen.getByLabelText('Send recall knowledge prompt'));

    expect(sendUpdate).toHaveBeenCalledTimes(1);
    expect(sendUpdate).toHaveBeenCalledWith('thorn', 'skillprompt', expect.objectContaining({
      skill: 'nature', dc: 18,
    }));
  });

  it('omits label from payload when subject field is blank', () => {
    render(<RecallKnowledgeModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('knowledge skill'), { target: { value: 'occultism' } });
    fireEvent.change(screen.getByLabelText('recall knowledge DC'), { target: { value: '22' } });
    fireEvent.change(screen.getByLabelText('target characters'), { target: { value: 'lira' } });
    fireEvent.click(screen.getByLabelText('Send recall knowledge prompt'));

    const call = sendUpdate.mock.calls[0][2];
    expect(call.label).toBeUndefined();
  });

  it('calls onClose after sending', () => {
    const onClose = vi.fn();
    render(<RecallKnowledgeModal isOpen={true} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('recall knowledge DC'), { target: { value: '20' } });
    fireEvent.click(screen.getByLabelText('Send recall knowledge prompt'));
    expect(onClose).toHaveBeenCalled();
  });
});
