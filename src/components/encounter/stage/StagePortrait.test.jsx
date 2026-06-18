import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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
});
