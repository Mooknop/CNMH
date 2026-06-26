import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldNote from './FieldNote';

describe('FieldNote', () => {
  test('read-only: renders the note text', () => {
    render(<FieldNote note="zap = bigger" />);
    expect(screen.getByText('zap = bigger')).toBeInTheDocument();
  });

  test('read-only: renders nothing when empty', () => {
    const { container } = render(<FieldNote note="" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('editable + empty: shows an add affordance', () => {
    render(<FieldNote editable onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add field note/i })).toBeInTheDocument();
  });

  test('editable: typing and saving calls onSave with the draft', () => {
    const onSave = vi.fn();
    render(<FieldNote editable note="" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /add field note/i }));
    fireEvent.change(screen.getByLabelText('Field note'), { target: { value: 'stab the eyes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('stab the eyes');
  });

  test('editable: clicking an existing scrap opens the editor seeded with the note', () => {
    render(<FieldNote editable note="old note" onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /edit field note/i }));
    expect(screen.getByLabelText('Field note')).toHaveValue('old note');
  });

  test('editable: cancel discards the draft and restores the scrap', () => {
    const onSave = vi.fn();
    render(<FieldNote editable note="keep me" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /edit field note/i }));
    fireEvent.change(screen.getByLabelText('Field note'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /edit field note/i })).toHaveTextContent('keep me');
  });
});
