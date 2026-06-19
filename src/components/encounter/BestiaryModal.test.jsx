import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BestiaryModal from './BestiaryModal';

// ── Static mocks ─────────────────────────────────────────────────────────────

vi.mock('../shared/TraitTag', () => {
  const TraitTag = ({ trait }) => <span data-testid="trait-tag">{trait}</span>;
  return { default: TraitTag };
});

vi.mock('./RecallKnowledgeResolver', () => {
  const RecallKnowledgeResolver = ({ onDone }) => (
    <div data-testid="rkr-stub">
      <button onClick={onDone}>Cancel</button>
    </div>
  );
  return { default: RecallKnowledgeResolver };
});

// ── Mutable hook state ────────────────────────────────────────────────────────

let mockRecord = {};
const mockClearLock = vi.fn();

vi.mock('../../hooks/useRecallKnowledge', () => ({
  useRecallKnowledge: () => ({
    recordFor: (entryId) => mockRecord[entryId] || {
      identity: false,
      description: false,
      hp: false,
      ac: false,
      perception: false,
      speed: false,
      saves: { fortitude: false, reflex: false, will: false },
      iwr: { immunities: false, resistances: false, weaknesses: false },
      weaknessesRevealed: {},
      lockedOut: {},
      history: [],
    },
    resolve:     vi.fn(),
    mergeRecord: vi.fn(),
    clearLock:   mockClearLock,
  }),
}));

let mockExploit = {};
vi.mock('../../hooks/useExploitVulnerability', () => ({
  useExploitVulnerability: () => ({
    exploitFor: (charId) => mockExploit[charId] ?? null,
    apply: vi.fn(),
    clear: vi.fn(),
  }),
}));

let mockIsGm = false;
vi.mock('../../hooks/useGmAuth', () => ({
  useGmAuth: () => ({ loading: false, isGm: mockIsGm, email: null }),
}));

let mockMonsters = [];
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [], monsters: mockMonsters }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GOBLIN_KEY = 'Compendium.pf2e.bestiary.Actor.gob-keyed';
const goblin = {
  entryId: 'e1',
  kind: 'enemy',
  name: 'Goblin Warrior',
  bestiary: {
    img: 'tokens/goblin.webp',
    level: 1,
    rarity: 'common',
    traits: ['goblin', 'humanoid'],
    perception: 5,
    speed: 30,
    hp: { current: 16, max: 20 },
    description: 'A sneaky goblin warrior.',
  },
  defenses: {
    ac: 17,
    saves: { fortitude: 4, reflex: 6, will: 2 },
    immunities: ['fire'],
    resistances: [],
    weaknesses: [{ type: 'cold', value: 2 }],
  },
};

const troll = {
  entryId: 'e2',
  kind: 'enemy',
  name: 'Cave Troll',
  bestiary: {
    img: null,
    level: 5,
    rarity: 'uncommon',
    traits: ['troll', 'giant'],
    perception: 8,
    speed: 30,
    hp: { current: 80, max: 100 },
    description: 'A hulking cave troll.',
  },
  defenses: {
    ac: 19,
    saves: { fortitude: 14, reflex: 8, will: 7 },
    immunities: [],
    resistances: [{ type: 'physical', value: 5 }],
    weaknesses: [],
  },
};

const noStatBlock = {
  entryId: 'e3',
  kind: 'enemy',
  name: 'Mysterious Figure',
};

function renderModal(props = {}) {
  return render(
    <BestiaryModal
      isOpen={true}
      onClose={vi.fn()}
      enemies={[goblin, troll]}
      themeColor="#c0440e"
      actingCharId="c1"
      actingCharName="Vex"
      {...props}
    />
  );
}

beforeEach(() => {
  mockRecord = {};
  mockExploit = {};
  mockIsGm   = false;
  mockMonsters = [];
  mockClearLock.mockClear();
});

// ── Redaction (default — no reveals) ─────────────────────────────────────────

