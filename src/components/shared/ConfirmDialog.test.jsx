import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmDialog from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog isOpen={false} title="X" message="m" onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('plain mode confirms on a single click', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Overwrite?"
        message="An entry with id x already exists."
        confirmLabel="Overwrite"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByLabelText('confirm-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Overwrite'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('typed mode keeps confirm disabled until the exact string is typed', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Delete?"
        message="This cannot be undone."
        confirmLabel="Delete"
        requireType="Pellias"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    const btn = screen.getByText('Delete');
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Pell' } });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Pellias' } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancel fires onCancel and resets the typed guard on reopen', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog isOpen title="Delete?" message="m" confirmLabel="Delete" requireType="Foo" onConfirm={() => {}} onCancel={onCancel} />
    );
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Foo' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmDialog isOpen={false} title="Delete?" message="m" confirmLabel="Delete" requireType="Foo" onConfirm={() => {}} onCancel={onCancel} />
    );
    rerender(
      <ConfirmDialog isOpen title="Delete?" message="m" confirmLabel="Delete" requireType="Foo" onConfirm={() => {}} onCancel={onCancel} />
    );
    expect(screen.getByLabelText('confirm-input')).toHaveValue('');
    expect(screen.getByText('Delete')).toBeDisabled();
  });
});
