import { AURA_PROTOCOL, buildAuraSet } from './auraRelay';

describe('AURA_PROTOCOL', () => {
  it('is the #1733 S1 relay floor', () => {
    expect(AURA_PROTOCOL).toBe(19);
  });
});

describe('buildAuraSet', () => {
  it('builds an active payload with feet + label', () => {
    const payload = buildAuraSet({ active: true, feet: 10, label: 'Channel Elements' });
    expect(payload.active).toBe(true);
    expect(payload.feet).toBe(10);
    expect(payload.label).toBe('Channel Elements');
    expect(typeof payload.ts).toBe('number');
  });

  it('omits feet/label/color when absent — a deactivation carries no radius', () => {
    const payload = buildAuraSet({ active: false });
    expect(payload).toEqual({ active: false, ts: payload.ts });
    expect('feet' in payload).toBe(false);
    expect('label' in payload).toBe(false);
    expect('color' in payload).toBe(false);
  });

  it('coerces feet to a number and drops falsy label/color', () => {
    const payload = buildAuraSet({ active: true, feet: '15', label: '', color: '' });
    expect(payload.feet).toBe(15);
    expect('label' in payload).toBe(false);
    expect('color' in payload).toBe(false);
  });

  it('carries an optional color through untouched', () => {
    const payload = buildAuraSet({ active: true, feet: 10, color: '#ff8800' });
    expect(payload.color).toBe('#ff8800');
  });
});
