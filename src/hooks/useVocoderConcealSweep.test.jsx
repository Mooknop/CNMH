import { renderHook } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockInventory = [];
vi.mock('./useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: mockInventory } : null),
}));

let mockPlaying = false;
vi.mock('./usePlaying', () => ({
  usePlaying: () => ({ playing: mockPlaying }),
}));

let mockConditions = [];
const mockSetConditions = vi.fn();
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [mockConditions, mockSetConditions],
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));

const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

import { useVocoderConcealSweep } from './useVocoderConcealSweep';

const izzy = { id: 'Izzy', name: 'Izzy' };
const vocoder = { id: 'vocoder-of-invisibility', name: 'Vocoder of Invisibility' };
const vocoderConcealed = { id: 'concealed', value: null, source: 'vocoder' };

beforeEach(() => {
  vi.clearAllMocks();
  mockInventory = [vocoder];
  mockPlaying = false;
  mockConditions = [];
  mockIsGm = true;
});

describe('useVocoderConcealSweep', () => {
  it('grants Concealed when the wielder is playing, and logs', () => {
    mockPlaying = true;
    renderHook(() => useVocoderConcealSweep(izzy));
    expect(mockSetConditions).toHaveBeenCalledWith([vocoderConcealed]);
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'apply',
      text: 'Izzy is Concealed — Vocoder of Invisibility (playing)',
    }));
  });

  it('removes the vocoder Concealed when playing lapses, and logs', () => {
    mockConditions = [{ id: 'frightened', value: 1 }, vocoderConcealed];
    renderHook(() => useVocoderConcealSweep(izzy));
    expect(mockSetConditions).toHaveBeenCalledWith([{ id: 'frightened', value: 1 }]);
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'expire' }));
  });

  it('no grant while playing without the vocoder in inventory', () => {
    mockPlaying = true;
    mockInventory = [];
    renderHook(() => useVocoderConcealSweep(izzy));
    expect(mockSetConditions).not.toHaveBeenCalled();
  });

  it('idempotent: no write when already concealed / nothing to remove', () => {
    mockPlaying = true;
    mockConditions = [vocoderConcealed];
    renderHook(() => useVocoderConcealSweep(izzy));
    expect(mockSetConditions).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('leaves a manually toggled Concealed alone when playing lapses', () => {
    mockConditions = [{ id: 'concealed', value: null }];
    renderHook(() => useVocoderConcealSweep(izzy));
    expect(mockSetConditions).not.toHaveBeenCalled();
  });

  it('non-GM clients never write', () => {
    mockIsGm = false;
    mockPlaying = true;
    renderHook(() => useVocoderConcealSweep(izzy));
    expect(mockSetConditions).not.toHaveBeenCalled();
  });
});
