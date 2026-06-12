import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EldAttunementControl from './EldAttunementControl';

const { appendEvent, state } = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  state: { characters: [] },
}));

vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: state.characters }),
}));

vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent }),
}));

const izzy = {
  id: 'char-izzy',
  name: 'Izzy',
  spellcasting: {
    eldPowers: [
      { source: 'Forest', powers: [] },
      { source: 'River', powers: [] },
    ],
  },
};
const blu = { id: 'char-blu', name: 'Blu' };

describe('EldAttunementControl', () => {
  beforeEach(() => {
    localStorage.clear();
    appendEvent.mockClear();
    state.characters = [];
  });

  it('renders nothing when no character has Eld Powers', () => {
    state.characters = [blu];
    const { container } = render(<EldAttunementControl />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a row per Eld-capable character only', () => {
    state.characters = [izzy, blu];
    render(<EldAttunementControl />);
    expect(screen.getByText('Izzy')).toBeInTheDocument();
    expect(screen.queryByText('Blu')).toBeNull();
  });

  it('writes the synced attunement key and logs the override', () => {
    state.characters = [izzy];
    render(<EldAttunementControl />);
    fireEvent.change(screen.getByLabelText('eld-attunement-char-izzy'), {
      target: { value: 'River' },
    });
    expect(JSON.parse(localStorage.getItem('cnmh_eldattune_char-izzy'))).toBe('River');
    expect(appendEvent).toHaveBeenCalledWith({
      type: 'gm',
      text: "GM: set Izzy's Eld attunement to River",
    });
  });

  it('clearing the attunement logs the clear', () => {
    localStorage.setItem('cnmh_eldattune_char-izzy', JSON.stringify('Forest'));
    state.characters = [izzy];
    render(<EldAttunementControl />);
    fireEvent.change(screen.getByLabelText('eld-attunement-char-izzy'), {
      target: { value: '' },
    });
    expect(JSON.parse(localStorage.getItem('cnmh_eldattune_char-izzy'))).toBe('');
    expect(appendEvent).toHaveBeenCalledWith({
      type: 'gm',
      text: "GM: cleared Izzy's Eld attunement",
    });
  });

  it('reflects an existing attunement in the select', () => {
    localStorage.setItem('cnmh_eldattune_char-izzy', JSON.stringify('Forest'));
    state.characters = [izzy];
    render(<EldAttunementControl />);
    expect(screen.getByLabelText('eld-attunement-char-izzy')).toHaveValue('Forest');
  });
});