describe('BestiaryModal — default redacted state', () => {
  test('renders nothing when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText('Goblin Warrior')).not.toBeInTheDocument();
  });

  test('shows empty state when enemies array is empty', () => {
    renderModal({ enemies: [] });
    expect(screen.getByText(/No enemies/i)).toBeInTheDocument();
  });

  test('image is visible even when redacted', () => {
    renderModal({ enemies: [goblin] });
    const img = screen.getAllByRole('img').find((el) => el.src?.includes('goblin'));
    expect(img).toBeTruthy();
  });

  test('name in detail pane is redacted (not shown as text)', () => {
    renderModal({ enemies: [goblin] });
    const detail = screen.getByTestId('bm-detail');
    expect(detail).not.toHaveTextContent('Goblin Warrior');
  });

  test('AC is redacted — value 17 not shown', () => {
    renderModal({ enemies: [goblin] });
    const detail = screen.getByTestId('bm-detail');
    expect(detail).not.toHaveTextContent('17');
  });

  test('description is redacted — text not shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByText('A sneaky goblin warrior.')).not.toBeInTheDocument();
  });

  test('RK DC box is hidden when identity not revealed', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByTestId('bm-rk-dc')).not.toBeInTheDocument();
  });

  test('Recall Knowledge button is present and enabled', () => {
    renderModal({ enemies: [goblin] });
    const btn = screen.getByRole('button', { name: /Recall Knowledge/i });
    expect(btn).not.toBeDisabled();
  });

  test('Exploit Vulnerability trigger is no longer in the Bestiary modal (#454)', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByTestId('bm-ev-btn')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exploit Vulnerability/i })).not.toBeInTheDocument();
  });

  test('list item name is redacted', () => {
    renderModal();
    const listItems = screen.getAllByRole('option');
    listItems.forEach((item) => {
      expect(item).not.toHaveTextContent('Goblin Warrior');
      expect(item).not.toHaveTextContent('Cave Troll');
    });
  });

  test('degrades gracefully when bestiary is absent', () => {
    renderModal({ enemies: [noStatBlock] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('Mysterious Figure');
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('No Foundry stat block available');
  });
});

// ── After success reveal (identity + description + hp + one fact) ─────────────

describe('BestiaryModal — after success (identity + description + hp + reflex)', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        identity: true,
        description: true,
        hp: true,
        ac: false,
        perception: false,
        speed: false,
        saves: { fortitude: false, reflex: true, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
        weaknessesRevealed: {},
        lockedOut: {},
        history: [],
      },
    };
  });

  test('name is revealed', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('Goblin Warrior');
  });

  test('description is revealed', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByText('A sneaky goblin warrior.')).toBeInTheDocument();
  });

  test('HP is revealed', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('16 / 20');
  });

  test('reflex save is revealed (value +6)', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('+6');
  });

  test('fortitude save is still redacted', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).not.toHaveTextContent('+4');
  });

  test('AC is still redacted — value 17 not shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).not.toHaveTextContent('17');
  });

  test('immunities still redacted — no "fire" text', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByText(/fire/i)).not.toBeInTheDocument();
  });

  test('RK DC box shown once identity is revealed', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-rk-dc')).toHaveTextContent('15');
  });

  test('list item name is shown when identity revealed', () => {
    renderModal();
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Goblin Warrior');
  });
});

// ── After success with AC revealed ───────────────────────────────────────────

describe('BestiaryModal — after success (identity + ac revealed)', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        identity: true,
        description: true,
        hp: true,
        ac: true,
        perception: false,
        speed: false,
        saves: { fortitude: false, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
        weaknessesRevealed: {},
        lockedOut: {},
        history: [],
      },
    };
  });

  test('AC value 17 is shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('17');
  });

  test('saves are still redacted', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).not.toHaveTextContent('+6');
  });
});

// ── Partial weakness reveal (Exploit Vulnerability success) ───────────────────

describe('BestiaryModal — partial weakness reveal from Exploit Vulnerability', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        identity: true,
        description: true,
        hp: true,
        ac: false,
        perception: false,
        speed: false,
        saves: { fortitude: false, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
        weaknessesRevealed: { cold: true },
        lockedOut: {},
        history: [],
      },
    };
  });

  test('revealed weakness type is shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('cold');
  });

  test('immunities are still redacted', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByText(/fire/i)).not.toBeInTheDocument();
  });
});

