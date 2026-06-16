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
