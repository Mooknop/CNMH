import { renderHook } from '@testing-library/react';

// Each source is mocked so the test asserts purely the merge logic.
let mockActiveEffects = [];
vi.mock('./useEffects', () => ({
  __esModule: true,
  useEffects: () => ({ effects: mockActiveEffects }),
}));

let mockContentCatalog = [];
vi.mock('../contexts/ContentContext', () => ({
  __esModule: true,
  useContent: () => ({ effects: mockContentCatalog }),
}));

let mockShieldEffect = null;
vi.mock('./useShield', () => ({
  __esModule: true,
  useShield: () => ({ shieldEffect: mockShieldEffect }),
}));

let mockWornEffects = [];
vi.mock('./useWornGear', () => ({
  __esModule: true,
  useWornGear: () => ({ wornEffects: mockWornEffects }),
}));

import { useResolvedEffects } from './useResolvedEffects';

const run = () => renderHook(() => useResolvedEffects('hero', [])).result.current;

const APP = [{ id: 'a1', effectId: 'heroism-1' }];
const CONTENT = [{ id: 'heroism-1', name: 'Heroism', modifiers: [] }];
const SHIELD = {
  entry: { id: 'raised-shield', effectId: 'raised-shield' },
  def: { id: 'raised-shield', name: 'Raised Shield', modifiers: [{ stat: 'ac', kind: 'circumstance', amount: 2 }] },
};
const WORN = {
  entry: { id: 'worn-u1', effectId: 'worn-u1' },
  def: { id: 'worn-u1', name: 'Energy Robe', modifiers: [{ stat: 'resistance', amount: 5, vs: 'fire' }] },
};

beforeEach(() => {
  mockActiveEffects = [...APP];
  mockContentCatalog = [...CONTENT];
  mockShieldEffect = null;
  mockWornEffects = [];
});

describe('useResolvedEffects (#922 S2)', () => {
  it('passes through the app effects + content catalog when no synthetic sources', () => {
    const { effects, catalog } = run();
    expect(effects).toEqual(APP);
    expect(catalog).toEqual(CONTENT);
  });

  it('appends worn entries to effects and worn defs to the catalog', () => {
    mockWornEffects = [WORN];
    const { effects, catalog } = run();
    expect(effects).toEqual([...APP, WORN.entry]);
    expect(catalog).toEqual([...CONTENT, WORN.def]);
  });

  it('folds in a raised shield ahead of worn gear', () => {
    mockShieldEffect = SHIELD;
    mockWornEffects = [WORN];
    const { effects, catalog } = run();
    expect(effects).toEqual([...APP, SHIELD.entry, WORN.entry]);
    expect(catalog).toEqual([...CONTENT, SHIELD.def, WORN.def]);
  });

  it('tolerates a null content catalog when synthetics are present', () => {
    mockContentCatalog = null;
    mockWornEffects = [WORN];
    const { catalog } = run();
    expect(catalog).toEqual([WORN.def]);
  });
});
