import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MoveGridPicker from './MoveGridPicker';

const baseProps = {
  origin: { col: 10, row: 10 },
  reachable: [
    { col: 11, row: 10, feet: 5, terrain: 'normal' },
    { col: 12, row: 10, feet: 10, terrain: 'difficult' },
  ],
  blocked: [{ col: 10, row: 9 }],
  maxFeet: 25,
};

describe('MoveGridPicker', () => {
  it('renders nothing without an origin', () => {
    const { container } = render(<MoveGridPicker origin={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders reachable squares as clickable buttons with their cost', () => {
    render(<MoveGridPicker {...baseProps} onSelect={jest.fn()} onCancel={jest.fn()} />);
    const normal = screen.getByLabelText(/Move to 11,10 — 5 ft/);
    const difficult = screen.getByLabelText(/Move to 12,10 \(difficult terrain\) — 10 ft/);
    expect(normal).toBeInTheDocument();
    expect(difficult).toBeInTheDocument();
    expect(normal.tagName).toBe('BUTTON');
  });

  it('calls onSelect with the chosen square', () => {
    const onSelect = jest.fn();
    render(<MoveGridPicker {...baseProps} onSelect={onSelect} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByLabelText(/Move to 11,10/));
    expect(onSelect).toHaveBeenCalledWith({ col: 11, row: 10 });
  });

  it('blocked and out-of-range cells are not clickable', () => {
    const onSelect = jest.fn();
    render(<MoveGridPicker {...baseProps} onSelect={onSelect} onCancel={jest.fn()} />);
    // Only the two reachable squares are buttons (plus the Cancel button).
    const buttons = screen.getAllByRole('button');
    // 2 reachable + 1 cancel
    expect(buttons).toHaveLength(3);
  });

  it('Cancel triggers onCancel', () => {
    const onCancel = jest.fn();
    render(<MoveGridPicker {...baseProps} onSelect={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('classifies blocked squares by kind (wall / ally / enemy)', () => {
    const props = {
      origin: { col: 10, row: 10 },
      reachable: [],
      blocked: [
        { col: 10, row: 9, kind: 'wall' },
        { col: 11, row: 9, kind: 'ally' },
        { col: 9, row: 9, kind: 'enemy' },
      ],
      maxFeet: 25,
    };
    const { container } = render(
      <MoveGridPicker {...props} onSelect={jest.fn()} onCancel={jest.fn()} />
    );
    expect(container.querySelector('.mgp-cell--blocked-wall')).toBeInTheDocument();
    expect(container.querySelector('.mgp-cell--blocked-ally')).toBeInTheDocument();
    expect(container.querySelector('.mgp-cell--blocked-enemy')).toBeInTheDocument();
    expect(screen.getByLabelText('Blocked by Ally')).toBeInTheDocument();
    expect(screen.getByLabelText('Blocked by Enemy')).toBeInTheDocument();
  });

  it('defaults blocked squares without a kind to wall (back-compat)', () => {
    const { container } = render(
      <MoveGridPicker {...baseProps} onSelect={jest.fn()} onCancel={jest.fn()} />
    );
    expect(container.querySelector('.mgp-cell--blocked-wall')).toBeInTheDocument();
  });

  it('renders an obstacle legend', () => {
    render(<MoveGridPicker {...baseProps} onSelect={jest.fn()} onCancel={jest.fn()} />);
    const legend = screen.getByLabelText('Obstacle legend');
    expect(legend).toBeInTheDocument();
  });

  it('grid radius derives from maxFeet (25ft → 11×11)', () => {
    const { container } = render(
      <MoveGridPicker {...baseProps} maxFeet={25} onSelect={jest.fn()} onCancel={jest.fn()} />
    );
    // 11 columns × 11 rows = 121 cells
    const cells = container.querySelectorAll('.mgp-cell');
    expect(cells).toHaveLength(121);
  });
});
