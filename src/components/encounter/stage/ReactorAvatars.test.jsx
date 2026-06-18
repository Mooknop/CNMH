import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ReactorAvatars from './ReactorAvatars';

const characters = [
  { id: 'p1', name: 'Kestrel', image: 'k.png' },
  { id: 'p2', name: 'Brakk' }, // no image → monogram
];

describe('ReactorAvatars', () => {
  it('renders nothing when no one is reacting', () => {
    const { container } = render(<ReactorAvatars reactors={[]} characters={characters} selfId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an avatar per reactor with art or monogram + a reacting label', () => {
    render(
      <ReactorAvatars
        reactors={[{ pcId: 'p1' }, { pcId: 'p2' }]}
        characters={characters}
        selfId="p2"
      />
    );
    expect(screen.getByRole('img', { name: 'Portrait of Kestrel' })).toHaveAttribute('src', '/api/images/k.png');
    expect(screen.getByText('B')).toBeInTheDocument(); // Brakk monogram
    expect(screen.getByText('reacting')).toBeInTheDocument();
  });

  it('accent-outlines the viewer’s own avatar', () => {
    const { container } = render(
      <ReactorAvatars reactors={[{ pcId: 'p1' }, { pcId: 'p2' }]} characters={characters} selfId="p2" />
    );
    const selfImgBoxes = container.querySelectorAll('.stage-reactor-avatar--self');
    expect(selfImgBoxes).toHaveLength(1);
    // The self box is Brakk's (p2).
    expect(selfImgBoxes[0].textContent).toContain('B');
  });
});
