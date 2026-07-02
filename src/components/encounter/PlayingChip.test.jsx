import React from 'react';
import { render, screen } from '@testing-library/react';

const mockPlaying = { playing: false, expireAt: null, stop: vi.fn() };
vi.mock('../../hooks/usePlaying', () => ({
  usePlaying: () => mockPlaying,
}));

import PlayingChip from './PlayingChip';

const pc = { entryId: 'e1', kind: 'pc', name: 'Izzy', charId: 'Izzy' };

describe('PlayingChip', () => {
  beforeEach(() => {
    mockPlaying.playing = false;
  });

  it('renders nothing while not playing', () => {
    const { container } = render(<PlayingChip entry={pc} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for non-pc entries', () => {
    mockPlaying.playing = true;
    const { container } = render(<PlayingChip entry={{ entryId: 'g1', kind: 'enemy', name: 'Goblin' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the music-note glyph while playing', () => {
    mockPlaying.playing = true;
    render(<PlayingChip entry={pc} />);
    const chip = screen.getByLabelText('Izzy is playing');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('♪♫');
  });
});
