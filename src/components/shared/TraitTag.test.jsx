import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TraitTag from './TraitTag';

const mockOpenTraitModal = vi.fn();

vi.mock('../../contexts/TraitContext', () => ({
  useTrait: () => ({ openTraitModal: mockOpenTraitModal }),
}));

describe('TraitTag', () => {
  beforeEach(() => {
    mockOpenTraitModal.mockClear();
  });

  it('renders the trait name', () => {
    render(<TraitTag trait="Fire" />);
    expect(screen.getByText('Fire')).toBeInTheDocument();
  });

  it('applies trait-tag and clickable classes', () => {
    const { container } = render(<TraitTag trait="Cold" />);
    const span = container.querySelector('span');
    expect(span).toHaveClass('trait-tag');
    expect(span).toHaveClass('clickable');
  });

  it('applies custom className', () => {
    const { container } = render(<TraitTag trait="Fire" className="custom-class" />);
    expect(container.querySelector('span')).toHaveClass('custom-class');
  });

  it('calls openTraitModal with trait name on click', () => {
    render(<TraitTag trait="Electric" />);
    fireEvent.click(screen.getByText('Electric'));
    expect(mockOpenTraitModal).toHaveBeenCalledWith('Electric');
  });

  it('has title attribute with trait info', () => {
    render(<TraitTag trait="Poison" />);
    const span = screen.getByText('Poison');
    expect(span.title).toContain('Poison');
  });
});
