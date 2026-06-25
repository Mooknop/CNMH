import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Modal from './Modal';

describe('Modal', () => {
  it('returns null when closed', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}} title="X">body</Modal>
    );
    expect(container.firstChild).toBeNull();
  });

  it('portals the overlay to document.body, not the render container', () => {
    const { container } = render(
      <Modal isOpen onClose={() => {}} title="Portaled">body</Modal>
    );
    // The overlay must escape the React render tree so it is never trapped by an
    // ancestor containing block (e.g. a GM card using backdrop-filter).
    expect(container.querySelector('.modal-overlay')).toBeNull();
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay.parentElement).toBe(document.body);
  });

  it('renders centered by default (no bottom variant classes)', () => {
    render(<Modal isOpen onClose={() => {}} title="Centered">body</Modal>);
    expect(document.querySelector('.modal-overlay')).toBeInTheDocument();
    expect(document.querySelector('.modal-overlay--bottom')).toBeNull();
    expect(document.querySelector('.modal-container--bottom')).toBeNull();
  });

  it('applies the bottom slide-up variant when placement="bottom" (#412)', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Sheet" placement="bottom">body</Modal>
    );
    expect(document.querySelector('.modal-overlay--bottom')).toBeInTheDocument();
    expect(document.querySelector('.modal-container--bottom')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sheet' })).toBeInTheDocument();
  });
});
