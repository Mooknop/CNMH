import React from 'react';
import { render, screen } from '@testing-library/react';
import BulkBar from './BulkBar';

describe('BulkBar', () => {
  it('renders the used / limit readout with no flag when under the threshold', () => {
    render(<BulkBar bulkUsed={3} encumberedThreshold={6} bulkLimit={8} />);
    const bar = screen.getByTestId('inventory-bulkbar');
    expect(bar).toHaveTextContent('3/8');
    expect(bar.className).not.toMatch(/is-encumbered|is-over/);
    expect(screen.queryByText('Encumbered')).not.toBeInTheDocument();
  });

  it('flags and styles the encumbered band (above threshold, at/under limit)', () => {
    render(<BulkBar bulkUsed={7} encumberedThreshold={6} bulkLimit={8} />);
    const bar = screen.getByTestId('inventory-bulkbar');
    expect(bar).toHaveClass('is-encumbered');
    expect(bar).not.toHaveClass('is-over');
    expect(screen.getByText('Encumbered')).toBeInTheDocument();
  });

  it('styles the over-limit state distinctly', () => {
    render(<BulkBar bulkUsed={9} encumberedThreshold={6} bulkLimit={8} />);
    const bar = screen.getByTestId('inventory-bulkbar');
    expect(bar).toHaveClass('is-over');
    expect(bar).not.toHaveClass('is-encumbered');
  });

  it('bridges fill width and threshold tick through CSS custom properties', () => {
    const { container } = render(
      <BulkBar bulkUsed={4} encumberedThreshold={6} bulkLimit={8} />
    );
    const fill = container.querySelector('.bulkbar-fill');
    const track = container.querySelector('.bulkbar-track');
    // 4 / 8 = 50% fill; threshold 6 / 8 = 75% tick.
    expect(fill).toHaveStyle({ '--bulk-fill-w': '50%' });
    expect(track).toHaveStyle({ '--bulk-tick-x': '75%' });
  });

  it('clamps the fill width to 100% when over the limit', () => {
    const { container } = render(
      <BulkBar bulkUsed={20} encumberedThreshold={6} bulkLimit={8} />
    );
    expect(container.querySelector('.bulkbar-fill')).toHaveStyle({
      '--bulk-fill-w': '100%',
    });
  });
});
