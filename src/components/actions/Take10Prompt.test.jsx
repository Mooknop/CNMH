import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockSetReady = vi.fn();
const mockAddActivity = vi.fn();
const mockRemoveActivity = vi.fn();
let mockState = {};
vi.mock('../../hooks/useTake10', () => ({
  __esModule: true,
  useTake10: () => mockState,
}));

// Eligible-for-everything model so the catalog renders its full set; per-test
// overridable so picker tests can inject inventory.
let mockModel = {};
vi.mock('../../hooks/useCharacter', () => ({
  __esModule: true,
  useCharacter: () => mockModel,
}));

import Take10Prompt from './Take10Prompt';

const character = { id: 'a', name: 'Ari' };

const baseModel = {
  flags: { hasFocusSpells: true, hasSpellcasting: true },
  skillProficiencies: { medicine: 1, crafting: 1, arcana: 1 },
};

beforeEach(() => {
  mockSetReady.mockClear();
  mockAddActivity.mockClear();
  mockRemoveActivity.mockClear();
  mockModel = baseModel;
  mockState = {
    active: true,
    minutes: 10,
    myMinutes: 0,
    activities: [],
    ready: false,
    setReady: mockSetReady,
    addActivity: mockAddActivity,
    removeActivity: mockRemoveActivity,
    readyCount: 1,
    allReady: false,
    ids: ['a', 'b', 'c'],
  };
});

describe('Take10Prompt', () => {
  it('renders nothing when no Take 10 is active', () => {
    mockState.active = false;
    const { container } = render(<Take10Prompt character={character} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the block length, budget meter, and ready count', () => {
    render(<Take10Prompt character={character} />);
    expect(screen.getByText('10 min block')).toBeInTheDocument();
    expect(screen.getByText('0 / 10 min allocated')).toBeInTheDocument();
    expect(screen.getByText('1 / 3 ready')).toBeInTheDocument();
  });

  it('lists eligible activities and adds one on click', () => {
    render(<Take10Prompt character={character} />);
    fireEvent.click(screen.getByRole('button', { name: /Refocus/ }));
    expect(mockAddActivity).toHaveBeenCalledWith({ id: 'refocus', label: 'Refocus', minutes: 10 });
  });

  it('renders the stacked allocation with removable entries', () => {
    mockState.activities = [{ id: 'refocus', label: 'Refocus', minutes: 10 }];
    mockState.myMinutes = 10;
    render(<Take10Prompt character={character} />);
    expect(screen.getByText('10 / 10 min allocated')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Refocus' }));
    expect(mockRemoveActivity).toHaveBeenCalledWith(0);
  });

  it('shows a waiting hint once everyone is ready', () => {
    mockState.allReady = true;
    render(<Take10Prompt character={character} />);
    expect(screen.getByText(/waiting for the GM to resolve/i)).toBeInTheDocument();
  });

  it('toggles readiness on click', () => {
    render(<Take10Prompt character={character} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(mockSetReady).toHaveBeenCalledWith(true);
  });

  it('reflects a ready state', () => {
    mockState.ready = true;
    render(<Take10Prompt character={character} />);
    const btn = screen.getByRole('button', { name: /Ready/ });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveTextContent('✓ Ready');
  });

  describe('item-targeted consumables (#566)', () => {
    const oil = {
      id: 'oil-w', name: 'Oil of Weightlessness', traits: ['Consumable', 'Oil'],
      consumable: { kind: 'effect', target: 'item', durationMinutes: 60, label: 'Weightless' },
    };
    const longsword = { id: 'longsword', name: 'Longsword', strikes: [{ name: 'Longsword' }] };

    beforeEach(() => {
      mockModel = { ...baseModel, inventory: [oil, longsword] };
    });

    it('surfaces an oil as a pick-needed activity (not added directly)', () => {
      render(<Take10Prompt character={character} />);
      fireEvent.click(screen.getByRole('button', { name: /Apply Oil of Weightlessness/ }));
      // Opening the picker must not allocate anything yet.
      expect(mockAddActivity).not.toHaveBeenCalled();
      expect(screen.getByText(/pick a target/i)).toBeInTheDocument();
    });

    it('allocates the oil against the chosen target', () => {
      render(<Take10Prompt character={character} />);
      fireEvent.click(screen.getByRole('button', { name: /Apply Oil of Weightlessness/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Longsword' }));
      expect(mockAddActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'oil',
          itemName: 'Oil of Weightlessness',
          targetUid: 'longsword',
          targetName: 'Longsword',
          label: 'Apply Oil of Weightlessness → Longsword',
          meta: expect.objectContaining({ durationMinutes: 60 }),
        })
      );
    });

    it('cancels the picker without allocating', () => {
      render(<Take10Prompt character={character} />);
      fireEvent.click(screen.getByRole('button', { name: /Apply Oil of Weightlessness/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockAddActivity).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Apply Oil of Weightlessness/ })).toBeInTheDocument();
    });
  });
});
