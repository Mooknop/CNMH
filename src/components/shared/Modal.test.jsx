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

// #1319: shared keyboard/focus behavior — every consumer inherits these.
describe('Modal accessibility', () => {
  const { fireEvent } = require('@testing-library/react');

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Esc">body</Modal>);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses the dialog on open and restores the opener on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<Modal isOpen onClose={() => {}} title="Focus">body</Modal>);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    rerender(<Modal isOpen={false} onClose={() => {}} title="Focus">body</Modal>);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('wraps Tab from the last focusable element back to the first', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Trap">
        <button>first</button>
        <button>last</button>
      </Modal>
    );
    // The header close button is the first focusable; "last" is the last.
    screen.getByRole('button', { name: 'last' }).focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('wraps Shift+Tab from the dialog itself to the last focusable element', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Trap">
        <button>only</button>
      </Modal>
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'only' }));
  });

  it('exposes dialog semantics', () => {
    render(<Modal isOpen onClose={() => {}} title="Named">body</Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Named' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
