// Shop cart state — pure helpers over an array of cart lines (#696 S5). A line:
//   { id, name, price, stock?, qty }
// id = catalog item id; price = the resolved per-shop price; stock = the GM's
// optional cap (undefined ⇒ unlimited). The cart is local component state until
// the purchase is committed in S6, so these stay side-effect free.

const cap = (stock) => (Number.isFinite(stock) ? stock : Infinity);

// Add one of `ware` to the cart: bump the existing line (clamped to stock) or
// append a fresh qty-1 line. An out-of-stock ware (stock 0) is a no-op.
export const addToCart = (cart, ware) => {
  const list = Array.isArray(cart) ? cart : [];
  if (!ware || ware.id == null) return list;
  const max = cap(ware.stock);
  if (max <= 0) return list;
  const existing = list.find((l) => l.id === ware.id);
  if (existing) {
    const qty = Math.min(existing.qty + 1, max);
    return list.map((l) => (l.id === ware.id ? { ...l, qty } : l));
  }
  return [
    ...list,
    {
      id: ware.id,
      name: ware.name,
      price: Number(ware.price) || 0,
      stock: Number.isFinite(ware.stock) ? ware.stock : undefined,
      qty: 1,
    },
  ];
};

// Set a line's quantity, clamped to [1, stock]. Non-numeric falls back to 1.
export const setQty = (cart, id, qty) => {
  const n = Math.floor(Number(qty));
  return (Array.isArray(cart) ? cart : []).map((l) => {
    if (l.id !== id) return l;
    const clamped = Math.max(1, Math.min(Number.isFinite(n) ? n : 1, cap(l.stock)));
    return { ...l, qty: clamped };
  });
};

export const removeLine = (cart, id) =>
  (Array.isArray(cart) ? cart : []).filter((l) => l.id !== id);

export const cartTotal = (cart) =>
  (Array.isArray(cart) ? cart : []).reduce((sum, l) => sum + (Number(l.price) || 0) * l.qty, 0);

export const cartCount = (cart) =>
  (Array.isArray(cart) ? cart : []).reduce((sum, l) => sum + l.qty, 0);

// Affordable when the running total is within the buyer's gold.
export const canAfford = (cart, gold) => cartTotal(cart) <= (Number(gold) || 0);
