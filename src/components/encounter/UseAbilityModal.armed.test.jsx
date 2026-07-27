// UseAbilityModal — arming deferred payloads (#987, fixes #1617 / #1618).
//
// A cast parks `ability.armedPayloads` on the encounter instead of resolving
// them, and what it parks is the payload's ONLY chance to capture cast-time
// context. Two things used to be lost there:
//
//   #1618 — the block copied a fixed field list, so `severityFromSave` (and any
//           future authored field) never survived the cast.
//   #1617 — it copied the CAST's DC, so a spell that calls for no save itself
//           (Targeting Beacon has no `defense`; Cascading Caltrops' "Acrobatics
//           or Reflex" doesn't map) armed a payload with `dc: null`, which
//           buildTargetSaveRequest refuses — a permanently dead Fire button.
//
// `rollResolution` is deliberately NOT mocked here: the DC derivation is the
// thing under test, so it runs against a real spellcasting character
// (Cha 16 → +3, expert at level 12 → +16, so spell DC 29).

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockAddArmedPayload = vi.fn();
const mockAddSaveRequest = vi.fn();

const SPELL_DC = 29;

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Jade' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15, saves: { reflex: 9, fortitude: 8 } } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Jade' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, order, log: [] },
    appendLog: mockAppendLog,
    addSaveRequest: mockAddSaveRequest,
    removeSaveRequest: vi.fn(),
    addArmedPayload: mockAddArmedPayload,
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: vi.fn(),
    spendReaction: vi.fn(),
    recordAttack: vi.fn(),
  }),
}));
vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => ({ effects: [], removeEffect: vi.fn() }),
}));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({
    targets: ['e-gob'],
    selectable: order,
    isTargeted: (id) => id === 'e-gob',
    toggleTarget: vi.fn(),
  }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => [],
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [[], vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

// Cha 16 (+3), expert (2) at level 12 → spell attack +16+3, spell DC 29.
const character = {
  id: 'char-a',
  name: 'Jade',
  level: 12,
  abilities: { charisma: 16 },
  spellcasting: { ability: 'charisma', proficiency: 2 },
};
const props = { isOpen: true, onClose: vi.fn(), verb: 'Cast', character, themeColor: '#a0f' };

// Targeting Beacon's shape: everything the spell does happens LATER, so it has
// no cast-time `defense` at all — but its payload has one of its own.
const beacon = {
  id: 'targeting-beacon',
  name: 'Targeting Beacon',
  actions: 'Two Actions',
  traits: ['3rd Party'],
  armedPayloads: [{
    id: 'targeting-beacon-explosion',
    label: 'Beacon explosion',
    trigger: 'the next attack roll that HITS the beaconed creature',
    defense: 'basic Reflex',
    damageData: { base: '6d6', type: 'fire' },
  }],
};

// Gruesome Marionettist's shape: the CAST rolls a Fortitude save that fixes how
// bad the later bleed is, so the payload carries `severityFromSave`.
const marionettist = {
  id: 'gruesome-marionettist',
  name: 'Gruesome Marionettist',
  actions: 'Two Actions',
  defense: 'Fortitude',
  armedPayloads: [{
    id: 'gruesome-marionettist-bleed',
    label: 'Prohibited-action bleed',
    trigger: 'the creature takes the PROHIBITED action',
    severityFromSave: true,
    repeatable: true,
    note: 'The directed action grants immunity until the start of its next turn.',
    damageData: { riders: [{ id: 'r', label: 'bleed', persistent: { dice: '5d10', type: 'bleed' } }] },
  }],
};

// Commit, whichever shell this ability lands on: a cast that calls for no save
// of its own (Targeting Beacon, mode 'none') keeps the classic footer button,
// while a target-save cast is a RollSheet whose single pill is the commit
// (#1689 — no caster die, so there is nothing to tap first).
const cast = () => {
  const classic = screen.queryByLabelText('confirm-cast');
  fireEvent.click(classic || document.querySelector('.rs-pill'));
};

beforeEach(() => { vi.clearAllMocks(); });

describe('UseAbilityModal — arming deferred payloads', () => {
  it('derives the payload DC from its own defense when the cast calls for no save (#1617)', () => {
    render(<UseAbilityModal {...props} ability={beacon} />);
    cast();

    expect(mockAddArmedPayload).toHaveBeenCalledTimes(1);
    const armed = mockAddArmedPayload.mock.calls[0][0];
    expect(armed).toMatchObject({
      payloadId: 'targeting-beacon-explosion',
      defense: 'basic Reflex',
      abilityName: 'Targeting Beacon',
      casterId: 'char-a',
      // The whole fix: the caster's spell DC, not the cast's absence of one.
      dc: SPELL_DC,
    });
    // …and the spell still resolves nothing at cast.
    expect(mockAddSaveRequest).not.toHaveBeenCalled();
  });

  it("uses the cast's own DC when the cast really did call for a save", () => {
    // Unchanged behaviour: the cast DC already carries the variant dcDelta (#215)
    // and the actor's netting, so it wins whenever it exists.
    render(<UseAbilityModal {...props} ability={marionettist} />);
    cast();
    expect(mockAddArmedPayload.mock.calls[0][0].dc).toBe(SPELL_DC);
    expect(mockAddSaveRequest).toHaveBeenCalledWith(expect.objectContaining({ dc: SPELL_DC }));
  });

  it('leaves a save-less persistent payload without a DC', () => {
    // Autumn's Howl's shape: no defense on the payload, so there is nothing to
    // roll against and no DC to invent.
    const howl = {
      name: "Autumn's Howl",
      actions: 'Two Actions',
      armedPayloads: [{
        id: 'autumns-howl-wind-bleed',
        label: 'Ending a turn in the wind',
        trigger: 'a creature ends its turn inside the wind',
        repeatable: true,
        damageData: { riders: [{ id: 'r', label: 'p', persistent: { dice: '1d6', type: 'piercing' } }] },
      }],
    };
    render(<UseAbilityModal {...props} ability={howl} />);
    cast();
    expect(mockAddArmedPayload.mock.calls[0][0].dc).toBeNull();
  });

  it('carries severityFromSave onto the payload (#1618)', () => {
    render(<UseAbilityModal {...props} ability={marionettist} />);
    cast();
    expect(mockAddArmedPayload.mock.calls[0][0]).toMatchObject({
      payloadId: 'gruesome-marionettist-bleed',
      severityFromSave: true,
      repeatable: true,
    });
  });

  it('carries an authored field the arming block has never heard of', () => {
    // The regression guard for the fixed allow-list that lost severityFromSave:
    // the authored payload travels whole, so the next field added to the content
    // vocabulary arrives without touching this block.
    const invented = {
      ...beacon,
      armedPayloads: [{ ...beacon.armedPayloads[0], someFutureField: 'arrives intact' }],
    };
    render(<UseAbilityModal {...props} ability={invented} />);
    cast();
    expect(mockAddArmedPayload.mock.calls[0][0].someFutureField).toBe('arrives intact');
    // The authored id lands as `payloadId`; the encounter assigns the real `id`.
    expect(mockAddArmedPayload.mock.calls[0][0].id).toBeUndefined();
  });

  it('announces the trigger so the table knows something is pending', () => {
    render(<UseAbilityModal {...props} ability={beacon} />);
    cast();
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Beacon explosion is armed'),
    }));
  });
});
