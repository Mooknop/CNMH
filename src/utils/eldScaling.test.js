import { scaleDamageText, scaleEldPower } from './eldScaling';

// Izzy is level 4 — the authored strings below are verbatim from the
// snapshot's eldPowers so the regexes are proven against real content.
const L = 4;

describe('scaleDamageText', () => {
  it('combines same-size "(+NdX per level)" dice (Erode)', () => {
    expect(scaleDamageText('dealing 2d10 (+1d10 per level) void damage.', L))
      .toBe('dealing 6d10 void damage.');
  });

  it('scales every occurrence in one description (Gloaming Backstab)', () => {
    const text = "You deal 2d6 (+1d6 per level) void damage to a foe within your reach with a Melee Spell Attack. If you're hidden, you deal an additional 2d4 (+1d4 per level) percision damage.";
    const out = scaleDamageText(text, L);
    expect(out).toContain('6d6 void damage');
    expect(out).toContain('6d4 percision damage');
  });

  it('handles the cantrip-sized base (Addling Blast, Electric Surge)', () => {
    expect(scaleDamageText('You deal 1d4 (+1d4 per level) mental damage', L))
      .toBe('You deal 5d4 mental damage');
  });

  it('adds the flat half-level rider (Shining Guidance)', () => {
    expect(scaleDamageText('you deal 2d4 (+1d4 per level + half your level) fire damage', L))
      .toBe('you deal 6d4+2 fire damage');
  });

  it('scales "per two levels you have" dice (Polarize)', () => {
    expect(scaleDamageText('You deal 1d4 persistent electricity damage per two levels you have to a target within 30 ftt', L))
      .toBe('You deal 2d4 persistent electricity damage to a target within 30 ftt');
  });

  it('scales "per level you have" dice (Polarize discharge note)', () => {
    expect(scaleDamageText('increase the persistent electricity damage to 1d4 per level you have.', L))
      .toBe('increase the persistent electricity damage to 4d4.');
  });

  it('resolves flat "N + half your level" (Erode failure degree)', () => {
    expect(scaleDamageText('The target takes damage equal to 2 + half your level', L))
      .toBe('The target takes damage equal to 4');
  });

  it('renders mismatched die sizes as a sum', () => {
    expect(scaleDamageText('2d6 (+1d4 per level) damage', L))
      .toBe('2d6 + 4d4 damage');
  });

  it('passes through text with no scaling phrases', () => {
    const text = 'All creatures inside the cloud are Concealed.';
    expect(scaleDamageText(text, L)).toBe(text);
  });

  it('returns the input untouched without a usable level', () => {
    const text = 'dealing 2d10 (+1d10 per level) void damage.';
    expect(scaleDamageText(text, undefined)).toBe(text);
    expect(scaleDamageText(text, 0)).toBe(text);
  });
});

describe('scaleEldPower', () => {
  it('scales the description and every degree line, leaving the rest intact', () => {
    const power = {
      name: 'Erode',
      actions: 'Two Actions',
      description: 'dealing 2d10 (+1d10 per level) void damage.',
      degrees: {
        'Critical Success': 'double damage',
        'Failure': 'The target takes damage equal to 2 + half your level',
      },
    };
    const scaled = scaleEldPower(power, L);
    expect(scaled.description).toBe('dealing 6d10 void damage.');
    expect(scaled.degrees['Failure']).toBe('The target takes damage equal to 4');
    expect(scaled.degrees['Critical Success']).toBe('double damage');
    expect(scaled.name).toBe('Erode');
    expect(scaled.actions).toBe('Two Actions');
    // The authored object is untouched.
    expect(power.description).toContain('per level');
  });

  it('tolerates powers without degrees', () => {
    const power = { name: 'Rust Cloud', description: 'a cloud of rust' };
    expect(scaleEldPower(power, L).degrees).toBeUndefined();
  });
});