// ── After success with full IWR weaknesses choice ────────────────────────────

describe('BestiaryModal — after success (weaknesses category revealed)', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        identity: true,
        description: true,
        hp: true,
        ac: false,
        perception: false,
        speed: false,
        saves: { fortitude: false, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: true },
        weaknessesRevealed: {},
        lockedOut: {},
        history: [],
      },
    };
  });

  test('all weakness values are shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('cold');
  });

  test('immunities still redacted', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByText(/fire/i)).not.toBeInTheDocument();
  });
});

// ── After crit success (identity + 2 picks) ──────────────────────────────────

describe('BestiaryModal — after critical success (identity + AC + fortitude)', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        identity: true,
        description: true,
        hp: true,
        ac: true,
        perception: false,
        speed: false,
        saves: { fortitude: true, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
        weaknessesRevealed: {},
        lockedOut: {},
        history: [],
      },
    };
  });

  test('name in detail pane is shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('Goblin Warrior');
  });

  test('AC is shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('17');
  });

  test('fortitude is shown (+4)', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('+4');
  });

  test('reflex is still redacted (+6 not shown)', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).not.toHaveTextContent('+6');
  });

  test('description is shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByText('A sneaky goblin warrior.')).toBeInTheDocument();
  });

  test('RK DC box is shown (level 1 common → 15)', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-rk-dc')).toHaveTextContent('15');
  });
});

// ── Active exploit badge ──────────────────────────────────────────────────────

describe('BestiaryModal — active exploit badge', () => {
  test('badge shown when this enemy is the current exploit target', () => {
    mockExploit = {
      c1: {
        targetEntryId: 'e1',
        targetName: 'Goblin Warrior',
        type: 'antithesis',
        weaknessType: null,
        value: 4,
        magical: true,
      },
    };
    renderModal({ enemies: [goblin] });
    const badge = screen.getByTestId('bm-exploit-badge');
    expect(badge).toHaveTextContent('Personal Antithesis');
    expect(badge).toHaveTextContent('weakness 4');
    expect(badge).toHaveTextContent('magical');
  });

  test('badge not shown when a different enemy is the target', () => {
    mockExploit = {
      c1: {
        targetEntryId: 'e2',
        targetName: 'Cave Troll',
        type: 'antithesis',
        weaknessType: null,
        value: 4,
        magical: false,
      },
    };
    renderModal({ enemies: [goblin] });
    expect(screen.queryByTestId('bm-exploit-badge')).not.toBeInTheDocument();
  });
});

// ── Locked out (crit failure) ─────────────────────────────────────────────────

describe('BestiaryModal — locked out character', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        identity: false,
        description: false,
        hp: false,
        ac: false,
        perception: false,
        speed: false,
        saves: { fortitude: false, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
        weaknessesRevealed: {},
        lockedOut: { c1: true },
        history: [],
      },
    };
  });

  test('Recall Knowledge button is disabled for locked character', () => {
    renderModal({ enemies: [goblin], actingCharId: 'c1' });
    const btn = screen.getByRole('button', { name: /Recall Knowledge/i });
    expect(btn).toBeDisabled();
  });

  test('locked notice is shown', () => {
    renderModal({ enemies: [goblin], actingCharId: 'c1' });
    expect(screen.getByTestId('bm-rk-locked')).toBeInTheDocument();
  });

  test('RK button is NOT disabled for a different character', () => {
    renderModal({ enemies: [goblin], actingCharId: 'c2' });
    const btn = screen.getByRole('button', { name: /Recall Knowledge/i });
    expect(btn).not.toBeDisabled();
  });

  test('GM sees the unlock control', () => {
    mockIsGm = true;
    renderModal({ enemies: [goblin], actingCharId: 'c2' });
    expect(screen.getByTestId('bm-rk-gm-locks')).toBeInTheDocument();
  });

  test('non-GM does not see the unlock control', () => {
    mockIsGm = false;
    renderModal({ enemies: [goblin], actingCharId: 'c2' });
    expect(screen.queryByTestId('bm-rk-gm-locks')).not.toBeInTheDocument();
  });

  test('GM clicking unlock calls clearLock', () => {
    mockIsGm = true;
    renderModal({ enemies: [goblin], actingCharId: 'c2' });
    const unlockBtn = screen.getByRole('button', { name: /Clear lockout for c1/i });
    fireEvent.click(unlockBtn);
    expect(mockClearLock).toHaveBeenCalledWith('e1', 'c1');
  });
});

