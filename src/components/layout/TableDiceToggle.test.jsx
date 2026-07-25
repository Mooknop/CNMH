import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import TableDiceToggle from './TableDiceToggle';

describe('TableDiceToggle (#1575 D3)', () => {
  beforeEach(() => window.localStorage.clear());

  it('toggles the device pref and reflects pressed state', () => {
    render(<TableDiceToggle />);
    const btn = screen.getByRole('button', { name: 'Physical dice mode' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).not.toHaveTextContent('table');

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveTextContent('table');
    expect(window.localStorage.getItem('cnmh-devicepref-tabledice')).toBe('true');

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });
});
