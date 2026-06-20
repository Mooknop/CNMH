import { creditEarnIncome } from './applyEarnIncome';

const entry = {
  charId: 'char-1',
  charName: 'Ashka',
  skillLabel: 'Crafting',
  taskLevel: 8,
  dc: 24,
  degree: 'success',
  payoutCp: 300, // 3 gp
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('creditEarnIncome', () => {
  it('adds the converted payout to the existing gold and returns the new total', () => {
    const getState = vi.fn(() => 10); // 10 gp on hand
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();

    const next = creditEarnIncome({ entry, getState, sendUpdate, appendLog });

    expect(next).toBe(13);
    expect(sendUpdate).toHaveBeenCalledWith('char-1', 'gold', 13);
    expect(JSON.parse(window.localStorage.getItem('cnmh_gold_char-1'))).toBe(13);
  });

  it('falls back to localStorage gold when the server has no value', () => {
    window.localStorage.setItem('cnmh_gold_char-1', '5');
    const getState = vi.fn(() => undefined);
    const next = creditEarnIncome({ entry, getState, sendUpdate: vi.fn(), appendLog: vi.fn() });
    expect(next).toBe(8); // 5 + 3
  });

  it('treats missing gold as 0', () => {
    const next = creditEarnIncome({ entry, getState: vi.fn(() => undefined), sendUpdate: vi.fn(), appendLog: vi.fn() });
    expect(next).toBe(3);
  });

  it('logs the credit with the degree label and gp amount', () => {
    const appendLog = vi.fn();
    creditEarnIncome({ entry, getState: vi.fn(() => 0), sendUpdate: vi.fn(), appendLog });
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'action',
        charId: 'char-1',
        text: expect.stringContaining('Ashka earned income with Crafting'),
      }),
    );
    expect(appendLog.mock.calls[0][0].text).toMatch(/Success — 3 gp/);
  });

  it('credits 0 on a critical failure without erroring', () => {
    const critFail = { ...entry, degree: 'criticalFailure', payoutCp: 0 };
    const next = creditEarnIncome({ entry: critFail, getState: vi.fn(() => 7), sendUpdate: vi.fn(), appendLog: vi.fn() });
    expect(next).toBe(7);
  });
});