// ── Navigation and switching enemies ─────────────────────────────────────────

describe('BestiaryModal — navigation', () => {
  test('shows first enemy detail by default', () => {
    mockRecord = {
      e1: {
        identity: true, description: true, hp: true, ac: true, perception: true, speed: true,
        saves: { fortitude: true, reflex: true, will: true },
        iwr: { immunities: true, resistances: true, weaknesses: true },
        weaknessesRevealed: {}, lockedOut: {}, history: [],
      },
    };
    renderModal();
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('Goblin Warrior');
  });

  test('switches detail when a different enemy is clicked', () => {
    mockRecord = {
      e1: {
        identity: true, description: true, hp: true, ac: true, perception: true, speed: true,
        saves: { fortitude: true, reflex: true, will: true },
        iwr: { immunities: true, resistances: true, weaknesses: true },
        weaknessesRevealed: {}, lockedOut: {}, history: [],
      },
      e2: {
        identity: true, description: true, hp: true, ac: true, perception: true, speed: true,
        saves: { fortitude: true, reflex: true, will: true },
        iwr: { immunities: true, resistances: true, weaknesses: true },
        weaknessesRevealed: {}, lockedOut: {}, history: [],
      },
    };
    renderModal();
    const options = screen.getAllByRole('option');
    fireEvent.click(options[1]);
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('Cave Troll');
  });
});

// ── Same-type dedupe + shared reveal (creatureKey) ───────────────────────────

