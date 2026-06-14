import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));

// Controllable session store backing useCharacterLiveState. The function
// identities MUST be stable across renders — the real SessionContext memoises
// them with useCallback, and useCharacterLiveState depends on getAllState in its
// useCallback/useEffect deps. Fresh closures each render would loop infinitely.
const sessionStore = {};
const sessionApi = {
  connected: true,
  getAllState: (charId) => sessionStore[charId],
  getState: (charId, type) => sessionStore[charId]?.[type],
  sendUpdate: () => {},
  subscribe: () => () => {},
};
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => sessionApi,
}));

import { useContent } from '../../contexts/ContentContext';
import CharacterStateModal from './CharacterStateModal';

// ─── fixtures ────────────────────────────────────────────────
const CHARACTERS = [
  { id: 'jade', name: 'Jade', spellcasting: { focus: { max: 3 }, spell_slots: { 1: 3, 2: 2 } } },
  { id: 'pellias', name: 'Pellias' },
];

const select = (id) =>
  fireEvent.change(screen.getByLabelText('select character'), { target: { value: id } });

beforeEach(() => {
  Object.keys(sessionStore).forEach((k) => delete sessionStore[k]);
  useContent.mockReturnValue({ characters: CHARACTERS });
});

afterEach(() => vi.restoreAllMocks());

// ─── tests ───────────────────────────────────────────────────
describe('CharacterStateModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CharacterStateModal isOpen={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the roster and shows no groups until a character is picked', () => {
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    expect(screen.getByRole('option', { name: 'Jade' })).toBeInTheDocument();
    expect(screen.queryByText('Turn economy')).not.toBeInTheDocument();
  });

  it('renders grouped, labelled, formatted live state for the selected PC', () => {
    sessionStore.jade = {
      turnstate: { actionsSpent: 2, reactionSpent: true },
      focus: 1,
      slots: { 1: 1, 2: 0 },
    };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');

    expect(screen.getByText('Turn economy')).toBeInTheDocument();
    expect(screen.getByText('Resource pools')).toBeInTheDocument();

    // Formatters use the resolved character for maxes.
    expect(screen.getByTestId('cs-row-focus')).toHaveTextContent('Focus points2/3');
    expect(screen.getByTestId('cs-row-slots')).toHaveTextContent('R1 2/3, R2 2/2');
    expect(screen.getByTestId('cs-row-turnstate')).toHaveTextContent('2/3 actions, reaction spent');
  });

  it('routes unrecognized keys into the raw escape hatch', () => {
    sessionStore.jade = { focus: 0, somethingNew: { foo: 1 } };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');

    expect(screen.getByText('Unrecognized')).toBeInTheDocument();
    const raw = screen.getByTestId('cs-raw-somethingNew');
    expect(raw).toHaveTextContent('somethingNew');
    expect(raw).toHaveTextContent('"foo": 1');
  });

  it('shows an empty-state message when the PC has no live state', () => {
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('pellias');
    expect(screen.getByText(/no live state recorded/i)).toBeInTheDocument();
  });
});
