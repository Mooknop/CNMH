import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemEditModal from './ItemEditModal';

// Inline dummy modal so queries work without a portal.
vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, title, children }) {
    if (!isOpen) return null;
    return <div data-testid="modal"><h2>{title}</h2>{children}</div>;
  },
}));

const catalog = [
  { id: 'longsword', name: 'Longsword', strikes: [{}], price: 1, weight: 1 },
  { id: 'potion', name: 'Healing Potion', price: 3, weight: 0 },
];

const refItem = (ref, extra = {}) => ({
  __ref: true, ref, origRef: ref, quantity: '1', invested: false, extra,
});

const renderModal = (item, onPatch = vi.fn()) => {
  render(
    <ItemEditModal
      isOpen onClose={vi.fn()} item={item} tag="inv-0"
      catalogList={catalog} spells={[]} onPatch={onPatch}
      onRepoint={vi.fn()} onAddToContainer={vi.fn()}
      onContentPatch={vi.fn()} onContentRepoint={vi.fn()} onContentRemove={vi.fn()}
    />
  );
  return onPatch;
};

describe('ItemEditModal — Dragonbreath authoring (#1210 M4f)', () => {
  it('shows the toggle only for a weapon ref', () => {
    renderModal(refItem('longsword'));
    expect(screen.getByTestId('inv-0-dragonbreath')).toBeInTheDocument();
  });

  it('hides it for a non-weapon ref', () => {
    renderModal(refItem('potion'));
    expect(screen.queryByTestId('inv-0-dragonbreath')).not.toBeInTheDocument();
  });

  it('enabling writes the base template into extra', () => {
    const onPatch = renderModal(refItem('longsword'));
    fireEvent.click(screen.getByLabelText('inv-0-dragonbreath-toggle'));
    expect(onPatch).toHaveBeenCalledWith({ extra: { dragonbreath: { tier: 'base', dragonType: '' } } });
  });

  it('previews the templated name + breath from the tier and dragon kind', () => {
    renderModal(refItem('longsword', { dragonbreath: { tier: 'greater', dragonType: 'Red' } }));
    expect(screen.getByLabelText('inv-0-dragonbreath-tier')).toHaveValue('greater');
    expect(screen.getByLabelText('inv-0-dragonbreath-type')).toHaveValue('Red');
    const preview = screen.getByTestId('inv-0-dragonbreath-preview');
    expect(preview).toHaveTextContent('Greater Red Dragonbreath Longsword');
    expect(preview).toHaveTextContent('6d6 fire · basic Reflex DC 27 · 30-ft cone');
  });

  it('notes an unauthored dragon kind carries no breath damage type', () => {
    renderModal(refItem('longsword', { dragonbreath: { tier: 'base', dragonType: 'Rainbow' } }));
    expect(screen.getByTestId('inv-0-dragonbreath-preview')).toHaveTextContent('4d6 (GM sets type)');
  });

  it('editing the tier patches extra, preserving other extra keys', () => {
    const onPatch = renderModal(refItem('longsword', { dragonbreath: { tier: 'base', dragonType: 'Red' }, noShop: true }));
    fireEvent.change(screen.getByLabelText('inv-0-dragonbreath-tier'), { target: { value: 'major' } });
    expect(onPatch).toHaveBeenCalledWith({ extra: { dragonbreath: { tier: 'major', dragonType: 'Red' }, noShop: true } });
  });

  it('disabling removes the template from extra', () => {
    const onPatch = renderModal(refItem('longsword', { dragonbreath: { tier: 'base', dragonType: 'Red' } }));
    fireEvent.click(screen.getByLabelText('inv-0-dragonbreath-toggle'));
    expect(onPatch).toHaveBeenCalledWith({ extra: {} });
  });
});
