import React from 'react';
import { render, screen, within } from '@testing-library/react';
import PenaltyDisplay from './PenaltyDisplay';

const noPenalty = { total: 0, sources: [] };
const penalty2 = { total: -2, sources: [{ label: 'Frightened 2', penalty: -2 }] };

describe('PenaltyDisplay — no active penalty', () => {
  it('renders plain number by default', () => {
    render(<PenaltyDisplay base={15} penalty={noPenalty} />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders positive modifier with + sign', () => {
    render(<PenaltyDisplay base={3} penalty={noPenalty} format="modifier" />);
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('renders negative modifier without + sign', () => {
    render(<PenaltyDisplay base={-2} penalty={noPenalty} format="modifier" />);
    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('renders zero as +0 in modifier format', () => {
    render(<PenaltyDisplay base={0} penalty={noPenalty} format="modifier" />);
    expect(screen.getByText('+0')).toBeInTheDocument();
  });

  it('does not use pd-wrapper class when there is no penalty', () => {
    const { container } = render(<PenaltyDisplay base={10} penalty={noPenalty} />);
    expect(container.querySelector('.pd-wrapper')).toBeNull();
  });

  it('forwards className to the plain span', () => {
    const { container } = render(
      <PenaltyDisplay base={10} penalty={noPenalty} className="my-class" />
    );
    expect(container.querySelector('.my-class')).toBeInTheDocument();
  });

  it('renders correctly when penalty is undefined', () => {
    render(<PenaltyDisplay base={10} />);
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders correctly when penalty is null', () => {
    render(<PenaltyDisplay base={7} penalty={null} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders string base without crashing', () => {
    render(<PenaltyDisplay base="25 feet" penalty={noPenalty} />);
    expect(screen.getByText('25 feet')).toBeInTheDocument();
  });
});

describe('PenaltyDisplay — with active penalty', () => {
  it('renders adjusted value in number format', () => {
    render(<PenaltyDisplay base={16} penalty={penalty2} />);
    // adjusted = 16 + (-2) = 14
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('renders adjusted value in modifier format (positive)', () => {
    render(<PenaltyDisplay base={5} penalty={penalty2} format="modifier" />);
    // adjusted = 5 + (-2) = 3 → "+3"
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('renders adjusted value in modifier format (negative)', () => {
    render(<PenaltyDisplay base={1} penalty={penalty2} format="modifier" />);
    // adjusted = 1 + (-2) = -1
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('renders delta badge with the penalty total', () => {
    const { container } = render(<PenaltyDisplay base={16} penalty={penalty2} />);
    const delta = container.querySelector('.pd-delta');
    expect(delta).toBeInTheDocument();
    expect(delta).toHaveTextContent('-2');
  });

  it('renders positive delta badge with + prefix', () => {
    const posPenalty = { total: 2, sources: [{ label: 'Bonus', penalty: 2 }] };
    const { container } = render(<PenaltyDisplay base={5} penalty={posPenalty} />);
    expect(container.querySelector('.pd-delta')).toHaveTextContent('+2');
  });

  it('uses pd-wrapper class when penalty is active', () => {
    const { container } = render(<PenaltyDisplay base={16} penalty={penalty2} />);
    expect(container.querySelector('.pd-wrapper')).toBeInTheDocument();
  });

  it('renders pd-penalized span for the adjusted value', () => {
    const { container } = render(<PenaltyDisplay base={16} penalty={penalty2} />);
    const penalized = container.querySelector('.pd-penalized');
    expect(penalized).toBeInTheDocument();
    expect(penalized).toHaveTextContent('14');
  });

  it('renders tooltip element with role=tooltip', () => {
    const { container } = render(<PenaltyDisplay base={16} penalty={penalty2} />);
    expect(container.querySelector('[role="tooltip"]')).toBeInTheDocument();
  });

  it('renders "Condition Penalty" title in tooltip', () => {
    const { container } = render(<PenaltyDisplay base={16} penalty={penalty2} />);
    const tooltip = container.querySelector('.pd-tooltip');
    expect(within(tooltip).getByText('Condition Penalty')).toBeInTheDocument();
  });

  it('renders source label in tooltip row', () => {
    const { container } = render(<PenaltyDisplay base={16} penalty={penalty2} />);
    const tooltip = container.querySelector('.pd-tooltip');
    expect(within(tooltip).getByText('Frightened 2')).toBeInTheDocument();
  });

  it('renders source penalty value in tooltip row', () => {
    const { container } = render(<PenaltyDisplay base={16} penalty={penalty2} />);
    const row = container.querySelector('.pd-tooltip-row');
    expect(within(row).getByText('-2')).toBeInTheDocument();
  });

  it('renders positive source penalty with + prefix in tooltip', () => {
    const posPenalty = { total: 3, sources: [{ label: 'Haste', penalty: 3 }] };
    const { container } = render(<PenaltyDisplay base={10} penalty={posPenalty} />);
    const row = container.querySelector('.pd-tooltip-row');
    expect(within(row).getByText('+3')).toBeInTheDocument();
  });

  it('renders multiple sources in tooltip', () => {
    const multi = {
      total: -4,
      sources: [
        { label: 'Frightened 2', penalty: -2 },
        { label: 'Prone', penalty: -2 },
      ],
    };
    const { container } = render(<PenaltyDisplay base={10} penalty={multi} />);
    const tooltip = container.querySelector('.pd-tooltip');
    expect(within(tooltip).getByText('Frightened 2')).toBeInTheDocument();
    expect(within(tooltip).getByText('Prone')).toBeInTheDocument();
    expect(container.querySelectorAll('.pd-tooltip-row')).toHaveLength(2);
  });

  it('forwards className to pd-wrapper', () => {
    const { container } = render(
      <PenaltyDisplay base={10} penalty={penalty2} className="custom" />
    );
    expect(container.querySelector('.pd-wrapper.custom')).toBeInTheDocument();
  });
});
