import { addToCart, setQty, removeLine, cartTotal, cartCount, canAfford } from './shopCart';

const ware = (over = {}) => ({ id: 'antidote', name: 'Antidote', price: 8, ...over });

describe('addToCart', () => {
  it('appends a fresh qty-1 line for a new ware', () => {
    expect(addToCart([], ware())).toEqual([
      { id: 'antidote', name: 'Antidote', price: 8, stock: undefined, qty: 1 },
    ]);
  });

  it('increments an existing line instead of duplicating', () => {
    const cart = addToCart([], ware());
    expect(addToCart(cart, ware())).toEqual([
      { id: 'antidote', name: 'Antidote', price: 8, stock: undefined, qty: 2 },
    ]);
  });

  it('clamps the increment to stock', () => {
    let cart = addToCart([], ware({ stock: 1 }));
    cart = addToCart(cart, ware({ stock: 1 }));
    expect(cart[0].qty).toBe(1);
  });

  it('is a no-op for an out-of-stock ware', () => {
    expect(addToCart([], ware({ stock: 0 }))).toEqual([]);
  });

  it('coerces a missing price to 0 and carries stock', () => {
    expect(addToCart([], ware({ price: undefined, stock: 3 }))[0]).toMatchObject({ price: 0, stock: 3 });
  });

  it('keys the line by wareKey, so two variants of one item are distinct lines', () => {
    // Both variants share the catalog id 'tonic' but differ by wareKey.
    const minor = { id: 'tonic', wareKey: 'tonic@1', name: 'Minor Tonic', price: 4 };
    const lesser = { id: 'tonic', wareKey: 'tonic@3', name: 'Lesser Tonic', price: 12 };
    let cart = addToCart([], minor);
    cart = addToCart(cart, lesser);
    cart = addToCart(cart, minor); // bumps the minor line, not the lesser one
    expect(cart.map((l) => l.id)).toEqual(['tonic@1', 'tonic@3']);
    expect(cart.map((l) => l.qty)).toEqual([2, 1]);
  });
});

describe('setQty', () => {
  const cart = [{ id: 'antidote', name: 'Antidote', price: 8, stock: 5, qty: 2 }];

  it('sets a clamped quantity', () => {
    expect(setQty(cart, 'antidote', 4)[0].qty).toBe(4);
  });

  it('clamps above stock', () => {
    expect(setQty(cart, 'antidote', 99)[0].qty).toBe(5);
  });

  it('never goes below 1', () => {
    expect(setQty(cart, 'antidote', 0)[0].qty).toBe(1);
    expect(setQty(cart, 'antidote', -3)[0].qty).toBe(1);
  });

  it('leaves other lines untouched', () => {
    const two = [...cart, { id: 'rope', name: 'Rope', price: 1, qty: 1 }];
    expect(setQty(two, 'antidote', 3)[1]).toEqual({ id: 'rope', name: 'Rope', price: 1, qty: 1 });
  });
});

describe('removeLine', () => {
  it('drops the matching line', () => {
    const cart = [{ id: 'a', qty: 1 }, { id: 'b', qty: 1 }];
    expect(removeLine(cart, 'a')).toEqual([{ id: 'b', qty: 1 }]);
  });
});

describe('cartTotal / cartCount', () => {
  const cart = [
    { id: 'a', price: 8, qty: 2 },
    { id: 'b', price: 10, qty: 1 },
  ];
  it('totals price × qty', () => {
    expect(cartTotal(cart)).toBe(26);
  });
  it('counts total quantity', () => {
    expect(cartCount(cart)).toBe(3);
  });
  it('handles an empty cart', () => {
    expect(cartTotal([])).toBe(0);
    expect(cartCount([])).toBe(0);
  });
});

describe('canAfford', () => {
  const cart = [{ id: 'a', price: 8, qty: 2 }]; // 16
  it('is true when total ≤ gold', () => {
    expect(canAfford(cart, 16)).toBe(true);
    expect(canAfford(cart, 20)).toBe(true);
  });
  it('is false when total exceeds gold', () => {
    expect(canAfford(cart, 15)).toBe(false);
  });
  it('treats missing gold as 0', () => {
    expect(canAfford(cart, undefined)).toBe(false);
    expect(canAfford([], undefined)).toBe(true);
  });
});
