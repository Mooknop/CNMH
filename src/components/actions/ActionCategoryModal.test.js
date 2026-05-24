import React from 'react';
import { render, screen } from '@testing-library/react';
import ActionCategoryModal from './ActionCategoryModal';

jest.mock('./ActionCardList', () => ({ items, type }) => (
  <div data-testid="action-card-list">{items?.length} items</div>
));
jest.mock('./StrikesList', () => () => <div data-testid="strikes-list" />);

const items = [
  { id: 'strike', name: 'Strike', description: 'Basic attack.' },
  { id: 'trip', name: 'Trip', description: 'Knock prone.' },
];

describe('ActionCategoryModal', () => {
  it('renders nothing visible when closed', () => {
    const { container } = render(
      <ActionCategoryModal isOpen={false} onClose={jest.fn()} title="Offensive" items={items} />
    );
    expect(container).toBeInTheDocument();
  });

  it('renders ActionCardList with items when open', () => {
    render(
      <ActionCategoryModal isOpen onClose={jest.fn()} title="Offensive" items={items} />
    );
    expect(screen.getByTestId('action-card-list')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('renders StrikesList and divider when showStrikes is true', () => {
    render(
      <ActionCategoryModal
        isOpen
        onClose={jest.fn()}
        title="Offensive"
        items={items}
        showStrikes
        character={{ id: 'c1', name: 'Test', level: 1 }}
        encounterMode
        onUse={jest.fn()}
      />
    );
    expect(screen.getByTestId('strikes-list')).toBeInTheDocument();
    expect(screen.getByText('Basic Offensive Actions')).toBeInTheDocument();
  });

  it('does not render StrikesList when showStrikes is false', () => {
    render(
      <ActionCategoryModal isOpen onClose={jest.fn()} title="Defensive" items={items} showStrikes={false} />
    );
    expect(screen.queryByTestId('strikes-list')).not.toBeInTheDocument();
  });
});
