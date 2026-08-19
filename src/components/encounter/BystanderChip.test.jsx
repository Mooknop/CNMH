import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { APP } from '../../sync/keys';
import BystanderChip from './BystanderChip';

// #1311 rails: the real provider stack + the in-memory session bus, so the real
// useSyncedState/useBystander run against cnmh_bystander_<charId>.
beforeEach(() => window.localStorage.clear());

const pc = { entryId: 'e1', kind: 'pc', name: 'Izzy', charId: 'IzzyUncut' };

const seed = (session, value) =>
  act(() => session.push('IzzyUncut', APP.BYSTANDER, value));

describe('BystanderChip', () => {
  it('renders nothing when not declared', () => {
    const { container } = renderWithProviders(<BystanderChip entry={pc} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for non-pc entries', () => {
    const { container, session } = renderWithProviders(
      <BystanderChip entry={{ entryId: 'g1', kind: 'enemy', name: 'Goblin' }} />
    );
    seed(session, { active: true, mod: 'deception', ts: 1 });
    expect(container.firstChild).toBeNull();
  });

  it('renders the badge when declared', () => {
    const { session } = renderWithProviders(<BystanderChip entry={pc} />);
    seed(session, { active: true, mod: 'deception', ts: 1 });
    expect(screen.getByLabelText('Izzy declared Harmless Bystander')).toBeInTheDocument();
  });

  // #465: the second state — she was seen fighting, so the disguise is down.
  it('marks the badge once she has been recognized as hostile', () => {
    const { session } = renderWithProviders(<BystanderChip entry={pc} />);
    seed(session, { active: true, mod: 'deception', ts: 1, revealed: true, revealedTs: 2, immune: {} });

    const chip = screen.getByLabelText('Izzy was recognized as hostile — Harmless Bystander ended');
    expect(chip.className).toContain('ttp-bystander-chip--revealed');
    expect(chip.getAttribute('title')).toContain('immune to their Harmless Bystander for 1 day');
  });
});
