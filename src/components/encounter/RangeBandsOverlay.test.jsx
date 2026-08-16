import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RangeBandsOverlay from './RangeBandsOverlay';
import { buildRangeBands } from '../../utils/rangeBands';

const SNAPSHOT = {
  capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000 },
  worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
  gridSize: 100,
};

const ORIGIN = { x: 500, y: 500 };

describe('RangeBandsOverlay (#1749 S5)', () => {
  it('renders nothing without a snapshot, an origin, or any bands', () => {
    const bands = buildRangeBands({ incrementFt: 30 });
    expect(render(<RangeBandsOverlay snapshot={null} originWorld={ORIGIN} bands={bands} />)
      .container.querySelector('svg')).toBeNull();
    expect(render(<RangeBandsOverlay snapshot={SNAPSHOT} originWorld={null} bands={bands} />)
      .container.querySelector('svg')).toBeNull();
    expect(render(<RangeBandsOverlay snapshot={SNAPSHOT} originWorld={ORIGIN} bands={[]} />)
      .container.querySelector('svg')).toBeNull();
  });

  it('draws one ring per range increment, toned by penalty', () => {
    const { container } = render(
      <RangeBandsOverlay snapshot={SNAPSHOT} originWorld={ORIGIN} bands={buildRangeBands({ incrementFt: 30 })} />
    );
    expect(container.querySelectorAll('.rbo-ring')).toHaveLength(4);
    expect(container.querySelectorAll('.rbo-band--clear')).toHaveLength(1);
    expect(container.querySelectorAll('.rbo-band--penalty')).toHaveLength(2);
    expect(container.querySelectorAll('.rbo-band--max')).toHaveLength(1);
  });

  it('labels the bands with the penalties the roll sheet would report', () => {
    const { container } = render(
      <RangeBandsOverlay snapshot={SNAPSHOT} originWorld={ORIGIN} bands={buildRangeBands({ incrementFt: 30 })} />
    );
    const labels = Array.from(container.querySelectorAll('.rbo-label')).map((n) => n.textContent);
    expect(labels).toContain('30 ft');
    expect(labels).toContain('60 ft · -2');
    expect(labels).toContain('120 ft · -6 · max');
  });

  it('draws the reach ring for a melee ability and labels it a hint', () => {
    const { container } = render(
      <RangeBandsOverlay snapshot={SNAPSHOT} originWorld={ORIGIN} bands={buildRangeBands({ reachFt: 10 })} />
    );
    expect(container.querySelectorAll('.rbo-ring')).toHaveLength(1);
    expect(container.querySelector('.rbo-band--reach')).not.toBeNull();
    expect(container.querySelector('.rbo-label').textContent).toContain('hint');
  });

  it('paints outermost first, so the tighter bands sit on top', () => {
    const { container } = render(
      <RangeBandsOverlay snapshot={SNAPSHOT} originWorld={ORIGIN} bands={buildRangeBands({ incrementFt: 30 })} />
    );
    const tones = Array.from(container.querySelectorAll('.rbo-band'))
      .map((g) => g.getAttribute('class').split(' ').find((c) => c.startsWith('rbo-band--')));
    expect(tones).toEqual(['rbo-band--max', 'rbo-band--penalty', 'rbo-band--penalty', 'rbo-band--clear']);
  });
});
