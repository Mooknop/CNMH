import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BestiaryModal from './BestiaryModal';

// ── Static mocks ─────────────────────────────────────────────────────────────

jest.mock('../shared/TraitTag', () => {
  const TraitTag = ({ trait }) => <span data-testid="trait-tag">{trait}</span>;
  return TraitTag;
});

jest.mock('./RecallKnowledgeResolver', () => {
  const RecallKnowledgeResolver = ({ onDone }) => (
    <div data-testid="rkr-stub">
      <button onClick={onDone}>Cancel</button>
    </div>
  );
  return RecallKnowledgeResolver;
});

jest.mock('./ExploitVulnerabilityResolver', () => {
  const ExploitVulnerabilityResolver = ({ onDone }) => (
    <div data-testid="evr-stub">
      <button onClick={onDone}>Cancel</button>
    </div>
  );
  return ExploitVulnerabilityResolver;
});

// ── Mutable hook state ────────────────────────────────────────────────────────

let mockRecord = {};
const mockClearLock = jest.fn();

jest.mock('../../hooks/useRecallKnowledge', () => ({
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
    resolve:     jest.fn(),
    mergeRecord: jest.fn(),
    clearLock:   mockClearLock,
  }),
}));

let mockExploit = {};
jest.mock('../../hooks/useExploitVulnerability', () => ({
  useExploitVulnerability: () => ({
    exploitFor: (charId) => mockExploit[charId] ?? null,
    apply: jest.fn(),
    clear: jest.fn(),
  }),
}));

let mockIsGm = false;
jest.mock('../../hooks/useGmAuth', () => ({
  useGmAuth: () => ({ loading: false, isGm: mockIsGm, email: null }),
}));

// Acting character — non-Thaumaturge by default.
let mockCharFlags = { isThaumaturge: false };
jest.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [] }),
}));
jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => ({ flags: mockCharFlags }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
      onClose={jest.fn()}
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
  mockCharFlags = { isThaumaturge: false };
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

  test('Exploit Vulnerability button is NOT shown for non-Thaumaturge', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByTestId('bm-ev-btn')).not.toBeInTheDocument();
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

// ── Exploit Vulnerability button (Thaumaturge only) ──────────────────────────

describe('BestiaryModal — Exploit Vulnerability button', () => {
  test('EV button shown for Thaumaturge', () => {
    mockCharFlags = { isThaumaturge: true };
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-ev-btn')).toBeInTheDocument();
  });

  test('EV button not shown for non-Thaumaturge', () => {
    mockCharFlags = { isThaumaturge: false };
    renderModal({ enemies: [goblin] });
    expect(screen.queryByTestId('bm-ev-btn')).not.toBeInTheDocument();
  });

  test('clicking EV button opens the EV resolver stub', () => {
    mockCharFlags = { isThaumaturge: true };
    renderModal({ enemies: [goblin] });
    fireEvent.click(screen.getByTestId('bm-ev-btn'));
    expect(screen.getByTestId('evr-stub')).toBeInTheDocument();
  });

  test('EV resolver cancel hides the resolver', () => {
    mockCharFlags = { isThaumaturge: true };
    renderModal({ enemies: [goblin] });
    fireEvent.click(screen.getByTestId('bm-ev-btn'));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByTestId('evr-stub')).not.toBeInTheDocument();
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
