// GM FX test-fire panel (#1456, epic #1414).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GmFxTestFire from './GmFxTestFire';

const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));

const entries = [
  { entryId: 'e-ashka', name: 'Ashka', kind: 'pc', charId: 'char-a' },
  { entryId: 'e-gob', name: 'Goblin', kind: 'enemy' },
  { entryId: 'e-ogre', name: 'Ogre', kind: 'enemy' },
];

beforeEach(() => {
  mockSendUpdate.mockClear();
});

describe('GmFxTestFire', () => {
  it('renders nothing without encounter entries', () => {
    const { container } = render(<GmFxTestFire entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fires the recipe on cnmh_fxplay_global with defaulted source/target', () => {
    render(<GmFxTestFire entries={entries} />);
    fireEvent.change(screen.getByLabelText('fx file key'), {
      target: { value: 'jb2a.melee_generic.slash.01.orange' },
    });
    fireEvent.click(screen.getByLabelText('Fire FX'));

    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    const [scope, key, payload] = mockSendUpdate.mock.calls[0];
    expect(scope).toBe('global');
    expect(key).toBe('fxplay');
    expect(payload).toMatchObject({
      shape: 'melee',
      file: 'jb2a.melee_generic.slash.01.orange',
      source: 'e-ashka',   // first entry
      targets: ['e-gob'],  // first entry that isn't the source
    });
    expect(payload.opts).toBeUndefined();
    expect(typeof payload.id).toBe('string');
    expect(typeof payload.ts).toBe('number');
  });

  it('honors explicit shape/source/target and numeric/tint opts', () => {
    render(<GmFxTestFire entries={entries} />);
    fireEvent.change(screen.getByLabelText('fx shape'), { target: { value: 'projectile' } });
    fireEvent.change(screen.getByLabelText('fx source'), { target: { value: 'e-gob' } });
    fireEvent.change(screen.getByLabelText('fx target'), { target: { value: 'e-ogre' } });
    fireEvent.change(screen.getByLabelText('fx file key'), { target: { value: 'jb2a.arrow.physical.white.01' } });
    fireEvent.change(screen.getByLabelText('fx scale'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('fx tint'), { target: { value: '#ffd700' } });
    fireEvent.click(screen.getByLabelText('Fire FX'));

    expect(mockSendUpdate.mock.calls[0][2]).toMatchObject({
      shape: 'projectile',
      file: 'jb2a.arrow.physical.white.01',
      source: 'e-gob',
      targets: ['e-ogre'],
      opts: { scale: 2.5, tint: '#ffd700' },
    });
  });

  it('does not fire without a file key; non-numeric scale is dropped', () => {
    render(<GmFxTestFire entries={entries} />);
    fireEvent.click(screen.getByLabelText('Fire FX'));
    expect(mockSendUpdate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('fx file key'), { target: { value: 'jb2a.some.key' } });
    fireEvent.change(screen.getByLabelText('fx scale'), { target: { value: 'huge' } });
    fireEvent.click(screen.getByLabelText('Fire FX'));
    expect(mockSendUpdate.mock.calls[0][2].opts).toBeUndefined();
  });
});
