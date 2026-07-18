import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GmTheme from './GmTheme';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveTheme: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { saveTheme } from '../../utils/gmApi';

const DEFAULT_PALETTE = {
  accent: '#c0440e',
  accentMid: '#e85d1a',
  gold: '#c49a2e',
  arcane: '#7a54ba',
  verdant: '#3d9458',
  peril: '#ef5350',
  bg: '#12100e',
  surface: '#1a1612',
  surfaceCard: 'rgba(28, 24, 18, 0.82)',
  text: '#f5ede4',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textTertiary: 'rgba(255, 255, 255, 0.45)',
  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',
};

const BASE_THEME = {
  id: 'campaign',
  preset: 'ember',
  palette: DEFAULT_PALETTE,
  accentOverrides: {},
};

const CHARACTERS = [
  { id: 'pellias', name: 'Pellias' },
  { id: 'izzy', name: 'Izzy' },
];

beforeEach(() => {
  useContent.mockReturnValue({ theme: BASE_THEME, characters: CHARACTERS });
  saveTheme.mockResolvedValue({ ok: true });
});

afterEach(() => vi.clearAllMocks());

describe('GmTheme', () => {
  it('renders the page title and preset buttons', () => {
    render(<GmTheme />);
    expect(screen.getByText('Campaign Theme')).toBeInTheDocument();
    expect(screen.getByText('Ember')).toBeInTheDocument();
    // "Deuteranopia" appears in both the preset list and the sim toolbar
    expect(screen.getAllByText('Deuteranopia').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Protanopia').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Tritanopia').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('High contrast')).toBeInTheDocument();
  });

  it('renders all colour slot labels', () => {
    render(<GmTheme />);
    expect(screen.getByText('Accent / HP')).toBeInTheDocument();
    expect(screen.getByText('Gold / legendary')).toBeInTheDocument();
    expect(screen.getByText('Arcane / magic')).toBeInTheDocument();
    expect(screen.getByText('Verdant / healing')).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
    expect(screen.getByText('Secondary text')).toBeInTheDocument();
  });

  it('renders contrast ratios for each slot', () => {
    render(<GmTheme />);
    // Each slot shows a ratio like "X.X:1"
    const ratios = screen.getAllByText(/:1/);
    expect(ratios.length).toBeGreaterThan(0);
  });

  it('renders the colorblind simulation buttons', () => {
    render(<GmTheme />);
    expect(screen.getByText('Normal')).toBeInTheDocument();
    // These labels appear in both preset list and sim toolbar
    expect(screen.getAllByText('Deuteranopia').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Protanopia').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Tritanopia').length).toBeGreaterThanOrEqual(2);
  });

  it('renders per-character override inputs', () => {
    render(<GmTheme />);
    expect(screen.getByText('Per-character accent overrides')).toBeInTheDocument();
    // Names now render in the accent-override rows AND the dice-set rows (#1490 S7).
    expect(screen.getAllByText('Pellias').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Izzy').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Accent color for Pellias')).toBeInTheDocument();
  });

  it('does not render overrides section when characters list is empty', () => {
    useContent.mockReturnValue({ theme: BASE_THEME, characters: [] });
    render(<GmTheme />);
    expect(screen.queryByText('Per-character accent overrides')).not.toBeInTheDocument();
  });

  it('applies a preset when its button is clicked', () => {
    render(<GmTheme />);
    const deutBtn = screen.getAllByText('Deuteranopia')[0];
    fireEvent.click(deutBtn);
    // After clicking Deuteranopia, the preset name appears as active
    expect(deutBtn.closest('button')).toHaveClass('active');
  });

  it('shows Save & sync and Reset buttons', () => {
    render(<GmTheme />);
    expect(screen.getByText('Save & sync')).toBeInTheDocument();
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });

  it('calls saveTheme and shows success message on save', async () => {
    render(<GmTheme />);
    fireEvent.click(screen.getByText('Save & sync'));
    await waitFor(() =>
      expect(screen.getByText(/synced to all players/i)).toBeInTheDocument()
    );
    expect(saveTheme).toHaveBeenCalledWith(expect.objectContaining({ id: 'campaign' }));
  });

  it('shows an error message when saveTheme rejects', async () => {
    saveTheme.mockRejectedValue(new Error('Network failure'));
    render(<GmTheme />);
    fireEvent.click(screen.getByText('Save & sync'));
    await waitFor(() =>
      expect(screen.getByText(/Failed: Network failure/)).toBeInTheDocument()
    );
  });

  it('resets draft to theme on Reset click', () => {
    render(<GmTheme />);
    // Click a preset to modify draft
    const deutBtn = screen.getAllByText('Deuteranopia')[0];
    fireEvent.click(deutBtn);
    expect(deutBtn.closest('button')).toHaveClass('active');
    // Reset
    fireEvent.click(screen.getByText('Reset'));
    // Ember preset should be active again
    const emberBtn = screen.getByText('Ember').closest('button');
    expect(emberBtn).toHaveClass('active');
  });

  it('switches colorblind simulation mode on cb-btn click', () => {
    render(<GmTheme />);
    // The sim toolbar has cb-btn class; the Normal button is unique
    const normalBtn = screen.getByText('Normal').closest('button');
    expect(normalBtn).toHaveClass('active');
    // Click one of the Deuteranopia buttons that is a cb-btn (in the toolbar)
    const allDeut = screen.getAllByText('Deuteranopia');
    const deutSimBtn = allDeut.find((el) => el.closest('button.cb-btn'));
    fireEvent.click(deutSimBtn);
    expect(deutSimBtn.closest('button')).toHaveClass('active');
    expect(normalBtn).not.toHaveClass('active');
    // Clicking Normal re-activates it
    fireEvent.click(normalBtn);
    expect(normalBtn).toHaveClass('active');
  });

  it('shows a Clear button for a character that has an override', () => {
    useContent.mockReturnValue({
      theme: {
        ...BASE_THEME,
        accentOverrides: { pellias: '#ff0000' },
      },
      characters: CHARACTERS,
    });
    render(<GmTheme />);
    expect(screen.getAllByText('Clear').length).toBeGreaterThan(0);
  });

  it('handles null/undefined theme gracefully', () => {
    useContent.mockReturnValue({ theme: null, characters: [] });
    expect(() => render(<GmTheme />)).not.toThrow();
  });
});
