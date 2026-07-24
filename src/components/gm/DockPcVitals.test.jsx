import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import DockPcVitals from './DockPcVitals';

beforeEach(() => window.localStorage.clear());

const CHARACTER = {
  id: 'c-testa',
  name: 'Testa',
  level: 5,
  maxHp: 40,
  spellcasting: { focus: { max: 2 } },
};

const MODEL = {
  characterClass: 'Champion',
  ac: 22,
  armorClass: { value: 22 },
  saves: { fortitude: 11, reflex: 8, will: 9 },
};

describe('DockPcVitals (#1556 S4)', () => {
  it('renders identity, class line, AC and saves off the model', () => {
    renderWithProviders(<DockPcVitals character={CHARACTER} model={MODEL} />);

    expect(screen.getByText('Acting as')).toBeInTheDocument();
    expect(screen.getByText('Testa')).toBeInTheDocument();
    expect(screen.getByText('Champion · Level 5')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('+11')).toBeInTheDocument();
    expect(screen.getByText('+8')).toBeInTheDocument();
    expect(screen.queryByText('pinned')).not.toBeInTheDocument();
  });

  it('shows the pinned tag when staged off-turn', () => {
    renderWithProviders(<DockPcVitals character={CHARACTER} model={MODEL} pinned />);
    expect(screen.getByText('pinned')).toBeInTheDocument();
  });

  it('HP dial rides live state, falling back to the sheet max', () => {
    const { session } = renderWithProviders(
      <DockPcVitals character={CHARACTER} model={MODEL} />
    );
    // Before any live write: full sheet HP.
    expect(screen.getByTestId('dock-pc-vitals')).toHaveTextContent('40/40');

    act(() => {
      session.push('c-testa', 'hp', { current: 10, max: 40 });
    });
    expect(screen.getByTestId('dock-pc-vitals')).toHaveTextContent('10/40');
  });

  it('focus pips track the spent pool from live state', () => {
    const { session } = renderWithProviders(
      <DockPcVitals character={CHARACTER} model={MODEL} />
    );
    expect(screen.getByLabelText('Focus points: 2 of 2')).toBeInTheDocument();

    act(() => {
      session.push('c-testa', 'focus', 1);
    });
    expect(screen.getByLabelText('Focus points: 1 of 2')).toBeInTheDocument();
  });

  it('omits the focus pips for a character with no pool', () => {
    renderWithProviders(
      <DockPcVitals character={{ ...CHARACTER, spellcasting: {} }} model={MODEL} />
    );
    expect(screen.queryByLabelText(/Focus points/)).not.toBeInTheDocument();
  });

  it('renders active-effect chips from live state', () => {
    const { session } = renderWithProviders(
      <DockPcVitals character={CHARACTER} model={MODEL} />
    );
    act(() => {
      session.push('c-testa', 'effects', [
        { id: 'e1', effectId: 'nonexistent', source: 'Inspire Courage' },
      ]);
    });
    expect(screen.getByText('Inspire Courage')).toBeInTheDocument();
  });
});
