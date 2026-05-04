import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TraitModal from './TraitModal';

const mockTrait = { name: 'Fire', description: 'Deals fire damage.' };

describe('TraitModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <TraitModal isOpen={false} onClose={() => {}} trait={mockTrait} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when trait is null', () => {
    const { container } = render(
      <TraitModal isOpen={true} onClose={() => {}} trait={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders trait name and description when open', () => {
    render(<TraitModal isOpen={true} onClose={() => {}} trait={mockTrait} />);
    expect(screen.getByText('Fire')).toBeInTheDocument();
    expect(screen.getByText('Deals fire damage.')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<TraitModal isOpen={true} onClose={onClose} trait={mockTrait} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <TraitModal isOpen={true} onClose={onClose} trait={mockTrait} />
    );
    fireEvent.click(container.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not propagate click from inner modal content', () => {
    const onClose = jest.fn();
    const { container } = render(
      <TraitModal isOpen={true} onClose={onClose} trait={mockTrait} />
    );
    fireEvent.click(container.querySelector('.modal-container'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies themeColor to header', () => {
    const { container } = render(
      <TraitModal isOpen={true} onClose={() => {}} trait={mockTrait} themeColor="#ff0000" />
    );
    const header = container.querySelector('.modal-header');
    expect(header.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });
});