describe('BestiaryModal — same-type dedupe', () => {
  // Three goblins sharing a creatureKey but distinct per-token entryId/HP.
  const goblinKey = 'Compendium.pf2e.bestiary.Actor.gob';
  const mkGoblin = (entryId, name, hp) => ({
    ...goblin,
    entryId,
    name,
    creatureKey: goblinKey,
    bestiary: { ...goblin.bestiary, hp },
  });
  const g1 = mkGoblin('e1', 'Goblin Warrior 1', { current: 16, max: 20 });
  const g2 = mkGoblin('e2', 'Goblin Warrior 2', { current: 8, max: 20 });
  const g3 = mkGoblin('e3', 'Goblin Warrior 3', { current: 20, max: 20 });

  test('three same-key goblins collapse to one row with a ×3 badge', () => {
    renderModal({ enemies: [g1, g2, g3] });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  test('one shared record reveals identity for the whole group', () => {
    mockRecord = {
      [goblinKey]: {
        identity: true, description: true, hp: false,
        ac: false, perception: false, speed: false,
        saves: { fortitude: false, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
        weaknessesRevealed: {}, lockedOut: {}, history: [],
      },
    };
    renderModal({ enemies: [g1, g2, g3] });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Goblin Warrior 1');
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('A sneaky goblin warrior.');
  });

  test('per-token HP is listed individually once HP revealed', () => {
    mockRecord = {
      [goblinKey]: {
        identity: true, description: true, hp: true,
        ac: false, perception: false, speed: false,
        saves: { fortitude: false, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
        weaknessesRevealed: {}, lockedOut: {}, history: [],
      },
    };
    renderModal({ enemies: [g1, g2, g3] });
    const hpList = screen.getByTestId('bm-hp-list');
    expect(hpList).toHaveTextContent('16 / 20');
    expect(hpList).toHaveTextContent('8 / 20');
    expect(hpList).toHaveTextContent('20 / 20');
  });

  test('per-token HP is redacted until HP revealed', () => {
    renderModal({ enemies: [g1, g2, g3] });
    const hpList = screen.getByTestId('bm-hp-list');
    expect(hpList).not.toHaveTextContent('16 / 20');
  });

  test('distinct creatures remain distinct rows', () => {
    renderModal({ enemies: [g1, troll] });
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  test('null-key creatures stay separate (fall back to entryId)', () => {
    // goblin/troll fixtures have no creatureKey → keyed by entryId, no collapse.
    renderModal({ enemies: [goblin, troll] });
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});

// ── Resolver opens inline ─────────────────────────────────────────────────────

describe('BestiaryModal — resolver flow', () => {
  test('clicking Recall Knowledge opens the resolver stub', () => {
    renderModal({ enemies: [goblin] });
    fireEvent.click(screen.getByRole('button', { name: /Recall Knowledge/i }));
    expect(screen.getByTestId('rkr-stub')).toBeInTheDocument();
  });

  test('resolver cancel hides the resolver', () => {
    renderModal({ enemies: [goblin] });
    fireEvent.click(screen.getByRole('button', { name: /Recall Knowledge/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByTestId('rkr-stub')).not.toBeInTheDocument();
  });
});

// ── Monster description overrides (issue #194) ───────────────────────────────

describe('BestiaryModal — description override merge', () => {
  // Goblin with a stable creatureKey.
  const goblinKeyed = {
    ...goblin,
    creatureKey: GOBLIN_KEY,
  };

  const revealedRecord = {
    [GOBLIN_KEY]: {
      identity: true, description: true, hp: true,
      ac: false, perception: false, speed: false,
      saves: { fortitude: false, reflex: false, will: false },
      iwr: { immunities: false, resistances: false, weaknesses: false },
      weaknessesRevealed: {}, lockedOut: {}, history: [],
    },
  };

  beforeEach(() => {
    mockRecord = revealedRecord;
  });

  test('without override, shows imported description after reveal', () => {
    renderModal({ enemies: [goblinKeyed] });
    expect(screen.getByText('A sneaky goblin warrior.')).toBeInTheDocument();
  });

  test('with override, shows overridden text instead of imported', () => {
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'A small creature lurking in the dark.' }];
    renderModal({ enemies: [goblinKeyed] });
    expect(screen.queryByText('A sneaky goblin warrior.')).not.toBeInTheDocument();
    expect(screen.getByText('A small creature lurking in the dark.')).toBeInTheDocument();
  });

  test('empty-string override redacts — no description shown', () => {
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: '' }];
    renderModal({ enemies: [goblinKeyed] });
    expect(screen.queryByText('A sneaky goblin warrior.')).not.toBeInTheDocument();
    expect(screen.queryByRole('paragraph', { name: /bm-description/ })).not.toBeInTheDocument();
  });

  test('override does not affect a creature with a different creatureKey', () => {
    mockMonsters = [{ id: 'some-other-key', name: 'Other', descriptionOverride: 'Overridden other.' }];
    renderModal({ enemies: [goblinKeyed] });
    expect(screen.getByText('A sneaky goblin warrior.')).toBeInTheDocument();
  });

  test('override is still gated behind RK description reveal', () => {
    mockRecord = {};  // no reveals
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'Override text.' }];
    renderModal({ enemies: [goblinKeyed] });
    // Description not revealed — neither override nor imported shows as text.
    expect(screen.queryByText('Override text.')).not.toBeInTheDocument();
  });

  test('no-creatureKey creature ignores monster overrides', () => {
    mockMonsters = [{ id: 'e1', name: 'Goblin Warrior', descriptionOverride: 'Should not show.' }];
    // goblin (no creatureKey) — record keyed by entryId 'e1'
    mockRecord = {
      e1: {
        identity: true, description: true, hp: true,
        ac: false, perception: false, speed: false,
        saves: { fortitude: false, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
        weaknessesRevealed: {}, lockedOut: {}, history: [],
      },
    };
    renderModal({ enemies: [goblin] });
    expect(screen.getByText('A sneaky goblin warrior.')).toBeInTheDocument();
    expect(screen.queryByText('Should not show.')).not.toBeInTheDocument();
  });
});
