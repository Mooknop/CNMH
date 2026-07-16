import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SegmentedDeck from './SegmentedDeck';

const mockUseCharacter = vi.fn();
vi.mock('../../../hooks/useCharacter', () => ({
  useCharacter: (...args) => mockUseCharacter(...args),
}));

const mockUseFocusTarget = vi.fn();
vi.mock('../../../hooks/useFocusTarget', () => ({
  useFocusTarget: (...args) => mockUseFocusTarget(...args),
}));

const mockUseTurnState = vi.fn();
vi.mock('../../../hooks/useTurnState', () => ({
  useTurnState: (...args) => mockUseTurnState(...args),
}));

const mockUseAdjacency = vi.fn();
vi.mock('../../../hooks/useAdjacency', () => ({
  useAdjacency: (...args) => mockUseAdjacency(...args),
}));

const mockUseEncounter = vi.fn();
vi.mock('../../../hooks/useEncounter', () => ({
  useEncounter: (...args) => mockUseEncounter(...args),
}));

const mockUseChambers = vi.fn();
vi.mock('../../../hooks/useChambers', () => ({
  useChambers: (...args) => mockUseChambers(...args),
}));

// The fused header has its own suite (DeckHeader.test.jsx) — keep it inert here.
vi.mock('./DeckHeader', () => ({
  default: () => <div data-testid="deck-header" />,
}));

// TraitTag needs the TraitContext provider — inert chip here.
vi.mock('../../shared/TraitTag', () => ({
  default: ({ trait }) => <span>{trait}</span>,
}));

// The Spells segment has its own suite (SpellsSegment.test.jsx) — inert here.
vi.mock('./SpellsSegment', () => ({
  default: () => <div data-testid="spells-segment" />,
}));

// Tap a tile, then confirm it on the sheet (tap → confirm → resolver).
const tapAndConfirm = (tile) => {
  fireEvent.click(tile);
  fireEvent.click(screen.getByRole('button', { name: /^Confirm / }));
};

const baseModel = (overrides = {}) => ({
  actions: [],
  strikes: [{ name: 'Longsword', type: 'melee', actionCount: 1, attackMod: 9, damage: '1d8+4' }],
  reactions: [],
  freeActions: [],
  flags: { isThaumaturge: false },
  thaumaturge: null,
  ...overrides,
});

const character = { id: 'p1', name: 'Hero' };

// In-progress encounter where it IS / ISN'T Hero's turn.
const myTurnEncounter = {
  active: true,
  phase: 'in-progress',
  order: [{ entryId: 'e-hero', kind: 'pc', charId: 'p1' }],
  currentTurnIndex: 0,
};
const enemyTurnEncounter = {
  active: true,
  phase: 'in-progress',
  order: [{ entryId: 'e-ogre', kind: 'enemy', name: 'Ogre' }],
  currentTurnIndex: 0,
};

