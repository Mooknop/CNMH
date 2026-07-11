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

  it('a property-runed weapon shows catalog-rune medallions bottom-right (#1369)', () => {
    const item = {
      name: 'Longsword',
      runes: { potency: 2, property: [{ id: 'flaming', name: 'Flaming' }, { id: 'frost', name: 'Frost' }] },
    };
    const { container } = render(<IconTile item={item} />);
    // Two property coins + the +2 potency fundamental folded into the chip.
    const coins = container.querySelectorAll('.icon-tile-runeicon');
    expect(coins).toHaveLength(3);
    expect(coins[0]).toHaveAttribute('data-runeicon', 'flaming');
    expect(coins[0]).toHaveClass('runeicon-tint');
    expect(coins[0].querySelector('svg.rune-icon')).not.toBeNull();
    expect(container.querySelector('.icon-tile-runeicon-more')).toHaveAttribute(
      'title',
      '+2 Weapon Potency'
    );
  });

  it('folds runes past the two-coin cap into a +n chip', () => {
    const item = {
      name: 'Longsword',
      runes: {
        potency: 3,
        property: [
          { id: 'flaming', name: 'Flaming' },
          { id: 'frost', name: 'Frost' },
          { id: 'shock', name: 'Shock' },
        ],
      },
    };
    const { container } = render(<IconTile item={item} />);
    expect(container.querySelectorAll('.icon-tile-runeicon')).toHaveLength(3);
    const more = container.querySelector('.icon-tile-runeicon-more');
    // Shock + the +3 potency fundamental fold into the chip — property runes
    // outrank fundamentals for the two visible coins.
    expect(more).toHaveTextContent('+2');
    expect(more).toHaveAttribute('title', 'Shock, +3 Weapon Potency');
  });

  it('an undrawn rune family still renders, as the untinted generic mark', () => {
    const item = { name: 'Longsword', runes: { potency: 1, property: [{ id: 'snagging', name: 'Snagging' }] } };
    const { container } = render(<IconTile item={item} />);
    const coin = container.querySelector('.icon-tile-runeicon');
    expect(coin).toHaveAttribute('data-runeicon', 'generic');
  });

  it('an imageless runestone shows its held rune as the art, no medallion', () => {
    const item = {
      name: 'Flaming Runestone',
      runestone: { runeRef: 'flaming', rune: { id: 'flaming', name: 'Flaming' } },
    };
    const { container } = render(<IconTile item={item} />);
    const art = container.querySelector('.icon-tile-rune-art svg.rune-icon');
    expect(art).not.toBeNull();
    expect(art).toHaveAttribute('data-runeicon', 'flaming');
    expect(container.querySelector('.icon-tile-code')).toBeNull();
    expect(container.querySelector('.icon-tile-runeicon')).toBeNull();
  });

  it('a runestone with real art keeps the art and wears its rune as a medallion', () => {
    const item = {
      name: 'Flaming Runestone',
      image: 'img_r.jpg',
      runestone: { runeRef: 'flaming', rune: { id: 'flaming', name: 'Flaming' } },
    };
    const { container } = render(<IconTile item={item} />);
    expect(container.querySelector('.icon-tile-img')).not.toBeNull();
    expect(container.querySelector('.icon-tile-runeicon')).toHaveAttribute('data-runeicon', 'flaming');
  });

  it('a reinforced shield wears its reinforcing tier as the lead medallion (#1372)', () => {
    const item = {
      name: 'Steel Shield',
      shield: { bonus: 2 },
      runes: { reinforcing: 'minor', property: [{ id: 'flaming', name: 'Flaming' }] },
    };
    const { container } = render(<IconTile item={item} />);
    const coins = container.querySelectorAll('.icon-tile-runeicon');
    expect(coins).toHaveLength(2);
    // Reinforcing leads the stack with its own drawn mark (fundamental glyph
    // wave); the flaming coin follows.
    expect(coins[0]).toHaveAttribute('data-runeicon', 'reinforcing');
    expect(coins[1]).toHaveAttribute('data-runeicon', 'flaming');
  });

  it('an accessory-runed host wears its rune as a medallion', () => {
    const item = {
      name: 'Cloak',
      runes: { accessory: { id: 'presentable', name: 'Presentable' } },
    };
    const { container } = render(<IconTile item={item} />);
    expect(container.querySelector('.icon-tile-runeicon')).not.toBeNull();
  });

  it('sin rune keeps its corner when catalog medallions are present', () => {
    const item = {
      name: 'Flawless Hammer',
      image: 'img_h.jpg',
      thassilonianRune: 'pride',
      runes: { potency: 1, property: [{ id: 'flaming', name: 'Flaming' }] },
    };
    const { container } = render(<IconTile item={item} />);
    expect(container.querySelector('.icon-tile-rune')).toHaveAttribute('data-rune', 'pride');
    expect(container.querySelector('.icon-tile-runeicon')).toHaveAttribute('data-runeicon', 'flaming');
  });

  it('flags broken gear with the warning badge (#539/#542)', () => {
    const { container } = render(
      <IconTile item={{ name: 'Longsword', durabilityState: 'broken' }} />
    );
    const badge = container.querySelector('.icon-tile-broken');
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('title', 'Broken');
    expect(badge).not.toHaveClass('is-destroyed');
  });

  it('flags destroyed gear with the skull badge', () => {
    const { container } = render(
      <IconTile item={{ name: 'Longsword', durabilityState: 'destroyed' }} />
    );
    const badge = container.querySelector('.icon-tile-broken');
    expect(badge).toHaveClass('is-destroyed');
    expect(badge).toHaveAttribute('title', 'Destroyed');
  });

  it('renders no durability badge on intact gear', () => {
    const { container } = render(<IconTile item={{ name: 'Longsword' }} />);
    expect(container.querySelector('.icon-tile-broken')).toBeNull();
  });
});
