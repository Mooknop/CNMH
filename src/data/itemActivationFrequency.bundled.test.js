// #916 — the backfilled structured frequencyRule on named worn-item activations
// must be exactly what utils/frequency.parseFrequency consumes, so the
// ItemActivations use affordance gates them like ability frequencies.
import items from './snapshot/item.json';
import { parseFrequency } from '../utils/frequency';

const actionOf = (id, name) => {
  const doc = items.find((d) => d.id === id);
  expect(doc, `item doc ${id}`).toBeTruthy();
  const action = (doc.actions || []).find((a) => a.name === name);
  expect(action, `action ${name} on ${id}`).toBeTruthy();
  return action;
};

describe('worn-item activation frequency backfill (#916)', () => {
  it('Cloak of Repute — Make a Request is once per day', () => {
    expect(parseFrequency(actionOf('cloak-of-repute', 'Make a Request')))
      .toEqual({ per: 'day', uses: 1 });
  });

  it('Cape of Illumination — Blinding Flash is once per day (Greater 1/hour is the variant override, #916 follow-up)', () => {
    expect(parseFrequency(actionOf('cape-of-illumination', 'Blinding Flash')))
      .toEqual({ per: 'day', uses: 1 });
  });

  it('Cape of Illumination — Shed Light stays unlimited', () => {
    expect(parseFrequency(actionOf('cape-of-illumination', 'Shed Light'))).toBeNull();
  });

  it('Everyneed Pack — Draw Supplies is once per hour', () => {
    expect(parseFrequency(actionOf('everyneed-pack', 'Draw Supplies')))
      .toEqual({ per: 'hour', uses: 1 });
  });
});
