import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockRemoveEffect = jest.fn();
const mockEffects = { effects: [], removeEffect: mockRemoveEffect };

jest.mock('../../hooks/useEffects', () => ({
  useEffects: () => mockEffects,
}));

jest.mock('../../data/pf2eEffects', () => {
  const list = [
    { id: 'heroism-1', name: 'Heroism 1', modifiers: [] },
    { id: 'bless', name: 'Bless', modifiers: [] },
  ];
  list.getEffect = (id) => list.find((e) => e.id === id);
  return list;
});

// getEffect is imported separately — wire it up via the mock
jest.mock('../../data/pf2eEffects', () => {
  const catalog = [
    { id: 'heroism-1', name: 'Heroism 1', modifiers: [] },
    { id: 'bless', name: 'Bless', modifiers: [] },
  ];
  const getEffect = (id) => catalog.find((e) => e.id === id);
  const defaultExport = catalog;
  defaultExport.default = catalog;
  return { __esModule: true, default: catalog, getEffect };
});

import EffectsPanel from './EffectsPanel';

describe('EffectsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEffects.effects = [];
  });

  it('renders nothing when no effects are active', () => {
    const { container } = render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the EFFECTS header when effects are present', () => {
    mockEffects.effects = [{ id: 'uid-1', effectId: 'heroism-1', ts: 1 }];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(screen.getByText('EFFECTS')).toBeInTheDocument();
  });

  it('shows the effect count', () => {
    mockEffects.effects = [
      { id: 'uid-1', effectId: 'heroism-1', ts: 1 },
      { id: 'uid-2', effectId: 'bless', ts: 2 },
    ];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows all effect names', () => {
    mockEffects.effects = [
      { id: 'uid-1', effectId: 'heroism-1', ts: 1 },
      { id: 'uid-2', effectId: 'bless', ts: 2 },
    ];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(screen.getByText('Heroism 1')).toBeInTheDocument();
    expect(screen.getByText('Bless')).toBeInTheDocument();
  });

  it('falls back to effectId when effect is not in catalog', () => {
    mockEffects.effects = [{ id: 'uid-unk', effectId: 'unknown-effect', ts: 1 }];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(screen.getByText('unknown-effect')).toBeInTheDocument();
  });

  it('calls removeEffect with the entry id when × is clicked', () => {
    mockEffects.effects = [{ id: 'uid-rm', effectId: 'heroism-1', ts: 1 }];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    fireEvent.click(screen.getByTitle('Remove Heroism 1'));
    expect(mockRemoveEffect).toHaveBeenCalledWith('uid-rm');
  });

  it('renders a remove button per effect', () => {
    mockEffects.effects = [
      { id: 'uid-1', effectId: 'heroism-1', ts: 1 },
      { id: 'uid-2', effectId: 'bless', ts: 2 },
    ];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    const removeButtons = screen.getAllByRole('button');
    expect(removeButtons).toHaveLength(2);
  });
});
