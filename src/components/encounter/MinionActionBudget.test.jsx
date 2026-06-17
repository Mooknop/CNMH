import { render, screen } from '@testing-library/react';
import MinionActionBudget from './MinionActionBudget';

describe('MinionActionBudget', () => {
  it('shows a hint when no actions are granted yet', () => {
    render(<MinionActionBudget granted={0} spent={0} />);
    expect(screen.getByText(/command to grant actions/i)).toBeInTheDocument();
  });

  it('renders one pip per granted action and an N-left readout', () => {
    const { container } = render(<MinionActionBudget granted={2} spent={0} />);
    expect(container.querySelectorAll('.mab-pip')).toHaveLength(2);
    expect(container.querySelectorAll('.mab-pip--filled')).toHaveLength(0);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/left/i)).toBeInTheDocument();
  });

  it('fills spent pips and reflects the remaining count', () => {
    const { container } = render(<MinionActionBudget granted={2} spent={1} />);
    expect(container.querySelectorAll('.mab-pip--filled')).toHaveLength(1);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows an over-budget indicator and clamps left at 0', () => {
    const { container } = render(<MinionActionBudget granted={2} spent={3} />);
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(container.querySelector('.mab-pip')).toBeInTheDocument();
  });
});
