import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MoveGridPicker from './MoveGridPicker';

// Shaped like the bridge's cnmh_moveopts payload (movement.js): it carries
// `speed` + `originOccupied`, never maxFeet — that's a component-only prop
// (default 25) exercised explicitly in the radius tests below.
const baseProps = {
  origin: { col: 10, row: 10 },
  reachable: [
    { col: 11, row: 10, feet: 5, terrain: 'normal' },
    { col: 12, row: 10, feet: 10, terrain: 'difficult' },
  ],
  blocked: [{ col: 10, row: 9 }],
  speed: 25,
  originOccupied: false,
};

describe('MoveGridPicker', () => {
  it('renders nothing without an origin', () => {
    const { container } = render(<MoveGridPicker origin={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders reachable squares as clickable buttons with their cost', () => {
    render(<MoveGridPicker {...baseProps} onSelect={vi.fn()} onCancel={vi.fn()} />);
    const normal = screen.getByLabelText(/Move to 11,10 — 5 ft/);
    const difficult = screen.getByLabelText(/Move to 12,10 \(difficult terrain\) — 10 ft/);
    expect(normal).toBeInTheDocument();
    expect(difficult).toBeInTheDocument();
    expect(normal.tagName).toBe('BUTTON');
  });

  it('calls onSelect with the chosen square', () => {
    const onSelect = vi.fn();
    render(<MoveGridPicker {...baseProps} onSelect={onSelect} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Move to 11,10/));
    expect(onSelect).toHaveBeenCalledWith({ col: 11, row: 10 });
  });

  it('blocked and out-of-range cells are not clickable', () => {
    const onSelect = vi.fn();
    render(<MoveGridPicker {...baseProps} onSelect={onSelect} onCancel={vi.fn()} />);
    // Only the two reachable squares are buttons (plus the Cancel button).
    const buttons = screen.getAllByRole('button');
    // 2 reachable + 1 cancel
    expect(buttons).toHaveLength(3);
  });

  it('Cancel triggers onCancel', () => {
    const onCancel = vi.fn();
    render(<MoveGridPicker {...baseProps} onSelect={vi.fn()} onCancel={onCancel} />);
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
      speed: 25,
      originOccupied: false,
    };
    const { container } = render(
      <MoveGridPicker {...props} onSelect={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.querySelector('.mgp-cell--blocked-wall')).toBeInTheDocument();
    expect(container.querySelector('.mgp-cell--blocked-ally')).toBeInTheDocument();
    expect(container.querySelector('.mgp-cell--blocked-enemy')).toBeInTheDocument();
    expect(screen.getByLabelText('Blocked by Ally')).toBeInTheDocument();
    expect(screen.getByLabelText('Blocked by Enemy')).toBeInTheDocument();
  });

  it('defaults blocked squares without a kind to wall (back-compat)', () => {
    const { container } = render(
      <MoveGridPicker {...baseProps} onSelect={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.querySelector('.mgp-cell--blocked-wall')).toBeInTheDocument();
  });

  it('renders an obstacle legend', () => {
    render(<MoveGridPicker {...baseProps} onSelect={vi.fn()} onCancel={vi.fn()} />);
    const legend = screen.getByLabelText('Obstacle legend');
    expect(legend).toBeInTheDocument();
  });

  it('trims grid to reachable extent + 1 wall layer', () => {
    // baseProps: reachable extends to col 12 (offset +2 from origin col 10).
    // extent=2, radius=min(5, 2+1)=3, span=7 → 7×7 = 49 cells.
    const { container } = render(
      <MoveGridPicker {...baseProps} maxFeet={25} onSelect={vi.fn()} onCancel={vi.fn()} />
    );
    const cells = container.querySelectorAll('.mgp-cell');
    expect(cells).toHaveLength(49);
  });

  it('uses full theoretical radius in open terrain (reachable fills the range)', () => {
    // Build a set of reachable squares that fills a 5-square radius (maxFeet=25).
    // The farthest square is at offset 5 → extent=5, radius=min(5, 5+1)=5, span=11 → 11×11.
    const reachable = [];
    for (let dc = -5; dc <= 5; dc++) {
      for (let dr = -5; dr <= 5; dr++) {
        if (dc === 0 && dr === 0) continue;
        reachable.push({ col: 10 + dc, row: 10 + dr, feet: Math.max(Math.abs(dc), Math.abs(dr)) * 5, terrain: 'normal' });
      }
    }
    const { container } = render(
      <MoveGridPicker
        origin={{ col: 10, row: 10 }}
        reachable={reachable}
        blocked={[]}
        maxFeet={25}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const cells = container.querySelectorAll('.mgp-cell');
    expect(cells).toHaveLength(121); // 11×11 — no trimming in open terrain
  });

  describe('step-pad mode', () => {
    const stepProps = {
      origin: { col: 5, row: 5 },
      reachable: [
        { col: 5, row: 4, feet: 5, terrain: 'normal' }, // N
        { col: 6, row: 5, feet: 5, terrain: 'normal' }, // E
        { col: 4, row: 6, feet: 5, terrain: 'normal' }, // SW
      ],
      blocked: [{ col: 6, row: 4, kind: 'wall' }], // NE
      stepMode: true,
      radius: 1,
    };

    it('radius={1} forces a 3×3 grid regardless of maxFeet', () => {
      const { container } = render(
        <MoveGridPicker {...stepProps} maxFeet={60} onSelect={vi.fn()} onCancel={vi.fn()} />
      );
      expect(container.querySelectorAll('.mgp-cell')).toHaveLength(9);
      expect(container.querySelector('.mgp--step')).toBeInTheDocument();
    });

    it('renders direction arrow glyphs and labels instead of feet', () => {
      render(<MoveGridPicker {...stepProps} onSelect={vi.fn()} onCancel={vi.fn()} />);
      const north = screen.getByLabelText('Step north');
      expect(north).toHaveTextContent('↑');
      expect(screen.getByLabelText('Step east')).toHaveTextContent('→');
      expect(screen.getByLabelText('Step southwest')).toHaveTextContent('↙');
    });

    it('still colors blocked cells by kind in step mode', () => {
      const { container } = render(
        <MoveGridPicker {...stepProps} onSelect={vi.fn()} onCancel={vi.fn()} />
      );
      expect(container.querySelector('.mgp-cell--blocked-wall')).toBeInTheDocument();
    });

    it('onSelect fires with the stepped cell', () => {
      const onSelect = vi.fn();
      render(<MoveGridPicker {...stepProps} onSelect={onSelect} onCancel={vi.fn()} />);
      fireEvent.click(screen.getByLabelText('Step east'));
      expect(onSelect).toHaveBeenCalledWith({ col: 6, row: 5 });
    });
  });

  it('cancelLabel customizes the dismiss button text', () => {
    render(
      <MoveGridPicker {...baseProps} cancelLabel="Done" onSelect={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  describe('pass-through cells (#456)', () => {
    const props = {
      origin: { col: 10, row: 10 },
      reachable: [
        { col: 11, row: 10, feet: 5, terrain: 'normal', passThrough: true },
      ],
      blocked: [],
      speed: 25,
      originOccupied: false,
    };

    it("renders an ally's square as a clickable pass-through button", () => {
      const onSelect = vi.fn();
      const { container } = render(
        <MoveGridPicker {...props} onSelect={onSelect} onCancel={vi.fn()} />
      );
      const cell = screen.getByLabelText(/Move to 11,10 \(through ally\) — 5 ft/);
      expect(cell.tagName).toBe('BUTTON');
      expect(container.querySelector('.mgp-cell--passthrough')).toBeInTheDocument();
      fireEvent.click(cell);
      expect(onSelect).toHaveBeenCalledWith({ col: 11, row: 10 });
    });

    it('notes both pass-through and difficult terrain in the label', () => {
      render(
        <MoveGridPicker
          {...props}
          reachable={[{ col: 11, row: 10, feet: 10, terrain: 'difficult', passThrough: true }]}
          onSelect={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      expect(
        screen.getByLabelText(/Move to 11,10 \(through ally\) \(difficult terrain\) — 10 ft/)
      ).toBeInTheDocument();
    });

    it('disables the dismiss button and shows a hint when cancelDisabled', () => {
      const onCancel = vi.fn();
      render(
        <MoveGridPicker
          {...props}
          cancelLabel="Done"
          cancelDisabled
          cancelHint="Step off your ally's square to stop."
          onSelect={vi.fn()}
          onCancel={onCancel}
        />
      );
      const done = screen.getByText('Done');
      expect(done).toBeDisabled();
      fireEvent.click(done);
      expect(onCancel).not.toHaveBeenCalled();
      expect(screen.getByText("Step off your ally's square to stop.")).toBeInTheDocument();
    });
  });
});
