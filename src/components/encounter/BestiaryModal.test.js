import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BestiaryModal from './BestiaryModal';

// ── Static mocks ─────────────────────────────────────────────────────────────

jest.mock('../shared/TraitTag', () => {
  const TraitTag = ({ trait }) => <span data-testid="trait-tag">{trait}</span>;
  return TraitTag;
});

// RecallKnowledgeResolver — renders a placeholder stub so BestiaryModal renders
// correctly without wiring its own deep dependency chain.
jest.mock('./RecallKnowledgeResolver', () => {
  const RecallKnowledgeResolver = ({ onDone }) => (
    <div data-testid="rkr-stub">
      <button onClick={onDone}>Cancel</button>
    </div>
  );
  return RecallKnowledgeResolver;
});

// ── Mutable hook state ────────────────────────────────────────────────────────

let mockRecord = {};
const mockClearLock = jest.fn();

jest.mock('../../hooks/useRecallKnowledge', () => ({
  useRecallKnowledge: () => ({
    recordFor: (entryId) => mockRecord[entryId] || {
      all: false,
      description: false,
      hp: false,
      saves: { fortitude: false, reflex: false, will: false },
      iwr: { immunities: false, resistances: false, weaknesses: false },
      lockedOut: {},
      history: [],
    },
    resolve:   jest.fn(),
    clearLock: mockClearLock,
  }),
}));

let mockIsGm = false;
jest.mock('../../hooks/useGmAuth', () => ({
  useGmAuth: () => ({ loading: false, isGm: mockIsGm, email: null }),
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
    ac: 17,  // intentionally different from hp values so absence can be asserted uniquely
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
  mockIsGm   = false;
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
    // Name text should NOT be present — it's replaced by a .bm-redacted bar
    expect(detail).not.toHaveTextContent('Goblin Warrior');
  });

  test('AC is redacted — value 16 not shown', () => {
    renderModal({ enemies: [goblin] });
    const detail = screen.getByTestId('bm-detail');
    expect(detail).not.toHaveTextContent('16');
  });

  test('description is redacted — text not shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByText('A sneaky goblin warrior.')).not.toBeInTheDocument();
  });

  test('RK DC box is hidden when not fully revealed', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByTestId('bm-rk-dc')).not.toBeInTheDocument();
  });

  test('Recall Knowledge button is present and enabled', () => {
    renderModal({ enemies: [goblin] });
    const btn = screen.getByRole('button', { name: /Recall Knowledge/i });
    expect(btn).not.toBeDisabled();
  });

  test('list item name is redacted', () => {
    renderModal();
    // No list button should show text "Goblin Warrior" or "Cave Troll"
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

// ── After success reveal (description + hp + one save) ───────────────────────

describe('BestiaryModal — after success (description + hp + reflex)', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        all: false,
        description: true,
        hp: true,
        saves: { fortitude: false, reflex: true, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
        lockedOut: {},
        history: [],
      },
    };
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
    // +4 should not appear
    expect(screen.getByTestId('bm-detail')).not.toHaveTextContent('+4');
  });

  test('AC is still redacted — value 17 not shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).not.toHaveTextContent('17'); // AC 17
  });

  test('immunities still redacted — no "fire" text', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByText(/fire/i)).not.toBeInTheDocument();
  });
});

// ── After success reveal with IWR choice ─────────────────────────────────────

describe('BestiaryModal — after success (weaknesses revealed)', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        all: false,
        description: true,
        hp: true,
        saves: { fortitude: false, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: true },
        lockedOut: {},
        history: [],
      },
    };
  });

  test('weaknesses value is shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('cold');
  });

  test('immunities still redacted', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.queryByText(/fire/i)).not.toBeInTheDocument();
  });
});

// ── After crit success (everything revealed) ─────────────────────────────────

describe('BestiaryModal — after critical success (all revealed)', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        all: true,
        description: true,
        hp: true,
        saves: { fortitude: true, reflex: true, will: true },
        iwr: { immunities: true, resistances: true, weaknesses: true },
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
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('17'); // AC 17
  });

  test('description is shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByText('A sneaky goblin warrior.')).toBeInTheDocument();
  });

  test('RK DC box is shown (level 1 common → 15)', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-rk-dc')).toHaveTextContent('15');
  });

  test('all three saves are shown', () => {
    renderModal({ enemies: [goblin] });
    const detail = screen.getByTestId('bm-detail');
    expect(detail).toHaveTextContent('+4');  // Fort
    expect(detail).toHaveTextContent('+6');  // Ref
    expect(detail).toHaveTextContent('+2');  // Will
  });

  test('immunities shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('fire');
  });

  test('weaknesses shown', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('cold');
  });

  test('list item name is shown when all revealed', () => {
    renderModal();
    // Goblin is first and is fully revealed
    const listItems = screen.getAllByRole('option');
    expect(listItems[0]).toHaveTextContent('Goblin Warrior');
  });
});

// ── Locked out (crit failure) ─────────────────────────────────────────────────

describe('BestiaryModal — locked out character', () => {
  beforeEach(() => {
    mockRecord = {
      e1: {
        all: false,
        description: false,
        hp: false,
        saves: { fortitude: false, reflex: false, will: false },
        iwr: { immunities: false, resistances: false, weaknesses: false },
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
    mockRecord = { e1: { all: true, description: true, hp: true, saves: { fortitude: true, reflex: true, will: true }, iwr: { immunities: true, resistances: true, weaknesses: true }, lockedOut: {}, history: [] } };
    renderModal();
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('Goblin Warrior');
  });

  test('switches detail when a different enemy is clicked', () => {
    mockRecord = {
      e1: { all: true, description: true, hp: true, saves: { fortitude: true, reflex: true, will: true }, iwr: { immunities: true, resistances: true, weaknesses: true }, lockedOut: {}, history: [] },
      e2: { all: true, description: true, hp: true, saves: { fortitude: true, reflex: true, will: true }, iwr: { immunities: true, resistances: true, weaknesses: true }, lockedOut: {}, history: [] },
    };
    renderModal();
    // The troll list item has no text content while redacted, but aria-label on the button is still present
    // Click the second list item (troll)
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
