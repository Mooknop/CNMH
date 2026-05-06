import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConditionModal from './ConditionModal';

jest.mock('../../data/pf2eConditions', () => [
  {
    id: 'frightened',
    name: 'Frightened',
    valued: true,
    maxValue: 4,
    decrements: true,
    summary: 'Status penalty to all checks',
    effect: (v) => `-${v} to all checks and DCs`,
  },
  {
    id: 'off-guard',
    name: 'Off-Guard',
    valued: false,
    maxValue: null,
    decrements: false,
    summary: '-2 circumstance penalty to AC',
    effect: () => '-2 circumstance to AC',
  },
  {
    id: 'fatigued',
    name: 'Fatigued',
    valued: false,
    maxValue: null,
    decrements: false,
    summary: '-1 status to AC and saves',
    effect: () => '-1 status to AC and saves',
  },
]);

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  themeColor: '#cc0000',
  activeConditions: [],
  onAdd: jest.fn(),
  onRemove: jest.fn(),
  onChangeValue: jest.fn(),
};

describe('ConditionModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing when open', () => {
    expect(() => render(<ConditionModal {...defaultProps} />)).not.toThrow();
  });

  it('does not render content when isOpen is false', () => {
    const { container } = render(<ConditionModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "No active conditions." when none are active', () => {
    render(<ConditionModal {...defaultProps} />);
    expect(screen.getByText('No active conditions.')).toBeInTheDocument();
  });

  it('renders all conditions in the browser grid', () => {
    render(<ConditionModal {...defaultProps} />);
    expect(screen.getByText('Frightened')).toBeInTheDocument();
    expect(screen.getByText('Off-Guard')).toBeInTheDocument();
    expect(screen.getByText('Fatigued')).toBeInTheDocument();
  });

  it('renders condition summaries in browser cards', () => {
    render(<ConditionModal {...defaultProps} />);
    expect(screen.getByText('Status penalty to all checks')).toBeInTheDocument();
  });

  it('shows "Valued" tag only for valued conditions', () => {
    render(<ConditionModal {...defaultProps} />);
    const valuedTags = screen.getAllByText('Valued');
    expect(valuedTags).toHaveLength(1); // only Frightened is valued
  });

  it('clicking a browser card calls onAdd with the condition data', () => {
    const onAdd = jest.fn();
    render(<ConditionModal {...defaultProps} onAdd={onAdd} />);
    fireEvent.click(screen.getByText('Off-Guard').closest('button'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'off-guard' }));
  });

  it('renders "Add Condition" section heading', () => {
    render(<ConditionModal {...defaultProps} />);
    expect(screen.getByText('Add Condition')).toBeInTheDocument();
  });

  it('renders "Active Conditions" section heading', () => {
    render(<ConditionModal {...defaultProps} />);
    expect(screen.getByText('Active Conditions')).toBeInTheDocument();
  });

  describe('with a valued active condition', () => {
    const valuedActive = [
      {
        id: 'frightened',
        name: 'Frightened',
        valued: true,
        maxValue: 4,
        value: 2,
        decrements: true,
        effect: (v) => `-${v} to all checks and DCs`,
      },
    ];

    it('renders the active condition name', () => {
      render(<ConditionModal {...defaultProps} activeConditions={valuedActive} />);
      // Frightened appears in both active list and browser
      expect(screen.getAllByText('Frightened').length).toBeGreaterThan(0);
    });

    it('renders the value badge', () => {
      render(<ConditionModal {...defaultProps} activeConditions={valuedActive} />);
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders the effect text', () => {
      render(<ConditionModal {...defaultProps} activeConditions={valuedActive} />);
      expect(screen.getByText('-2 to all checks and DCs')).toBeInTheDocument();
    });

    it('renders "Decrements each round" tag', () => {
      render(<ConditionModal {...defaultProps} activeConditions={valuedActive} />);
      expect(screen.getByText('Decrements each round')).toBeInTheDocument();
    });

    it('clicking × calls onRemove with the condition id', () => {
      const onRemove = jest.fn();
      render(<ConditionModal {...defaultProps} activeConditions={valuedActive} onRemove={onRemove} />);
      fireEvent.click(screen.getByTitle('Remove condition'));
      expect(onRemove).toHaveBeenCalledWith('frightened');
    });

    it('clicking + calls onChangeValue with delta +1', () => {
      const onChangeValue = jest.fn();
      render(<ConditionModal {...defaultProps} activeConditions={valuedActive} onChangeValue={onChangeValue} />);
      fireEvent.click(screen.getByTitle('Increment'));
      expect(onChangeValue).toHaveBeenCalledWith('frightened', 1);
    });

    it('clicking − calls onChangeValue with delta -1', () => {
      const onChangeValue = jest.fn();
      render(<ConditionModal {...defaultProps} activeConditions={valuedActive} onChangeValue={onChangeValue} />);
      fireEvent.click(screen.getByTitle('Decrement'));
      expect(onChangeValue).toHaveBeenCalledWith('frightened', -1);
    });

    it('+ button is disabled when value equals maxValue', () => {
      const maxed = [{ ...valuedActive[0], value: 4 }];
      render(<ConditionModal {...defaultProps} activeConditions={maxed} />);
      expect(screen.getByTitle('Increment')).toBeDisabled();
    });

    it('+ button is not disabled below maxValue', () => {
      render(<ConditionModal {...defaultProps} activeConditions={valuedActive} />);
      expect(screen.getByTitle('Increment')).not.toBeDisabled();
    });

    it('valued active condition does NOT get --active class in browser', () => {
      const { container } = render(
        <ConditionModal {...defaultProps} activeConditions={valuedActive} />
      );
      expect(container.querySelector('.ct-browser-card--active')).toBeNull();
    });
  });

  describe('with a toggle active condition', () => {
    const toggleActive = [
      {
        id: 'off-guard',
        name: 'Off-Guard',
        valued: false,
        maxValue: null,
        value: null,
        decrements: false,
        effect: () => '-2 circumstance to AC',
      },
    ];

    it('renders effect text for toggle condition', () => {
      render(<ConditionModal {...defaultProps} activeConditions={toggleActive} />);
      expect(screen.getByText('-2 circumstance to AC')).toBeInTheDocument();
    });

    it('does not render +/− buttons for toggle condition', () => {
      render(<ConditionModal {...defaultProps} activeConditions={toggleActive} />);
      expect(screen.queryByTitle('Increment')).toBeNull();
      expect(screen.queryByTitle('Decrement')).toBeNull();
    });

    it('does not render "Decrements each round" tag', () => {
      render(<ConditionModal {...defaultProps} activeConditions={toggleActive} />);
      expect(screen.queryByText('Decrements each round')).toBeNull();
    });

    it('browser card for active toggle condition gets --active class', () => {
      const { container } = render(
        <ConditionModal {...defaultProps} activeConditions={toggleActive} />
      );
      expect(container.querySelector('.ct-browser-card--active')).toBeInTheDocument();
    });
  });
});
