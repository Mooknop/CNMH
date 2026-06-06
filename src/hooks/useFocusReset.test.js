import { renderHook } from '@testing-library/react';
import { useFocusReset } from './useFocusReset';
import { useSyncedState } from './useSyncedState';

let mockMode;
let mockSpent;
const mockSetSpent = vi.fn();

vi.mock('./usePlayMode', () => ({ usePlayMode: () => ({ mode: mockMode }) }));
vi.mock('./useSyncedState', () => ({ useSyncedState: vi.fn() }));

describe('useFocusReset', () => {
  beforeEach(() => {
    mockMode = 'exploration';
    mockSpent = 2;
    // resetMocks wipes the implementation before each test, so re-install one
    // that reads the live module-level values.
    useSyncedState.mockImplementation(() => [mockSpent, mockSetSpent]);
  });

  it('resets spent focus to 0 outside encounter mode', () => {
    renderHook(() => useFocusReset('izzy'));
    expect(mockSetSpent).toHaveBeenCalledWith(0);
  });

  it('resets in downtime mode too', () => {
    mockMode = 'downtime';
    renderHook(() => useFocusReset('izzy'));
    expect(mockSetSpent).toHaveBeenCalledWith(0);
  });

  it('leaves spent focus untouched during an encounter', () => {
    mockMode = 'encounter';
    renderHook(() => useFocusReset('izzy'));
    expect(mockSetSpent).not.toHaveBeenCalled();
  });

  it('does not rewrite when focus is already full', () => {
    mockSpent = 0;
    renderHook(() => useFocusReset('izzy'));
    expect(mockSetSpent).not.toHaveBeenCalled();
  });

  it('no-ops without a charId', () => {
    renderHook(() => useFocusReset(null));
    expect(mockSetSpent).not.toHaveBeenCalled();
  });
});
