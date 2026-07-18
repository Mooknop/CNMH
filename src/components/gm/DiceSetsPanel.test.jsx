// Dice So Nice dice-set editor (#1490 S7) — per-character + Enemies rows on
// the GM Theme page, writing cnmh_dicesets_global (the bridge's styling map).
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import DiceSetsPanel from './DiceSetsPanel';
import { DEFAULT_ENEMY_SET } from '../../utils/diceSets';
import { RELAY } from '../../sync/keys';

const AMIRI = makeCharacter({ id: 'pc-amiri', name: 'Amiri', color: '#c0440e' });

const lastWrite = (session) =>
  session.sent.filter((s) => s.stateType === RELAY.DICESETS).at(-1)?.value;

describe('DiceSetsPanel', () => {
  // useSyncedState mirrors writes into localStorage — clear it so one test's
  // saved sets don't hydrate the next test's fresh bus.
  beforeEach(() => localStorage.clear());

  test('renders a theme-default row per character plus Enemies', () => {
    renderWithProviders(<DiceSetsPanel />, { content: { character: [AMIRI] } });
    expect(screen.getByText('Amiri')).toBeInTheDocument();
    expect(screen.getByText('Enemies')).toBeInTheDocument();
    expect(screen.getAllByText('theme default')).toHaveLength(2);
    expect(screen.getByLabelText('Amiri dice body')).toHaveValue('#c0440e');
  });

  test('Fill from theme accents saves derived sets for every unset row', () => {
    const { session } = renderWithProviders(<DiceSetsPanel />, {
      content: { character: [AMIRI] },
    });
    fireEvent.click(screen.getByRole('button', { name: /fill from theme accents/i }));

    const map = lastWrite(session);
    expect(map['pc-amiri']).toEqual(expect.objectContaining({
      background: '#c0440e', foreground: '#ffffff', material: 'plastic',
    }));
    expect(map.enemy).toEqual(DEFAULT_ENEMY_SET);
    expect(screen.queryByText('theme default')).toBeNull();
  });

  test('editing a swatch saves that entry; Clear removes it', () => {
    const { session } = renderWithProviders(<DiceSetsPanel />, {
      content: { character: [AMIRI] },
    });

    fireEvent.change(screen.getByLabelText('Amiri dice body'), { target: { value: '#123456' } });
    expect(lastWrite(session)['pc-amiri']).toEqual(expect.objectContaining({
      background: '#123456', material: 'plastic',
    }));

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(lastWrite(session)['pc-amiri']).toBeUndefined();
    expect(screen.getAllByText('theme default')).toHaveLength(2);
  });

  test('material and DSN colorset fields write through', () => {
    const { session } = renderWithProviders(<DiceSetsPanel />, {
      content: { character: [AMIRI] },
    });
    fireEvent.change(screen.getByLabelText('Enemies dice material'), { target: { value: 'stone' } });
    fireEvent.change(screen.getByLabelText('Enemies DSN colorset'), { target: { value: 'fire' } });
    expect(lastWrite(session).enemy).toEqual(expect.objectContaining({
      material: 'stone', colorset: 'fire',
    }));
  });
});
