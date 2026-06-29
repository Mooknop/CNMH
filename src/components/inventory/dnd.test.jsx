import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { DndProvider, useDraggable } from './dnd';

// A minimal draggable tile wired exactly like the real grid cells: a pointer-down
// with no movement followed by a pointer-up is a tap (opens a modal in the app);
// a pointer-down + move + up is a drag.
function Tile({ onTap }) {
  const { onPointerDown } = useDraggable({ item: { uid: 'x' }, onTap });
  return (
    <button data-testid="tile" onPointerDown={onPointerDown}>
      Tile
    </button>
  );
}

const harness = (onTap) =>
  render(
    <DndProvider renderGhost={() => null}>
      <Tile onTap={onTap} />
    </DndProvider>
  );

const tap = (el) => {
  fireEvent.pointerDown(el, { clientX: 0, clientY: 0 });
  window.dispatchEvent(new Event('pointerup'));
};

describe('useDraggable — tap opens, trailing click is swallowed (#871)', () => {
  it('fires onTap for a pointer-down/up with no movement', () => {
    const onTap = vi.fn();
    const { getByTestId } = harness(onTap);
    tap(getByTestId('tile'));
    expect(onTap).toHaveBeenCalledWith({ uid: 'x' });
  });

  it('suppresses the one synthetic click that follows a tap', () => {
    const onTap = vi.fn();
    const { getByTestId } = harness(onTap);
    const docClick = vi.fn();
    document.addEventListener('click', docClick);

    tap(getByTestId('tile')); // arms the one-shot suppressor

    // The gesture's trailing click — it must not reach a bubble-phase handler,
    // and must be prevented (so a modal button under the finger never acts).
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    getByTestId('tile').dispatchEvent(click);

    document.removeEventListener('click', docClick);
    expect(onTap).toHaveBeenCalled();
    expect(docClick).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
  });

  it('only swallows one click — a later genuine click still lands', () => {
    const { getByTestId } = harness(vi.fn());
    tap(getByTestId('tile'));

    // First (synthetic) click is eaten.
    getByTestId('tile').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );

    // A subsequent, unrelated click is untouched.
    const docClick = vi.fn();
    document.addEventListener('click', docClick);
    const second = new MouseEvent('click', { bubbles: true, cancelable: true });
    getByTestId('tile').dispatchEvent(second);
    document.removeEventListener('click', docClick);

    expect(docClick).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it('does not arm the suppressor on a drag (only on a tap)', () => {
    const { getByTestId } = harness(vi.fn());
    const tile = getByTestId('tile');

    fireEvent.pointerDown(tile, { clientX: 0, clientY: 0 }); // mouse: armed
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 50 })); // → drag
    window.dispatchEvent(new Event('pointerup')); // finishes the drag, no tap

    const docClick = vi.fn();
    document.addEventListener('click', docClick);
    getByTestId('tile').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    document.removeEventListener('click', docClick);

    expect(docClick).toHaveBeenCalledTimes(1);
  });
});
