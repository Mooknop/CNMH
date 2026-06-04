import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionRow from './ActionRow';

describe('ActionRow', () => {
  it('renders the name', () => {
    render(<ActionRow name="Strike" />);
    expect(screen.getByText('Strike')).toBeInTheDocument();
  });

  it('renders the chevron', () => {
    render(<ActionRow name="Strike" />);
    expect(screen.getByText('›')).toBeInTheDocument();
  });

  it('renders a glyph chip when glyph is provided', () => {
    render(<ActionRow name="Strike" glyph="◆" />);
    expect(screen.getByText('◆')).toBeInTheDocument();
  });

  it('does not render a glyph chip when glyph is omitted', () => {
    const { container } = render(<ActionRow name="Strike" />);
    expect(container.querySelector('.action-row__glyph')).not.toBeInTheDocument();
  });

  it('applies gold class to glyph when glyphColor is gold', () => {
    const { container } = render(<ActionRow name="Strike" glyph="↺" glyphColor="gold" />);
    expect(container.querySelector('.action-row__glyph--gold')).toBeInTheDocument();
  });

  it('does not apply gold class when glyphColor is not gold', () => {
    const { container } = render(<ActionRow name="Strike" glyph="◆" />);
    expect(container.querySelector('.action-row__glyph--gold')).not.toBeInTheDocument();
  });

  it('renders a right-label chip when rightLabel is provided', () => {
    render(<ActionRow name="Strike" rightLabel="attack" />);
    expect(screen.getByText('attack')).toBeInTheDocument();
  });

  it('does not render a right-label chip when rightLabel is omitted', () => {
    const { container } = render(<ActionRow name="Strike" />);
    expect(container.querySelector('.action-row__chip')).not.toBeInTheDocument();
  });

  it('applies active class when active is true', () => {
    const { container } = render(<ActionRow name="Strike" active />);
    expect(container.querySelector('.action-row--active')).toBeInTheDocument();
  });

  it('does not apply active class when active is false (default)', () => {
    const { container } = render(<ActionRow name="Strike" />);
    expect(container.querySelector('.action-row--active')).not.toBeInTheDocument();
  });

  it('applies inactive class when inactive is true', () => {
    const { container } = render(<ActionRow name="Strike" inactive />);
    expect(container.querySelector('.action-row--inactive')).toBeInTheDocument();
  });

  it('does not apply inactive class when inactive is false (default)', () => {
    const { container } = render(<ActionRow name="Strike" />);
    expect(container.querySelector('.action-row--inactive')).not.toBeInTheDocument();
  });

  it('forwards extra className', () => {
    const { container } = render(<ActionRow name="Strike" className="custom-class" />);
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });

  it('calls onClick when button is clicked', () => {
    const onClick = jest.fn();
    render(<ActionRow name="Strike" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a button element', () => {
    render(<ActionRow name="Strike" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
