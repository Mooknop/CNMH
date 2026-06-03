import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BestiaryModal from './BestiaryModal';

// TraitTag reads from TraitContext; mock it to avoid wiring the full context.
jest.mock('../shared/TraitTag', () => {
  const TraitTag = ({ trait }) => <span data-testid="trait-tag">{trait}</span>;
  return TraitTag;
});

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
    ac: 16,
    saves: { fortitude: 4, reflex: 6, will: 2 },
    immunities: [],
    resistances: [],
    weaknesses: [{ type: 'fire', value: 2 }],
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
      {...props}
    />
  );
}

describe('BestiaryModal', () => {
  test('renders enemy names in the list', () => {
    renderModal();
    // Each name appears in the list button AND (for the focused enemy) the detail pane.
    expect(screen.getAllByText('Goblin Warrior').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cave Troll').length).toBeGreaterThanOrEqual(1);
  });

  test('shows first enemy detail by default', () => {
    renderModal();
    const detail = screen.getByTestId('bm-detail');
    expect(detail).toHaveTextContent('Goblin Warrior');
  });

  test('switches detail view when a different enemy is clicked', () => {
    renderModal();
    // Click the list button for Cave Troll (first match is the list item).
    fireEvent.click(screen.getAllByText('Cave Troll')[0]);
    const detail = screen.getByTestId('bm-detail');
    expect(detail).toHaveTextContent('Cave Troll');
    expect(detail).not.toHaveTextContent('Goblin Warrior');
  });

  test('shows Recall Knowledge DC for common goblin (level 1 → 15)', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-rk-dc')).toHaveTextContent('15');
  });

  test('shows Recall Knowledge DC for uncommon troll (level 5 → 20 + 2 = 22)', () => {
    // Single enemy auto-focuses; no click needed.
    renderModal({ enemies: [troll] });
    expect(screen.getByTestId('bm-rk-dc')).toHaveTextContent('22');
  });

  test('renders traits via TraitTag', () => {
    renderModal({ enemies: [goblin] });
    const tags = screen.getAllByTestId('trait-tag');
    const tagTexts = tags.map((t) => t.textContent);
    expect(tagTexts).toContain('goblin');
    expect(tagTexts).toContain('humanoid');
  });

  test('displays AC from defenses', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('16');
  });

  test('displays weaknesses', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('fire');
  });

  test('displays resistances', () => {
    // Single enemy auto-focuses.
    renderModal({ enemies: [troll] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('physical');
  });

  test('shows description', () => {
    renderModal({ enemies: [goblin] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('A sneaky goblin warrior.');
  });

  test('degrades gracefully when bestiary is absent', () => {
    renderModal({ enemies: [noStatBlock] });
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('Mysterious Figure');
    expect(screen.getByTestId('bm-detail')).toHaveTextContent('No Foundry stat block available');
  });

  test('renders nothing when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText('Goblin Warrior')).not.toBeInTheDocument();
  });

  test('shows empty state when enemies array is empty', () => {
    renderModal({ enemies: [] });
    expect(screen.getByText(/No enemies/i)).toBeInTheDocument();
  });
});
