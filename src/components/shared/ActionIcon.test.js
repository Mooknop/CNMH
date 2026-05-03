import React from 'react';
import { render, screen } from '@testing-library/react';
import ActionIcon from './ActionIcon';

// Mock the ActionsUtils
jest.mock('../../utils/ActionsUtils', () => ({
  convertWordToNumber: (word) => {
    const map = { 'one': 1, 'two': 2, 'three': 3, '1': 1, '2': 2, '3': 3 };
    return map[word.toLowerCase()] || 0;
  }
}));

describe('ActionIcon', () => {
  it('should return null when actionText is not provided', () => {
    const { container } = render(<ActionIcon actionText={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render single action icon', () => {
    const { container } = render(<ActionIcon actionText="One Action" />);
    const icons = container.querySelectorAll('.action-icon');
    expect(icons).toHaveLength(1);
  });

  it('should render multiple action icons', () => {
    const { container } = render(<ActionIcon actionText="Three Actions" />);
    const icons = container.querySelectorAll('.action-icon');
    expect(icons).toHaveLength(3);
  });

  it('should render reaction icon', () => {
    const { container } = render(<ActionIcon actionText="Reaction" />);
    const reactionIcon = container.querySelector('.reaction-icon');
    expect(reactionIcon).toBeInTheDocument();
  });

  it('should render free action icon', () => {
    const { container } = render(<ActionIcon actionText="Free Action" />);
    const freeActionIcon = container.querySelector('.free-action-icon');
    expect(freeActionIcon).toBeInTheDocument();
  });

  it('should apply size class correctly', () => {
    const { container: smallContainer } = render(
      <ActionIcon actionText="One Action" size="small" />
    );
    expect(smallContainer.querySelector('.action-icon-small')).toBeInTheDocument();

    const { container: largeContainer } = render(
      <ActionIcon actionText="One Action" size="large" />
    );
    expect(largeContainer.querySelector('.action-icon-large')).toBeInTheDocument();

    const { container: mediumContainer } = render(
      <ActionIcon actionText="One Action" size="medium" />
    );
    expect(mediumContainer.querySelector('.action-icon-medium')).toBeInTheDocument();
  });

  it('should apply custom color style', () => {
    const { container } = render(
      <ActionIcon actionText="One Action" color="#ff0000" />
    );
    const icon = container.querySelector('.action-icon');
    expect(icon).toHaveStyle('color: #ff0000');
  });

  it('should show tooltip when showTooltip is true', () => {
    const { container } = render(
      <ActionIcon actionText="Reaction" showTooltip={true} />
    );
    const tooltip = container.querySelector('.action-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('Reaction');
  });

  it('should not show tooltip when showTooltip is false', () => {
    const { container } = render(
      <ActionIcon actionText="Reaction" showTooltip={false} />
    );
    const tooltip = container.querySelector('.action-tooltip');
    expect(tooltip).not.toBeInTheDocument();
  });

  it('should handle two actions text', () => {
    const { container } = render(<ActionIcon actionText="Two Actions" />);
    const icons = container.querySelectorAll('.action-icon');
    expect(icons).toHaveLength(2);
  });

  it('should be case-insensitive', () => {
    const { container: container1 } = render(
      <ActionIcon actionText="ONE ACTION" />
    );
    const { container: container2 } = render(
      <ActionIcon actionText="one action" />
    );
    
    expect(container1.querySelectorAll('.action-icon')).toHaveLength(1);
    expect(container2.querySelectorAll('.action-icon')).toHaveLength(1);
  });
});