describe('SegmentedDeck', () => {
  beforeEach(() => {
    mockUseCharacter.mockReturnValue(baseModel());
    mockUseFocusTarget.mockReturnValue({ focusEnemy: null });
    mockUseTurnState.mockReturnValue({ turnState: { actionsSpent: 0, reactionAvailable: true, hasStartedFirstTurn: true } });
    mockUseAdjacency.mockReturnValue({ inReach: () => true });
    mockUseEncounter.mockReturnValue({ encounter: myTurnEncounter });
    mockUseChambers.mockReturnValue({ chambers: {} });
  });

  // ── Fused header ───────────────────────────────────────────────────────────

  it('renders the fused header only while an encounter is active', () => {
    const { rerender } = render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    expect(screen.getByTestId('deck-header')).toBeInTheDocument();
    mockUseEncounter.mockReturnValue({ encounter: null });
    rerender(<SegmentedDeck character={character} onUse={vi.fn()} />);
    expect(screen.queryByTestId('deck-header')).not.toBeInTheDocument();
  });

  // ── Segmented control ──────────────────────────────────────────────────────

  it('renders the segment tabs, defaulting to Strikes with the strike in hand', () => {
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    ['Strikes', 'Actions', 'React', 'Items'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Strikes' })).toHaveAttribute('aria-selected', 'true');
    const inHand = screen.getByRole('region', { name: 'In hand' });
    expect(within(inHand).getByRole('button', { name: 'Longsword' })).toBeInTheDocument();
  });

  it('shows the Spells tab only when onMagicOpen is provided, hosting the Spells segment', () => {
    const { rerender } = render(<SegmentedDeck character={character} onUse={vi.fn()} />);
    expect(screen.queryByRole('tab', { name: 'Spells' })).not.toBeInTheDocument();

    rerender(<SegmentedDeck character={character} onUse={vi.fn()} onMagicOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Spells' }));
    expect(screen.getByTestId('spells-segment')).toBeInTheDocument();
  });

  it('switching to Actions hides the strike and shows basics + skill groups', () => {
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    expect(screen.queryByRole('region', { name: 'In hand' })).not.toBeInTheDocument();
    const basics = screen.getByRole('region', { name: 'Basic Actions' });
    expect(within(basics).getByRole('button', { name: 'Stride' })).toBeInTheDocument();
    expect(within(basics).getByRole('button', { name: 'Trip' })).toBeInTheDocument();
    // Feint is skill-flavored → the Skill group, not basics.
    const skill = screen.getByRole('region', { name: 'Skill' });
    expect(within(skill).getByRole('button', { name: 'Feint' })).toBeInTheDocument();
  });

  it('tapping a tile opens the confirm sheet; confirming calls onUse with the raw action + cost', () => {
    const onUse = vi.fn();
    render(<SegmentedDeck character={character} encounterMode onUse={onUse} />);
    const inHand = screen.getByRole('region', { name: 'In hand' });
    fireEvent.click(within(inHand).getByRole('button', { name: 'Longsword' }));

    // Tap only previews — nothing resolves until confirm.
    expect(onUse).not.toHaveBeenCalled();
    const sheet = screen.getByRole('dialog', { name: 'Confirm Longsword' });
    expect(within(sheet).getByText('Roll attack')).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirm Longsword' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Longsword' }), 1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Cancel closes the sheet without resolving', () => {
    const onUse = vi.fn();
    render(<SegmentedDeck character={character} encounterMode onUse={onUse} />);
    const inHand = screen.getByRole('region', { name: 'In hand' });
    fireEvent.click(within(inHand).getByRole('button', { name: 'Longsword' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('the sheet previews the MAP-net bonus and the focused target', () => {
    mockUseFocusTarget.mockReturnValue({
      focusEnemy: { entryId: 'e1', kind: 'enemy', name: 'Goblin' },
    });
    mockUseTurnState.mockReturnValue({
      turnState: { actionsSpent: 1, attacksMade: 1, reactionAvailable: true, hasStartedFirstTurn: true },
    });
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    const inHand = screen.getByRole('region', { name: 'In hand' });
    fireEvent.click(within(inHand).getByRole('button', { name: 'Longsword' }));

    const sheet = screen.getByRole('dialog', { name: 'Confirm Longsword' });
    expect(within(sheet).getByText('MAP −5')).toBeInTheDocument();
    expect(within(sheet).getByText('+4')).toBeInTheDocument(); // attackMod 9 − 5
    expect(within(sheet).getByText('vs AC')).toBeInTheDocument(); // no reveal → no number
    expect(within(sheet).getByText('Goblin')).toBeInTheDocument();
    expect(within(sheet).getByText('1d8+4')).toBeInTheDocument();
  });

  // ── Off-turn behavior ──────────────────────────────────────────────────────

  it('auto-selects the React segment when it is not your turn', () => {
    mockUseEncounter.mockReturnValue({ encounter: enemyTurnEncounter });
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'React' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/opens automatically on others/)).toBeInTheDocument();
  });

  it('defaults to Strikes out of encounter (no auto-React)', () => {
    mockUseEncounter.mockReturnValue({ encounter: null });
    render(<SegmentedDeck character={character} onUse={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Strikes' })).toHaveAttribute('aria-selected', 'true');
  });

  // ── Strikes: held vs stowed ────────────────────────────────────────────────

  it('lists an unheld weapon under "Not in hand" and taps still route to onUse', () => {
    mockUseCharacter.mockReturnValue(baseModel({
      strikes: [
        { name: 'Longsword', type: 'melee', actionCount: 1, attackMod: 9, damage: '1d8+4' },
        { name: 'Longbow', type: 'ranged', actionCount: 1, attackMod: 7, damage: '1d8', active: false },
      ],
    }));
    const onUse = vi.fn();
    render(<SegmentedDeck character={character} encounterMode onUse={onUse} />);
    const stowed = screen.getByRole('region', { name: 'Not in hand' });
    tapAndConfirm(within(stowed).getByRole('button', { name: 'Longbow' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Longbow' }), 1);
    const inHand = screen.getByRole('region', { name: 'In hand' });
    expect(within(inHand).queryByRole('button', { name: 'Longbow' })).not.toBeInTheDocument();
  });

  // ── Capacity-weapon chamber track ──────────────────────────────────────────

  const crescent = {
    uid: 'cc-1',
    name: 'Crescent Cross',
    state: 'held1',
    strikes: [
      { name: 'Crescent Cross Blade', type: 'melee', actionCount: 1 },
      { name: 'Crescent Cross Bolt', type: 'ranged', capacity: 3, reload: 1, ammoType: 'bolt', traits: ['Capacity 3'] },
    ],
  };
  const crescentModel = (loaded) => baseModel({
    strikes: [
      { name: 'Crescent Cross Blade', type: 'melee', actionCount: 1, attackMod: 8, damage: '1d6+4', source: 'Crescent Cross' },
      {
        name: 'Crescent Cross Bolt', type: 'ranged', actionCount: 1, attackMod: 8, damage: '1d8',
        source: 'Crescent Cross', weaponUid: 'cc-1', capacity: 3, chambersLoaded: loaded,
        loaded: loaded > 0, active: loaded > 0,
      },
    ],
    inventory: [crescent],
  });
  const mockChambers = (loaded) => {
    mockUseChambers.mockReturnValue({
      chambers: { 'cc-1': { chambers: Array.from({ length: 3 }, (_, i) => (i < loaded ? { name: 'Bolt' } : null)), pointer: 0 } },
    });
  };

  it('cards a held capacity weapon: track, chamber notes, inline Reload → sheet → onUse', () => {
    mockUseCharacter.mockReturnValue(crescentModel(2));
    mockChambers(2);
    const onUse = vi.fn();
    render(<SegmentedDeck character={character} encounterMode onUse={onUse} />);

    const card = screen.getByRole('region', { name: 'Crescent Cross' });
    expect(within(card).getByText('Capacity 3')).toBeInTheDocument();
    expect(within(card).getByRole('meter', { name: '2 of 3 chambers loaded' })).toBeInTheDocument();
    expect(within(card).getByText('2/3')).toBeInTheDocument();
    // Both strikes live in the card (and NOT in the plain groups)…
    expect(within(card).getByRole('button', { name: 'Crescent Cross Blade' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Crescent Cross Bolt' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'In hand' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Not in hand' })).not.toBeInTheDocument();
    // …with chamber-use notes.
    expect(within(card).getByText(/spends 1 chamber/)).toBeInTheDocument();
    expect(within(card).getByText(/melee · no chamber/)).toBeInTheDocument();

    // Inline Reload previews through the sheet and routes to the reload flow.
    fireEvent.click(within(card).getByRole('button', { name: 'Reload Crescent Cross' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Reload Crescent Cross' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reload', weaponUid: 'cc-1' }), 1);
  });

  it('swaps the inline Reload for a Loaded badge when every chamber is full', () => {
    mockUseCharacter.mockReturnValue(crescentModel(3));
    mockChambers(3);
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    const card = screen.getByRole('region', { name: 'Crescent Cross' });
    expect(within(card).queryByRole('button', { name: /Reload/ })).not.toBeInTheDocument();
    expect(within(card).getByText('Loaded')).toBeInTheDocument();
  });

  it('an empty-chambered ranged strike stays in the card (not "Not in hand") with a reload cue', () => {
    mockUseCharacter.mockReturnValue(crescentModel(0));
    mockChambers(0);
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    const card = screen.getByRole('region', { name: 'Crescent Cross' });
    expect(within(card).getByText(/empty — reload to fire/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Not in hand' })).not.toBeInTheDocument();
  });

  // ── React segment ──────────────────────────────────────────────────────────

  it('shows reactions as rows and free actions as compact tiles, with rf costs', () => {
    mockUseCharacter.mockReturnValue(baseModel({
      reactions: [{ name: 'Shield Block', traits: [], description: 'Trigger: your shield is hit.' }],
      freeActions: [{ name: 'Quick Draw', traits: [] }],
    }));
    const onUse = vi.fn();
    render(<SegmentedDeck character={character} encounterMode onUse={onUse} />);
    fireEvent.click(screen.getByRole('tab', { name: 'React' }));

    const reactions = screen.getByRole('region', { name: 'Reactions' });
    const shieldBlock = within(reactions).getByRole('button', { name: 'Shield Block' });
    expect(within(shieldBlock).getByText('Trigger: your shield is hit.')).toBeInTheDocument();
    tapAndConfirm(shieldBlock);
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Shield Block' }), 'reaction');

    const free = screen.getByRole('region', { name: 'Free Actions' });
    tapAndConfirm(within(free).getByRole('button', { name: 'Quick Draw' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Quick Draw' }), 'free');
    // Basic encounter free actions land here too.
    expect(within(free).getByRole('button', { name: 'Delay' })).toBeInTheDocument();
  });

  // ── Skill actions fold-in (#260) ───────────────────────────────────────────

  it('renders player skill actions in the Actions tab and routes taps to onSkillAction', () => {
    const onSkillAction = vi.fn();
    const demoralize = { id: 'demoralize', name: 'Demoralize', skill: 'intimidation', actionCost: 1 };
    render(
      <SegmentedDeck
        character={character}
        encounterMode
        onUse={vi.fn()}
        skillActions={[demoralize]}
        onSkillAction={onSkillAction}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    const skill = screen.getByRole('region', { name: 'Skill' });
    tapAndConfirm(within(skill).getByRole('button', { name: 'Demoralize' }));
    expect(onSkillAction).toHaveBeenCalledWith(demoralize);
  });

  it('hides catalog twins of player skill actions (skill-action path wins)', () => {
    const trip = { id: 'trip', name: 'Trip', skill: 'athletics', actionCost: 1 };
    render(
      <SegmentedDeck character={character} encounterMode onUse={vi.fn()} skillActions={[trip]} onSkillAction={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    // Only the skill-action Trip remains — the basic catalog Trip is hidden.
    expect(screen.getAllByRole('button', { name: 'Trip' })).toHaveLength(1);
    const skill = screen.getByRole('region', { name: 'Skill' });
    expect(within(skill).getByRole('button', { name: 'Trip' })).toBeInTheDocument();
  });

  // ── Items segment ──────────────────────────────────────────────────────────

  it('lists consumables under Items with their draw cue', () => {
    mockUseCharacter.mockReturnValue(baseModel({
      inventory: [{ name: 'Healing Potion', state: 'worn', consumable: { kind: 'healing' } }],
    }));
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Items' }));
    const consumables = screen.getByRole('region', { name: 'Consumables' });
    const potion = within(consumables).getByRole('button', { name: 'Healing Potion' });
    expect(within(potion).getByText('draw +1')).toBeInTheDocument();
  });

  it('lists reload tiles under Reload & Gear', () => {
    mockUseCharacter.mockReturnValue(baseModel({
      inventory: [{
        uid: 'cc-1', name: 'Crescent Cross', state: 'held1',
        strikes: [{ name: 'Crescent Cross Bolt', type: 'ranged', capacity: 3, reload: 1, ammoType: 'bolt', traits: ['Capacity 3'] }],
      }],
    }));
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Items' }));
    const gear = screen.getByRole('region', { name: 'Reload & Gear' });
    expect(within(gear).getByRole('button', { name: 'Reload Crescent Cross' })).toBeInTheDocument();
  });

  // ── Right Now shortlist (#413) ─────────────────────────────────────────────

  it('renders the Right Now shortlist in encounter mode', () => {
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'Right now' });
    // With no focus the shortlist surfaces move/defense basics (e.g. Stride).
    expect(within(region).getByRole('button', { name: 'Stride' })).toBeInTheDocument();
  });

  it('hides the Right Now shortlist off-turn (no budget to spend)', () => {
    mockUseEncounter.mockReturnValue({ encounter: enemyTurnEncounter });
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Right now' })).not.toBeInTheDocument();
  });

  it('hides the Right Now shortlist out of encounter', () => {
    mockUseEncounter.mockReturnValue({ encounter: null });
    render(<SegmentedDeck character={character} onUse={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Right now' })).not.toBeInTheDocument();
  });

  it('with a focused foe, a strike surfaces in Right Now and tapping it calls onUse', () => {
    mockUseFocusTarget.mockReturnValue({
      focusEnemy: { entryId: 'e1', kind: 'enemy', name: 'Goblin' },
    });
    const onUse = vi.fn();
    render(<SegmentedDeck character={character} encounterMode onUse={onUse} />);
    const region = screen.getByRole('region', { name: 'Right now' });
    tapAndConfirm(within(region).getByRole('button', { name: 'Longsword' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Longsword' }), 1);
  });

  // ── Focus + reach gating (#411, #430, #434) ────────────────────────────────

  it('dims a target-needing tile with a "Tap a foe" hint when in encounter with no focus', () => {
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    const inHand = screen.getByRole('region', { name: 'In hand' });
    const tile = within(inHand).getByRole('button', { name: 'Longsword' });
    expect(within(tile).getByText('Tap a foe to target')).toBeInTheDocument();
    expect(within(tile).queryByText('+9 · 1d8+4')).not.toBeInTheDocument();
  });

  const focusedAlly = { focusEnemy: null, focusAlly: { entryId: 'e-ally', kind: 'pc', charId: 'Ashka' } };

  it('hard-disables an ally-support action when the focused ally is out of reach', () => {
    mockUseCharacter.mockReturnValue(baseModel({
      actions: [{ name: 'Battle Medicine', actionCount: 1, traits: ['Manipulate'], highlightSkill: 'medicine' }],
    }));
    mockUseFocusTarget.mockReturnValue(focusedAlly);
    mockUseAdjacency.mockReturnValue({ inReach: () => false });
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    const tile = screen.getByRole('button', { name: 'Battle Medicine' }); // dropped from Right Now when unreachable
    expect(tile).toBeDisabled();
    expect(within(tile).getByText('Move closer to target')).toBeInTheDocument();
  });

  it('hard-disables a healing consumable when the focused ally is out of reach (#434)', () => {
    mockUseCharacter.mockReturnValue(baseModel({
      inventory: [{ name: 'Healing Potion', state: 'worn', consumable: { kind: 'healing' } }],
    }));
    mockUseFocusTarget.mockReturnValue(focusedAlly);
    mockUseAdjacency.mockReturnValue({ inReach: () => false });
    render(<SegmentedDeck character={character} encounterMode onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Items' }));
    const tile = screen.getByRole('button', { name: 'Healing Potion' });
    expect(tile).toBeDisabled();
    expect(within(tile).getByText('Move closer to target')).toBeInTheDocument();
  });

  // ── Class & Signature extras (Exploit Vulnerability / Command …) ──────────

  it('renders extra actions as signature tiles; confirming runs their handler', () => {
    const run = vi.fn();
    const onUse = vi.fn();
    render(
      <SegmentedDeck
        character={character}
        encounterMode
        onUse={onUse}
        extraActions={[{
          id: 'exploit-vulnerability',
          name: 'Exploit Vulnerability',
          cost: 1,
          traits: ['Esoterica', 'Thaumaturge'],
          needsTarget: true,
          verb: 'Exploit',
          description: 'Find the best way to attack the creature.',
          run,
        }]}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    const signature = screen.getByRole('region', { name: 'Class & Signature' });
    const tile = within(signature).getByRole('button', { name: 'Exploit Vulnerability' });
    // Target-needing extra dims behind the focus cue like any tile.
    expect(within(tile).getByText('Tap a foe to target')).toBeInTheDocument();

    fireEvent.click(tile);
    const sheet = screen.getByRole('dialog', { name: 'Confirm Exploit Vulnerability' });
    expect(within(sheet).getByText('Exploit')).toBeInTheDocument(); // bespoke verb

    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirm Exploit Vulnerability' }));
    expect(run).toHaveBeenCalled();
    expect(onUse).not.toHaveBeenCalled(); // extras bypass handleUse entirely
  });

  it('hides a catalog twin of an extra action (the dedicated resolver wins)', () => {
    mockUseCharacter.mockReturnValue(baseModel({
      // The character sheet's own Exploit Vulnerability action entry.
      actions: [{ name: 'Exploit Vulnerability', actionCount: 1, traits: ['Esoterica'] }],
    }));
    render(
      <SegmentedDeck
        character={character}
        encounterMode
        onUse={vi.fn()}
        extraActions={[{ id: 'exploit-vulnerability', name: 'Exploit Vulnerability', cost: 1, run: vi.fn() }]}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    expect(screen.getAllByRole('button', { name: 'Exploit Vulnerability' })).toHaveLength(1);
  });
});
