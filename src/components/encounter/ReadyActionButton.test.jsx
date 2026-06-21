import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReadyActionButton from './ReadyActionButton';

let mockEncounter;
const appendLog = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter, appendLog }),
}));

let mockTurnState;
const spendActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ turnState: mockTurnState, spendActions }),
  defaultTurnState: () => ({ actionsSpent: 0 }),
}));

let mockReadied;
const declare = vi.fn();
const clear = vi.fn();
vi.mock('../../hooks/useReadiedAction', () => ({
  useReadiedAction: () => ({ readied: mockReadied, declare, clear }),
}));

// p1 is the acting combatant in these tests.
const inProgress = {
  active: true,
  phase: 'in-progress',
  round: 2,
  currentTurnIndex: 0,
  order: [{ kind: 'pc', charId: 'p1' }],
};

beforeEach(() => {
  mockEncounter = inProgress;
  mockTurnState = { actionsSpent: 0 };
  mockReadied = null;
  appendLog.mockClear();
  spendActions.mockClear();
  declare.mockClear();
  clear.mockClear();
});

const renderBtn = () => render(<ReadyActionButton charId="p1" characterName="Kestrel" />);

describe('ReadyActionButton', () => {
  it('renders nothing when it is not this PC\'s turn', () => {
    mockEncounter = { ...inProgress, order: [{ kind: 'pc', charId: 'p2' }] };
    const { container } = renderBtn();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing outside an in-progress encounter', () => {
    mockEncounter = { ...inProgress, phase: 'setup' };
    const { container } = renderBtn();
    expect(container).toBeEmptyDOMElement();
  });

  it('disables the affordance when fewer than 2 actions remain', () => {
    mockTurnState = { actionsSpent: 2 }; // 1 left
    renderBtn();
    expect(screen.getByRole('button', { name: 'Ready an action' })).toBeDisabled();
  });

  it('declares a readied action, spending 2 actions and logging', () => {
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: 'Ready an action' }));
    fireEvent.change(screen.getByLabelText('Action to ready'), { target: { value: 'Strike' } });
    fireEvent.change(screen.getByLabelText('Trigger'), { target: { value: 'enemy enters reach' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ready' }));

    expect(spendActions).toHaveBeenCalledWith(2, 'Ready an Action');
    expect(declare).toHaveBeenCalledWith({
      actionName: 'Strike',
      trigger: 'enemy enters reach',
      round: 2,
    });
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'action',
        charId: 'p1',
        text: 'Kestrel readies Strike (trigger: enemy enters reach)',
      })
    );
  });

  it('blocks confirm with no action name', () => {
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: 'Ready an action' }));
    expect(screen.getByRole('button', { name: 'Confirm ready' })).toBeDisabled();
    expect(declare).not.toHaveBeenCalled();
  });

  it('shows the standing declaration and cancels it', () => {
    mockReadied = { actionName: 'Strike', trigger: 'enemy enters reach' };
    renderBtn();
    expect(screen.getByText('Strike')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel readied action' }));
    expect(clear).toHaveBeenCalled();
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Kestrel cancels their readied action' })
    );
  });
});
