import { logThrownWeaponResolution } from './thrownResolution';

const character = { id: 'char-p', name: 'Pellias' };

const makeArgs = (ability) => ({
  ability,
  character,
  dropThrownWeapon: vi.fn(),
  appendLog: vi.fn(),
});

describe('logThrownWeaponResolution (#1230)', () => {
  it('drops the weapon and logs the landing on a plain thrown Strike', () => {
    const args = makeArgs({ name: 'Dagger Strike', source: 'Dagger', thrown: true, weaponUid: 'w-dag' });
    logThrownWeaponResolution(args);
    expect(args.dropThrownWeapon).toHaveBeenCalledWith('w-dag');
    expect(args.appendLog).toHaveBeenCalledWith({
      type: 'action',
      charId: 'char-p',
      text: "Pellias's Dagger lands after the throw — Dropped",
    });
  });

  it('a returning weapon flies back to hand — no drop', () => {
    const args = makeArgs({ name: 'Trident Strike', source: 'Trident', thrown: true, weaponUid: 'w-tri', returning: true });
    logThrownWeaponResolution(args);
    expect(args.dropThrownWeapon).not.toHaveBeenCalled();
    expect(args.appendLog).toHaveBeenCalledWith({
      type: 'action',
      charId: 'char-p',
      text: "Pellias's Trident flies back to hand after the throw",
    });
  });

  it('falls back to the ability name when no source is set', () => {
    const args = makeArgs({ name: 'Hatchet', thrown: true, weaponUid: 'w-hat' });
    logThrownWeaponResolution(args);
    expect(args.appendLog.mock.calls[0][0].text).toContain("Pellias's Hatchet lands");
  });

  it('no-ops for non-thrown Strikes, missing weaponUid, and Blade Byrnie daggers', () => {
    [
      { name: 'Sword Strike', weaponUid: 'w-s' },
      { name: 'Dagger Strike', thrown: true },
      { name: 'Byrnie Dagger', thrown: true, weaponUid: 'w-b', bladeByrnie: true },
      null,
    ].forEach((ability) => {
      const args = makeArgs(ability);
      logThrownWeaponResolution(args);
      expect(args.dropThrownWeapon).not.toHaveBeenCalled();
      expect(args.appendLog).not.toHaveBeenCalled();
    });
  });
});
