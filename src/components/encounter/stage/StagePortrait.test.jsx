import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { APP } from '../../../sync/keys';
import StagePortrait from './StagePortrait';

describe('StagePortrait', () => {
  it('renders the art with an accessible alt and authored crop', () => {
    render(
      <StagePortrait src="/api/images/k.png" name="Kestrel" imagePosition={{ x: 40, y: 10 }} />
    );
    const img = screen.getByRole('img', { name: 'Portrait of Kestrel' });
    expect(img).toHaveAttribute('src', '/api/images/k.png');
    expect(img.style.getPropertyValue('--portrait-pos')).toBe('40% 10%');
  });

  it('falls back to a monogram when there is no art', () => {
    render(<StagePortrait name="Ogre Warrior" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('O')).toBeInTheDocument();
  });

  it('applies the caller size class to the box', () => {
    const { container } = render(<StagePortrait name="X" className="stage-banner-portrait" />);
    expect(container.querySelector('.stage-portrait.stage-banner-portrait')).toBeInTheDocument();
  });

  it('blooms when a fresh fx event matches its charId (#1346)', () => {
    window.localStorage.clear();
    const { session, container } = renderWithProviders(
      <>
        <StagePortrait name="Izzy" charId="izzy" />
        <StagePortrait name="Ogre" />
      </>
    );
    act(() =>
      session.push('global', APP.FX, [
        { id: 'fx-1', kind: 'ability', charId: 'izzy', ts: Date.now() },
      ])
    );
    const boxes = container.querySelectorAll('.stage-portrait');
    expect(boxes[0]).toHaveAttribute('data-fx', 'bloom');
    expect(boxes[1]).not.toHaveAttribute('data-fx');
  });

  it('renders the signature flourish overlay when the event carries one (#1347)', () => {
    window.localStorage.clear();
    const { session, container } = renderWithProviders(
      <StagePortrait name="Izzy" charId="izzy" />
    );
    act(() =>
      session.push('global', APP.FX, [
        { id: 'fx-1', kind: 'ability', charId: 'izzy', ts: Date.now(), flourish: 'composition-burst' },
      ])
    );
    expect(container.querySelector('[data-flourish="composition-burst"]')).toBeInTheDocument();
    // Unknown hint → no overlay, plain bloom only.
    act(() =>
      session.push('global', APP.FX, [
        { id: 'fx-1', kind: 'ability', charId: 'izzy', ts: Date.now(), flourish: 'composition-burst' },
        { id: 'fx-2', kind: 'ability', charId: 'izzy', ts: Date.now(), flourish: 'from-the-future' },
      ])
    );
    expect(container.querySelector('.fx-flourish')).toBeNull();
    expect(container.querySelector('.stage-portrait')).toHaveAttribute('data-fx', 'bloom');
  });
});
