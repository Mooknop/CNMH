import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ViewModeToggle from './ViewModeToggle';

describe('ViewModeToggle', () => {
  const noop = jest.fn();

  it('renders no buttons when all flags are false', () => {
    const { container } = render(
      <ViewModeToggle viewMode="spells" setViewMode={noop} />
    );
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders Repertoire button when hasSpellcasting is true', () => {
    render(<ViewModeToggle viewMode="spells" setViewMode={noop} hasSpellcasting />);
    expect(screen.getByText('Repertoire')).toBeInTheDocument();
  });

  it('renders Innate button when hasInnate is true', () => {
    render(<ViewModeToggle viewMode="spells" setViewMode={noop} hasInnate />);
    expect(screen.getByText('Innate')).toBeInTheDocument();
  });

  it('renders Focus Spells button with default label', () => {
    render(<ViewModeToggle viewMode="spells" setViewMode={noop} hasFocus />);
    expect(screen.getByText('Focus Spells')).toBeInTheDocument();
  });

  it('renders Focus Spells button with custom focusLabel', () => {
    render(<ViewModeToggle viewMode="focus" setViewMode={noop} hasFocus focusLabel="Ki Spells" />);
    expect(screen.getByText('Ki Spells')).toBeInTheDocument();
  });

  it('renders Eld Powers button when hasEldPowers is true', () => {
    render(<ViewModeToggle viewMode="spells" setViewMode={noop} hasEldPowers />);
    expect(screen.getByText('Eld Powers')).toBeInTheDocument();
  });

  it('renders Harrowing button when hasHarrowing is true', () => {
    render(<ViewModeToggle viewMode="spells" setViewMode={noop} hasHarrowing />);
    expect(screen.getByText('Harrowing')).toBeInTheDocument();
  });

  it('renders staff name when hasStaff is true', () => {
    render(
      <ViewModeToggle viewMode="spells" setViewMode={noop} hasStaff staff={{ name: 'Staff of Fire' }} />
    );
    expect(screen.getByText('Staff of Fire')).toBeInTheDocument();
  });

  it('renders Scrolls button when hasScrolls is true', () => {
    render(<ViewModeToggle viewMode="spells" setViewMode={noop} hasScrolls />);
    expect(screen.getByText('Scrolls')).toBeInTheDocument();
  });

  it('renders Wands button when hasWands is true', () => {
    render(<ViewModeToggle viewMode="spells" setViewMode={noop} hasWands />);
    expect(screen.getByText('Wands')).toBeInTheDocument();
  });

  it('renders Spell Gems button when hasGems is true', () => {
    render(<ViewModeToggle viewMode="spells" setViewMode={noop} hasGems />);
    expect(screen.getByText('Spell Gems')).toBeInTheDocument();
  });

  it('calls setViewMode when a button is clicked', () => {
    const setViewMode = jest.fn();
    render(<ViewModeToggle viewMode="spells" setViewMode={setViewMode} hasScrolls />);
    fireEvent.click(screen.getByText('Scrolls'));
    expect(setViewMode).toHaveBeenCalledWith('scrolls');
  });

  it('marks active button with active class', () => {
    render(<ViewModeToggle viewMode="innate" setViewMode={noop} hasSpellcasting hasInnate />);
    const innateBtn = screen.getByText('Innate');
    const reperBtn = screen.getByText('Repertoire');
    expect(innateBtn.className).toContain('active');
    expect(reperBtn.className).not.toContain('active');
  });
});
