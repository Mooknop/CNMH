// Shop cart state — pure helpers over an array of cart lines (#696 S5). A line:
//   { id, name, price, stock?, qty }
// `id` = the ware's unique key: the catalog item id for a flat item, or
// `"${ref}@${level}"` for a stocked variant (#798) — so two variants of the same
// item don't collide on a shared catalog id. price = the resolved per-shop price;
// stock = the GM's optional cap (undefined ⇒ unlimited). The cart is local
// component state until the purchase is committed (S6), so these stay
// side-effect free.

const cap = (stock) => (Number.isFinite(stock) ? stock : Infinity);

// The line key for a ware: its `wareKey` (set by resolveShopWares) when present,
// else its catalog `id` (back-compat for callers that pass a bare item).
const wareKeyOf = (ware) =>
  ware && (ware.wareKey != null ? String(ware.wareKey) : ware.id != null ? String(ware.id) : null);

// Add one of `ware` to the cart: bump the existing line (clamped to stock) or
// append a fresh qty-1 line. An out-of-stock ware (stock 0) is a no-op.
export const addToCart = (cart, ware) => {
  const list = Array.isArray(cart) ? cart : [];
  const key = wareKeyOf(ware);
  if (key == null) return list;
  const max = cap(ware.stock);
  if (max <= 0) return list;
  const existing = list.find((l) => l.id === key);
  if (existing) {
    const qty = Math.min(existing.qty + 1, max);
    return list.map((l) => (l.id === key ? { ...l, qty } : l));
  }
  return [
    ...list,
    {
      id: key,
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
