import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemActivations from './ItemActivations';
import { renderWithProviders } from '../../test/renderWithProviders';

// TraitTag pulls TraitContext; stub it to the bare trait label (as ItemModal's
// own tests do).
vi.mock('./TraitTag', () => ({
  default: function DummyTraitTag({ trait }) {
    return <span data-testid="trait-tag">{typeof trait === 'string' ? trait : trait?.name || 'trait'}</span>;
  },
}));

describe('ItemActivations', () => {
  it('renders nothing when the item has no activations', () => {
    const { container } = render(<ItemActivations item={{ name: 'Plain' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a null item', () => {
    const { container } = render(<ItemActivations item={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the Actions section with name, action icons, traits, and description', () => {
    render(
      <ItemActivations
        item={{ actions: [{ name: 'Drink', actionCount: 1, traits: ['Manipulate'], description: 'Quaff it.' }] }}
      />
    );
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Drink')).toBeInTheDocument();
    expect(screen.getByText('Quaff it.')).toBeInTheDocument();
    expect(screen.getByText('Manipulate')).toBeInTheDocument();
  });

  it('renders Reactions with their trigger', () => {
    render(
      <ItemActivations item={{ reactions: [{ name: 'Parry', trigger: 'Enemy attacks.', description: 'Block.' }] }} />
    );
    expect(screen.getByText('Reactions')).toBeInTheDocument();
    expect(screen.getByText('Parry')).toBeInTheDocument();
    expect(screen.getByText('Enemy attacks.')).toBeInTheDocument();
  });

  it('renders Free Actions', () => {
    render(<ItemActivations item={{ freeActions: [{ name: 'Quick Draw', description: 'Draw.' }] }} />);
    expect(screen.getByText('Free Actions')).toBeInTheDocument();
    expect(screen.getByText('Quick Draw')).toBeInTheDocument();
  });

  it('stays display-only without a character, even when a frequencyRule is authored', () => {
    render(
      <ItemActivations
        item={{
          uid: 'cloak-1',
          actions: [
            {
              name: 'Make a Request',
              frequencyRule: { per: 'day', uses: 1 },
              description: 'Request.',
            },
          ],
        }}
      />
    );
    expect(screen.queryByTestId('item-activation-use')).not.toBeInTheDocument();
    expect(screen.queryByTestId('item-activation-locked')).not.toBeInTheDocument();
  });
});

// ── Use affordance (#916) — real provider stack: the REAL useFrequency /
// useSyncedState run against an in-memory session bus, so the ledger write
// shape and the gate flip are exercised for real, not through hook mocks.
describe('ItemActivations use tracking', () => {
  const character = { id: 'char-1', name: 'Pellias' };
  const cloak = (uid) => ({
    uid,
    name: 'Cloak of Repute',
    actions: [
      {
        name: 'Make a Request',
        actionCount: 2,
        frequencyRule: { per: 'day', uses: 1 },
        description: 'Frequency once per day; Effect Request.',
      },
    ],
  });

  beforeEach(() => window.localStorage.clear());

  it('renders no affordance for frequency-less activations — Flourish trait included', () => {
    renderWithProviders(
      <ItemActivations
        character={character}
        nowSecs={1000}
        item={{
          uid: 'ring-1',
          actions: [
            { name: 'Veracious Spell', traits: ['Flourish'], description: 'No authored frequency.' },
          ],
        }}
      />
    );
    expect(screen.queryByTestId('item-activation-use')).not.toBeInTheDocument();
    expect(screen.queryByTestId('item-activation-locked')).not.toBeInTheDocument();
  });

  it('fresh: shows the frequency label and records a per-UID use on click', () => {
    const onActivate = vi.fn();
    const { session } = renderWithProviders(
      <ItemActivations character={character} nowSecs={1000} item={cloak('cloak-1')} onActivate={onActivate} />
    );

    expect(screen.getByTestId('item-activation-freq')).toHaveTextContent('Once per day');
    fireEvent.click(screen.getByTestId('item-activation-use'));

    // recordUse write shape: cnmh_freq_<charId> ledger keyed `${uid}:<slug>`.
    expect(session.sent).toContainEqual({
      characterId: 'char-1',
      stateType: 'freq',
      value: {
        'cloak-1:make-a-request': [
          { gameSecs: 1000, realTs: expect.any(Number), per: 'day' },
        ],
      },
      options: { force: false },
    });
    expect(onActivate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cloak-1:make-a-request', name: 'Make a Request' })
    );

    // Spent: the button gives way to the lock with its reset boundary.
    expect(screen.queryByTestId('item-activation-use')).not.toBeInTheDocument();
    expect(screen.getByTestId('item-activation-locked')).toHaveTextContent(/^Once per day — used/);
    expect(screen.getByTestId('item-activation-locked')).toHaveTextContent('or after daily preparations');
  });

  it('per-UID separation: a spent copy locks while a second copy stays usable', () => {
    renderWithProviders(
      <>
        <ItemActivations character={character} nowSecs={1000} item={cloak('cloak-1')} />
        <ItemActivations character={character} nowSecs={1000} item={cloak('cloak-2')} />
      </>,
      {
        session: {
          state: {
            'char-1': {
              freq: {
                'cloak-1:make-a-request': [{ gameSecs: 900, realTs: 1, per: 'day' }],
              },
            },
          },
        },
      }
    );
    expect(screen.getByTestId('item-activation-locked')).toBeInTheDocument();
    expect(screen.getByTestId('item-activation-use')).toBeInTheDocument();
  });

  it('a spent hourly power frees up once the clock passes the window', () => {
    const pack = {
      uid: 'pack-1',
      actions: [
        {
          name: 'Draw Supplies',
          frequencyRule: { per: 'hour', uses: 1 },
          description: 'Frequency once per hour; Effect Draw gear.',
        },
      ],
    };
    const seeded = {
      session: {
        state: {
          'char-1': { freq: { 'pack-1:draw-supplies': [{ gameSecs: 1000, realTs: 1, per: 'hour' }] } },
        },
      },
    };
    const { unmount } = renderWithProviders(
      <ItemActivations character={character} nowSecs={2000} item={pack} />, seeded
    );
    expect(screen.getByTestId('item-activation-locked')).toBeInTheDocument();
    unmount();
    window.localStorage.clear();

    renderWithProviders(
      <ItemActivations character={character} nowSecs={1000 + 3600} item={pack} />, seeded
    );
    expect(screen.getByTestId('item-activation-use')).toBeInTheDocument();
  });
});
