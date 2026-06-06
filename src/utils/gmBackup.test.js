import { downloadBackup, restoreBackup } from './gmBackup';

vi.mock('./gmApi', () => ({ seedFromBackup: vi.fn() }));
import { seedFromBackup } from './gmApi';

const fileOf = (obj) => ({ text: () => Promise.resolve(JSON.stringify(obj)) });

afterEach(() => vi.restoreAllMocks());

describe('gmBackup.downloadBackup', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:x');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('unwraps the /api/content envelope and triggers a download', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ payload: { quest: [{ id: 'q' }] } }) })
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const snapshot = await downloadBackup();
    expect(snapshot).toEqual({ quest: [{ id: 'q' }] });
    expect(click).toHaveBeenCalled();
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('throws on a non-ok response', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }));
    await expect(downloadBackup()).rejects.toThrow('HTTP 500');
  });
});

describe('gmBackup.restoreBackup', () => {
  it('sanitizes to known array collections and force-seeds', async () => {
    seedFromBackup.mockResolvedValue({ ok: true });
    await restoreBackup(fileOf({ quest: [{ id: 'q' }], junk: 1, lore: 'nope' }));
    expect(seedFromBackup).toHaveBeenCalledWith({ quest: [{ id: 'q' }] });
  });

  it('accepts the /api/content envelope shape too', async () => {
    seedFromBackup.mockResolvedValue({ ok: true });
    await restoreBackup(fileOf({ payload: { lore: [{ id: 'l' }] } }));
    expect(seedFromBackup).toHaveBeenCalledWith({ lore: [{ id: 'l' }] });
  });

  it('rejects a file with no recognizable collections', async () => {
    await expect(restoreBackup(fileOf({ foo: 'bar' }))).rejects.toThrow(/no recognizable/i);
    expect(seedFromBackup).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and a missing file', async () => {
    await expect(restoreBackup({ text: () => Promise.resolve('{ not json') })).rejects.toThrow(/not valid JSON/i);
    await expect(restoreBackup(null)).rejects.toThrow(/No backup file/i);
  });
});
