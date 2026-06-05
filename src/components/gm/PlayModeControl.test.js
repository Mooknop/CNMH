import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PlayModeControl from './PlayModeControl';

const mockState = {
  mode: 'exploration',
  gmMode: 'exploration',
  moveEnabled: false,
  setGmMode: jest.fn(),
  setMoveEnabled: jest.fn(),
};

jest.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => mockState,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockState.mode = 'exploration';
  mockState.gmMode = 'exploration';
  mockState.moveEnabled = false;
});

describe('PlayModeControl', () => {
  it('shows Exploration and Downtime buttons when not in encounter', () => {
    render(<PlayModeControl />);
    expect(screen.getByRole('button', { name: 'Exploration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Downtime' })).toBeInTheDocument();
  });

  it('shows locked Encounter chip during encounter', () => {
    mockState.mode = 'encounter';
    render(<PlayModeControl />);
    expect(screen.getByText('Encounter')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exploration' })).not.toBeInTheDocument();
  });

  it('calls setGmMode with downtime when Downtime button clicked', () => {
    render(<PlayModeControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Downtime' }));
    expect(mockState.setGmMode).toHaveBeenCalledWith('downtime');
  });

  it('calls setGmMode with exploration when Exploration button clicked', () => {
    mockState.gmMode = 'downtime';
    render(<PlayModeControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Exploration' }));
    expect(mockState.setGmMode).toHaveBeenCalledWith('exploration');
  });

  it('shows movement toggle in exploration mode', () => {
    render(<PlayModeControl />);
    expect(screen.getByLabelText('Allow token movement')).toBeInTheDocument();
  });

  it('hides movement toggle in downtime mode', () => {
    mockState.gmMode = 'downtime';
    render(<PlayModeControl />);
    expect(screen.queryByLabelText('Allow token movement')).not.toBeInTheDocument();
  });

  it('hides movement toggle during encounter', () => {
    mockState.mode = 'encounter';
    render(<PlayModeControl />);
    expect(screen.queryByLabelText('Allow token movement')).not.toBeInTheDocument();
  });

  it('toggles movement off→on when toggle clicked', () => {
    render(<PlayModeControl />);
    fireEvent.click(screen.getByLabelText('Allow token movement'));
    expect(mockState.setMoveEnabled).toHaveBeenCalledWith(true);
  });

  it('toggles movement on→off when toggle clicked', () => {
    mockState.moveEnabled = true;
    render(<PlayModeControl />);
    fireEvent.click(screen.getByLabelText('Allow token movement'));
    expect(mockState.setMoveEnabled).toHaveBeenCalledWith(false);
  });

  it('shows On/Off label on toggle based on moveEnabled', () => {
    mockState.moveEnabled = true;
    const { rerender } = render(<PlayModeControl />);
    expect(screen.getByLabelText('Allow token movement')).toHaveTextContent('On');

    mockState.moveEnabled = false;
    rerender(<PlayModeControl />);
    expect(screen.getByLabelText('Allow token movement')).toHaveTextContent('Off');
  });
});
