import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import IconTile from './IconTile';

describe('IconTile', () => {
  it('renders the monospace code placeholder without image or rune', () => {
    const { container } = render(<IconTile item={{ name: 'Rope' }} />);
    expect(container.querySelector('.icon-tile-code')).not.toBeNull();
    expect(container.querySelector('.icon-tile-rune-art')).toBeNull();
  });

  it('renders the real image when present', () => {
    const { container } = render(<IconTile item={{ name: 'Sword', image: 'img_s.jpg' }} />);
    const img = container.querySelector('.icon-tile-img');
    expect(img).toHaveAttribute('src', '/api/images/img_s.jpg');
  });

  it('an imageless rune-marked item shows its tinted rune as the art', () => {
    const { container } = render(
      <IconTile item={{ name: 'Carnasia Tattoo', thassilonianRune: 'lust' }} />
    );
    const rune = container.querySelector('.icon-tile-rune-art svg.thassilonian-rune');
    expect(rune).not.toBeNull();
    expect(rune).toHaveAttribute('data-rune', 'lust');
    expect(rune).toHaveClass('rune-tint');
    expect(container.querySelector('.icon-tile-code')).toBeNull();
    expect(container.querySelector('.icon-tile-rune')).toBeNull();
  });

  it('a rune-marked item with real art keeps the art and adds the rune medallion', () => {
    const { container } = render(
      <IconTile item={{ name: 'Flawless Hammer', image: 'img_h.jpg', thassilonianRune: 'pride' }} />
    );
    expect(container.querySelector('.icon-tile-img')).not.toBeNull();
    const coin = container.querySelector('.icon-tile-rune');
    expect(coin).not.toBeNull();
    expect(coin).toHaveAttribute('data-rune', 'pride');
    expect(coin).toHaveClass('rune-tint');
    expect(coin.querySelector('svg.thassilonian-rune')).not.toBeNull();
  });

  it('an unknown rune name falls back to the code placeholder', () => {
    const { container } = render(
      <IconTile item={{ name: 'Odd Trinket', thassilonianRune: 'avarice' }} />
    );
    expect(container.querySelector('.icon-tile-code')).not.toBeNull();
    expect(container.querySelector('.icon-tile-rune-art')).toBeNull();
  });
});
