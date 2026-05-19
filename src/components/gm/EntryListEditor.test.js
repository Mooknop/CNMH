import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import EntryListEditor from './EntryListEditor';

const entries = [
  { name: 'Alpha' },
  { name: 'Beta' },
  { name: '' }, // unnamed
];

const setup = (props = {}) => {
  const onSelect = jest.fn();
  const onAdd = jest.fn();
  const onRemove = jest.fn();
  render(
    <EntryListEditor
      label="Strikes"
      idPrefix="strikes"
      entries={entries}
      selectedIndex={null}
      onSelect={onSelect}
      onAdd={onAdd}
      onRemove={onRemove}
      nameOf={(e) => e.name}
      renderDetail={(e, i) => <div data-testid="detail">editing {i}: {e.name}</div>}
      {...props}
    />
  );
  return { onSelect, onAdd, onRemove };
};

describe('EntryListEditor', () => {
  it('lists every entry with an (unnamed) fallback and an empty detail hint', () => {
    setup();
    expect(screen.getByTestId('strikes-list-0')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('strikes-list-1')).toHaveTextContent('Beta');
    expect(screen.getByTestId('strikes-list-2')).toHaveTextContent('(unnamed)');
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('strikes-detail')).toHaveTextContent(/Select a strikes entry/i);
  });

  it('renders only the selected entry on the right and marks the row active', () => {
    setup({ selectedIndex: 1 });
    expect(screen.getByTestId('detail')).toHaveTextContent('editing 1: Beta');
    expect(screen.getByTestId('strikes-list-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('strikes-list-0')).toHaveAttribute('aria-pressed', 'false');
  });

  it('fires onSelect / onAdd / onRemove with the original index', () => {
    const { onSelect, onAdd, onRemove } = setup();
    fireEvent.click(screen.getByTestId('strikes-list-1'));
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTestId('strikes-add'));
    expect(onAdd).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('strikes-list-2-remove'));
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('filters by name but keeps original indices for select', () => {
    const { onSelect } = setup();
    fireEvent.change(screen.getByLabelText('strikes-search'), { target: { value: 'bet' } });
    expect(screen.queryByTestId('strikes-list-0')).not.toBeInTheDocument();
    const row = screen.getByTestId('strikes-list-1');
    expect(row).toHaveTextContent('Beta');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.change(screen.getByLabelText('strikes-search'), { target: { value: 'zzz' } });
    expect(within(screen.getByLabelText('strikes list')).getByText('No matches.')).toBeInTheDocument();
  });

  it('shows an empty-list prompt and custom add label when there are no entries', () => {
    render(
      <EntryListEditor
        label="Feats"
        idPrefix="feats"
        entries={[]}
        selectedIndex={null}
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        nameOf={(e) => e.name}
        addLabel="Add feats entry"
        renderDetail={() => <div>x</div>}
      />
    );
    expect(screen.getByLabelText('feats list')).toHaveTextContent(/No feats yet/i);
    expect(screen.getByTestId('feats-add')).toHaveTextContent('Add feats entry');
  });
});
