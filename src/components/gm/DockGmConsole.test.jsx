import React from 'react';
import { screen, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RELAY } from '../../sync/keys';
import DockGmConsole from './DockGmConsole';

beforeEach(() => window.localStorage.clear());

const PC_ENTRIES = [
  { entryId: 'e-pellias', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e-ashka', charId: 'AshkaBGosh', name: 'Ashka' },
];

describe('DockGmConsole (#1537 S2)', () => {
  it('always offers the Request Save console for the encounter PCs', () => {
    renderWithProviders(<DockGmConsole pcEntries={PC_ENTRIES} />);

    expect(screen.getByRole('complementary', { name: 'GM console' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Request Save' })).toBeInTheDocument();
    // Quiet table: the resolve consoles hide themselves when nothing pends.
    expect(screen.queryByRole('heading', { name: 'Requested Saves' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Armed Effects' })).not.toBeInTheDocument();
  });

  describe('challenges + triggers (S7)', () => {
    it('mounts the free-form Fire Trigger console for the encounter PCs', () => {
      renderWithProviders(<DockGmConsole pcEntries={PC_ENTRIES} round={2} />);
      expect(screen.getByRole('heading', { name: 'Fire Trigger' })).toBeInTheDocument();
    });

    it('the three challenge launchers open their setup modals', () => {
      renderWithProviders(<DockGmConsole pcEntries={PC_ENTRIES} round={2} />);

      fireEvent.click(screen.getByRole('button', { name: 'Start a skill challenge' }));
      expect(screen.getByRole('heading', { name: 'Skill Challenge' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      fireEvent.click(screen.getByRole('button', { name: 'Start an influence encounter' }));
      expect(screen.getByRole('heading', { name: 'Influence Encounter' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      fireEvent.click(screen.getByRole('button', { name: 'Launch an encounter script' }));
      expect(screen.getByRole('heading', { name: 'Encounter Scripts' })).toBeInTheDocument();
    });
  });

  describe('table long tail (S8)', () => {
    it('mounts play-mode control, FX test fire, and the session log', () => {
      renderWithProviders(
        <DockGmConsole
          pcEntries={PC_ENTRIES}
          entries={[{ entryId: 'e-gob', kind: 'enemy', name: 'Goblin' }]}
          round={2}
        />
      );
      const table = screen.getByTestId('dock-table');
      expect(screen.getByRole('heading', { name: 'FX Test Fire' })).toBeInTheDocument();
      expect(table).toHaveTextContent('Table');
      // FX target list is fed by the raw order entries prop.
      expect(screen.getByLabelText('fx target')).toHaveTextContent('Goblin');
    });

    it('Apply Effect and Bestiary launchers open their modals', () => {
      renderWithProviders(<DockGmConsole pcEntries={PC_ENTRIES} round={2} />);

      fireEvent.click(screen.getByRole('button', { name: 'Apply Effect to character' }));
      expect(screen.getByRole('heading', { name: 'Apply Effect' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      fireEvent.click(screen.getByRole('button', { name: 'Edit monster descriptions' }));
      expect(screen.getByRole('heading', { name: 'Bestiary — Description Overrides' })).toBeInTheDocument();
    });
  });

  describe('menagerie (S6)', () => {
    it('Add summon opens the summon modal', () => {
      renderWithProviders(<DockGmConsole pcEntries={PC_ENTRIES} />);

      fireEvent.click(screen.getByRole('button', { name: 'Add summon to encounter' }));
      expect(screen.getByRole('heading', { name: 'Add summon' })).toBeInTheDocument();
    });

    it('linked companions/familiars list with their spawn buttons', () => {
      const { session } = renderWithProviders(<DockGmConsole pcEntries={PC_ENTRIES} />);
      act(() => {
        session.push('global', RELAY.MINIONACTORS, {
          'Pellias-familiar': {
            foundryActorId: 'a-laz', ownerCharId: 'Pellias', role: 'familiar',
            name: 'Lazarus', onScene: false,
          },
        });
      });

      const menagerie = screen.getByTestId('dock-menagerie');
      expect(menagerie).toHaveTextContent('Lazarus');
      expect(screen.getByRole('button', { name: 'Spawn Lazarus on the map' })).toBeInTheDocument();
    });
  });

  it('surfaces a pending save request for resolution', () => {
    const { session } = renderWithProviders(<DockGmConsole pcEntries={PC_ENTRIES} />);
    act(() => {
      session.push('global', RELAY.ENCOUNTER, {
        active: true,
        phase: 'in-progress',
        round: 1,
        currentTurnIndex: 0,
        order: [{ entryId: 'cbt-gob', kind: 'enemy', name: 'Goblin' }],
        log: [],
        armedPayloads: [],
        saveRequests: [{
          id: 'sr1',
          status: 'pending',
          casterName: 'Ashka',
          abilityName: 'Fireball',
          save: 'reflex',
          dc: 22,
          basic: true,
          damage: '6d6',
          damageType: 'fire',
          targets: [{ entryId: 'cbt-gob', name: 'Goblin' }],
        }],
      });
    });

    expect(screen.getByRole('heading', { name: 'Requested Saves' })).toBeInTheDocument();
    expect(screen.getAllByText(/Fireball/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Goblin d20')).toBeInTheDocument();
  });
});
