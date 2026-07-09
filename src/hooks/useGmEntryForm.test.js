import { renderHook, act } from '@testing-library/react';
import { useGmEntryForm } from './useGmEntryForm';
import { saveDocument, deleteDocument } from '../utils/gmApi';

vi.mock('../utils/gmApi', async (importOriginal) => ({
  ...(await importOriginal()),
  saveDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

const setup = ({ isNew = false, existingIds } = {}) => {
  const onSaved = vi.fn();
  const view = renderHook(() =>
    useGmEntryForm({ collection: 'trait', isNew, existingIds, onSaved })
  );
  return { ...view, onSaved };
};

beforeEach(() => {
  saveDocument.mockResolvedValue({});
  deleteDocument.mockResolvedValue({});
});

describe('useGmEntryForm', () => {
  it('save persists the doc and reports onSaved(isNew, id)', async () => {
    const { result, onSaved } = setup({ isNew: true, existingIds: new Set() });
    await act(() => result.current.save('brave', { id: 'brave', name: 'Brave' }));
    expect(saveDocument).toHaveBeenCalledWith('trait', 'brave', { id: 'brave', name: 'Brave' });
    expect(onSaved).toHaveBeenCalledWith(true, 'brave');
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('a new entry colliding with an existing id asks before overwriting', async () => {
    const { result, onSaved } = setup({ isNew: true, existingIds: new Set(['brave']) });
    await act(() => result.current.save('brave', { id: 'brave', name: 'Brave' }));
    expect(saveDocument).not.toHaveBeenCalled();
    expect(result.current.confirm).toEqual({
      kind: 'collision',
      id: 'brave',
      payload: { id: 'brave', name: 'Brave' },
    });

    await act(() => result.current.confirmCollision());
    expect(saveDocument).toHaveBeenCalledWith('trait', 'brave', { id: 'brave', name: 'Brave' });
    expect(onSaved).toHaveBeenCalledWith(true, 'brave');
    expect(result.current.confirm).toBeNull();
  });

  it('editing an existing entry never collision-guards', async () => {
    const { result } = setup({ isNew: false, existingIds: new Set(['brave']) });
    await act(() => result.current.save('brave', { id: 'brave' }));
    expect(saveDocument).toHaveBeenCalled();
    expect(result.current.confirm).toBeNull();
  });

  it('remove deletes and reports onSaved(false)', async () => {
    const { result, onSaved } = setup();
    act(() => result.current.requestDelete());
    expect(result.current.confirm).toEqual({ kind: 'delete' });
    await act(() => result.current.remove('brave'));
    expect(deleteDocument).toHaveBeenCalledWith('trait', 'brave');
    expect(onSaved).toHaveBeenCalledWith(false);
    expect(result.current.confirm).toBeNull();
  });

  it('a failed save surfaces the error and clears busy', async () => {
    saveDocument.mockRejectedValue(new Error('boom'));
    const { result, onSaved } = setup();
    await act(() => result.current.save('x', { id: 'x' }));
    expect(result.current.error).toBe('boom');
    expect(result.current.busy).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('cancelConfirm clears any pending confirmation', () => {
    const { result } = setup();
    act(() => result.current.requestDelete());
    act(() => result.current.cancelConfirm());
    expect(result.current.confirm).toBeNull();
  });

  it('setError lets the page report its own validation failures', () => {
    const { result } = setup();
    act(() => result.current.setError('Name is required.'));
    expect(result.current.error).toBe('Name is required.');
  });
});
