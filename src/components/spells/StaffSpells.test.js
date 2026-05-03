import React from 'react';
import { render, screen } from '@testing-library/react';
import StaffSpells from './StaffSpells';

let capturedProps = {};

jest.mock('./SpellCategorySection', () => {
  return function DummySpellCategorySection(props) {
    capturedProps = props;
    return (
      <div data-testid="spell-category-section">
        <span data-testid="scs-title">{props.title}</span>
        <span data-testid="scs-empty-message">{props.emptyMessage ?? 'undefined'}</span>
        <div data-testid="scs-children">{props.children}</div>
      </div>
    );
  };
});

const baseStaff = {
  name: 'Staff of Fire',
  description: 'A fiery staff.',
};

const baseProps = {
  staff: baseStaff,
  spells: [],
  themeColor: '#4a90d9',
  characterLevel: 5,
  defenseFilter: 'all',
  activeSpellRank: 'all',
};

describe('StaffSpells', () => {
  beforeEach(() => {
    capturedProps = {};
  });

  it('passes staff name as title', () => {
    render(<StaffSpells {...baseProps} />);
    expect(screen.getByTestId('scs-title')).toHaveTextContent('Staff of Fire');
  });

  it('passes staff description to SpellCategorySection', () => {
    render(<StaffSpells {...baseProps} />);
    expect(capturedProps.description).toBe('A fiery staff.');
  });

  it('passes undefined emptyMessage when no active filter', () => {
    render(<StaffSpells {...baseProps} />);
    expect(capturedProps.emptyMessage).toBeUndefined();
  });

  it('passes custom emptyMessage when activeSpellRank is not "all"', () => {
    render(<StaffSpells {...baseProps} activeSpellRank="3" />);
    expect(capturedProps.emptyMessage).toBe('No staff spells matching your current filters.');
  });

  it('passes custom emptyMessage when defenseFilter is not "all"', () => {
    render(<StaffSpells {...baseProps} defenseFilter="Will" />);
    expect(capturedProps.emptyMessage).toBe('No staff spells matching your current filters.');
  });

  it('renders noDataContent children when no active filter', () => {
    render(<StaffSpells {...baseProps} />);
    // The noDataContent should be passed as children and rendered
    const childContent = screen.getByTestId('scs-children');
    expect(childContent).toHaveTextContent(/does not have any spells specified/);
  });

  it('passes null children when hasActiveFilter is true', () => {
    render(<StaffSpells {...baseProps} activeSpellRank="3" />);
    expect(capturedProps.children).toBeNull();
  });

  it('uses default description when staff.description is absent', () => {
    const staff = { name: 'Plain Staff' };
    render(<StaffSpells {...baseProps} staff={staff} />);
    expect(capturedProps.description).toBe('A magical staff that can store spells.');
  });

  it('renders StaffInfoBox as infoBox', () => {
    render(<StaffSpells {...baseProps} />);
    // infoBox should be a React element
    expect(capturedProps.infoBox).not.toBeNull();
  });
});
