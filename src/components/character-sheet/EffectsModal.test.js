import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EffectsModal from './EffectsModal';


const mockGetState = jest.fn(() => []);
const mockSendUpdate = jest.fn();
const mockAppendLog = jest.fn();

jest.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: mockGetState,
    sendUpdate: mockSendUpdate,
  }),
}));

jest.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({
    characters: [
      { id: 'char-a', name: 'Pellias' },
      { id: 'char-b', name: 'Ashka' },
    ],
    effects: [
      { id: 'heroism-1', name: 'Heroism 1', description: '+1 status to attacks and saves', modifiers: [] },
      { id: 'bless', name: 'Bless', description: '+1 status to attack rolls', modifiers: [] },
    ],
  }),
}));

jest.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: null,
    appendLog: mockAppendLog,
  }),
}));

jest.mock('../../utils/uid', () => ({
  newEntryUid: () => 'test-uid-123',
}));

jest.mock('../shared/Modal', () => {
  return function MockModal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <span>{title}</span>
        <button onClick={onClose}>Close</button>
        {children}
      </div>
    );
  };
});

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  themeColor: '#7b3f00',
  selfCharId: 'char-a',
  selfName: 'Pellias',
};

describe('EffectsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<EffectsModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the "Apply Effect" title when open', () => {
    render(<EffectsModal {...defaultProps} />);
    expect(screen.getByText('Apply Effect')).toBeInTheDocument();
  });

  it('renders all effects from the catalog', () => {
    render(<EffectsModal {...defaultProps} />);
    expect(screen.getByText('Heroism 1')).toBeInTheDocument();
    expect(screen.getByText('Bless')).toBeInTheDocument();
  });

  it('renders effect descriptions', () => {
    render(<EffectsModal {...defaultProps} />);
    expect(screen.getByText('+1 status to attacks and saves')).toBeInTheDocument();
  });

  it('shows the target picker with all characters', () => {
    render(<EffectsModal {...defaultProps} />);
    const select = screen.getByLabelText('effect-target');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pellias (you)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ashka' })).toBeInTheDocument();
  });

  it('defaults target to selfCharId', () => {
    render(<EffectsModal {...defaultProps} />);
    const select = screen.getByLabelText('effect-target');
    expect(select.value).toBe('char-a');
  });

  it('allows changing the target', () => {
    render(<EffectsModal {...defaultProps} />);
    const select = screen.getByLabelText('effect-target');
    fireEvent.change(select, { target: { value: 'char-b' } });
    expect(select.value).toBe('char-b');
  });

  describe('applying an effect to self', () => {
    it('calls getState with selfCharId to read current effects', () => {
      render(<EffectsModal {...defaultProps} />);
      fireEvent.click(screen.getByText('Heroism 1').closest('button'));
      expect(mockGetState).toHaveBeenCalledWith('char-a', 'effects');
    });

    it('calls sendUpdate with the correct target and merged effects', () => {
      render(<EffectsModal {...defaultProps} />);
      fireEvent.click(screen.getByText('Heroism 1').closest('button'));
      expect(mockSendUpdate).toHaveBeenCalledWith(
        'char-a',
        'effects',
        expect.arrayContaining([
          expect.objectContaining({ effectId: 'heroism-1', appliedBy: 'char-a' }),
        ])
      );
    });

    it('writes to localStorage under cnmh_effects_<targetId>', () => {
      render(<EffectsModal {...defaultProps} />);
      fireEvent.click(screen.getByText('Bless').closest('button'));
      const stored = JSON.parse(localStorage.getItem('cnmh_effects_char-a'));
      expect(stored).not.toBeNull();
      expect(stored[0].effectId).toBe('bless');
    });

    it('closes the modal after applying', () => {
      const onClose = jest.fn();
      render(<EffectsModal {...defaultProps} onClose={onClose} />);
      fireEvent.click(screen.getByText('Heroism 1').closest('button'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('applying an effect to a different target', () => {
    it('calls sendUpdate with the target charId (not self)', () => {
      render(<EffectsModal {...defaultProps} />);
      const select = screen.getByLabelText('effect-target');
      fireEvent.change(select, { target: { value: 'char-b' } });
      fireEvent.click(screen.getByText('Heroism 1').closest('button'));
      expect(mockSendUpdate).toHaveBeenCalledWith(
        'char-b',
        'effects',
        expect.arrayContaining([
          expect.objectContaining({ effectId: 'heroism-1', appliedBy: 'char-a' }),
        ])
      );
    });

    it('writes to localStorage under the target id', () => {
      render(<EffectsModal {...defaultProps} />);
      const select = screen.getByLabelText('effect-target');
      fireEvent.change(select, { target: { value: 'char-b' } });
      fireEvent.click(screen.getByText('Bless').closest('button'));
      const stored = JSON.parse(localStorage.getItem('cnmh_effects_char-b'));
      expect(stored).not.toBeNull();
      expect(stored[0].effectId).toBe('bless');
    });
  });

  describe('appending to existing effects', () => {
    it('merges with existing effects returned by getState', () => {
      const existing = [{ id: 'existing-uid', effectId: 'bless', ts: 100 }];
      mockGetState.mockReturnValue(existing);
      render(<EffectsModal {...defaultProps} />);
      fireEvent.click(screen.getByText('Heroism 1').closest('button'));
      const [, , nextEffects] = mockSendUpdate.mock.calls[0];
      expect(nextEffects).toHaveLength(2);
      expect(nextEffects[0].effectId).toBe('bless');
      expect(nextEffects[1].effectId).toBe('heroism-1');
    });
  });
});
