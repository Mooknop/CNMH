import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DirectionRosette, { ROSETTE_DIRECTIONS } from './DirectionRosette';

describe('DirectionRosette (#1751 OQ-2)', () => {
  it('renders all 8 compass points as buttons', () => {
    render(<DirectionRosette onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(ROSETTE_DIRECTIONS.length);
    ROSETTE_DIRECTIONS.forEach((dir) => {
      expect(screen.getByRole('button', { name: dir.name })).toBeInTheDocument();
    });
  });

  it('calls onChange with the picked direction name', () => {
    const onChange = vi.fn();
    render(<DirectionRosette onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'northeast' }));
    expect(onChange).toHaveBeenCalledWith('northeast');
  });

  it('marks the selected direction as pressed', () => {
    render(<DirectionRosette value="south" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'south' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'north' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is inert without an onChange handler', () => {
    render(<DirectionRosette />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'east' }))).not.toThrow();
  });

  it('uses a custom group label when given', () => {
    render(<DirectionRosette onChange={vi.fn()} label="Cone facing" />);
    expect(screen.getByRole('group', { name: 'Cone facing' })).toBeInTheDocument();
  });
});
