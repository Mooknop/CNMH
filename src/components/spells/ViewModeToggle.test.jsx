import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ViewModeToggle from './ViewModeToggle';

describe('ViewModeToggle', () => {
  const noop = vi.fn();

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

  it('calls setViewMode when a button is clicked', () => {
    const setViewMode = vi.fn();
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

  it('calls setViewMode with spells when Repertoire is clicked', () => {
    const setViewMode = vi.fn();
    render(<ViewModeToggle viewMode="innate" setViewMode={setViewMode} hasSpellcasting />);
    fireEvent.click(screen.getByText('Repertoire'));
    expect(setViewMode).toHaveBeenCalledWith('spells');
  });

  it('calls setViewMode with innate when Innate is clicked', () => {
    const setViewMode = vi.fn();
    render(<ViewModeToggle viewMode="spells" setViewMode={setViewMode} hasInnate />);
    fireEvent.click(screen.getByText('Innate'));
    expect(setViewMode).toHaveBeenCalledWith('innate');
  });

  it('calls setViewMode with focus when Focus button is clicked', () => {
    const setViewMode = vi.fn();
    render(<ViewModeToggle viewMode="spells" setViewMode={setViewMode} hasFocus />);
    fireEvent.click(screen.getByText('Focus Spells'));
    expect(setViewMode).toHaveBeenCalledWith('focus');
  });

  it('calls setViewMode with eld when Eld Powers is clicked', () => {
    const setViewMode = vi.fn();
    render(<ViewModeToggle viewMode="spells" setViewMode={setViewMode} hasEldPowers />);
    fireEvent.click(screen.getByText('Eld Powers'));
    expect(setViewMode).toHaveBeenCalledWith('eld');
  });

  it('calls setViewMode with harrow when Harrowing is clicked', () => {
    const setViewMode = vi.fn();
    render(<ViewModeToggle viewMode="spells" setViewMode={setViewMode} hasHarrowing />);
    fireEvent.click(screen.getByText('Harrowing'));
    expect(setViewMode).toHaveBeenCalledWith('harrow');
  });

  it('calls setViewMode with staff when staff button is clicked', () => {
    const setViewMode = vi.fn();
    render(<ViewModeToggle viewMode="spells" setViewMode={setViewMode} hasStaff staff={{ name: 'Staff of Fire' }} />);
    fireEvent.click(screen.getByText('Staff of Fire'));
    expect(setViewMode).toHaveBeenCalledWith('staff');
  });

  it('calls setViewMode with wands when Wands is clicked', () => {
    const setViewMode = vi.fn();
    render(<ViewModeToggle viewMode="spells" setViewMode={setViewMode} hasWands />);
    fireEvent.click(screen.getByText('Wands'));
    expect(setViewMode).toHaveBeenCalledWith('wands');
  });

});
