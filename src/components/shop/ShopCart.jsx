import React from 'react';
import { cartTotal, cartCount, canAfford } from '../../utils/shopCart';

// Cart panel inside a shop window (#696 S5). Presentational: cart lines with
// quantity steppers + remove, a running total checked against the buyer's gold,
// and a Confirm button that disables when the cart is empty or unaffordable.
// The actual purchase (gold debit + acquired credit) lands in S6 via onConfirm.
const ShopCart = ({ cart = [], gold = 0, onSetQty, onRemove, onConfirm }) => {
  const total = cartTotal(cart);
  const count = cartCount(cart);
  const affordable = canAfford(cart, gold);
  const empty = cart.length === 0;

  return (
    <div className="shop-cart" data-testid="shop-cart">
      <h3 className="shop-cart-title">
        Cart{count > 0 && <span className="shop-cart-count">{count}</span>}
      </h3>

      {empty ? (
        <p className="shop-empty">Drag items here (or press Add) to buy them.</p>
      ) : (
        <ul className="shop-cart-lines" aria-label="cart">
          {cart.map((l) => (
            <li key={l.id} className="shop-cart-line">
              <span className="shop-cart-line-name">{l.name}</span>
              <div className="shop-cart-qty">
                <button
                  type="button"
                  aria-label={`decrease ${l.id}`}
                  disabled={l.qty <= 1}
                  onClick={() => onSetQty(l.id, l.qty - 1)}
                >
                  −
                </button>
                <span className="shop-cart-qty-val" aria-label={`quantity ${l.id}`}>{l.qty}</span>
                <button
                  type="button"
                  aria-label={`increase ${l.id}`}
                  disabled={l.stock != null && l.qty >= l.stock}
                  onClick={() => onSetQty(l.id, l.qty + 1)}
                >
                  +
                </button>
              </div>
              <span className="shop-cart-line-total">{(Number(l.price) || 0) * l.qty} gp</span>
              <button
                type="button"
                className="shop-cart-remove"
                aria-label={`remove ${l.id}`}
                onClick={() => onRemove(l.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="shop-cart-foot">
        <div className={`shop-cart-total${!affordable ? ' is-over' : ''}`}>
          <span>Total</span>
          <span data-testid="cart-total">{total} gp</span>
        </div>
        <p className="shop-cart-gold">You have {Number(gold) || 0} gp</p>
        {!empty && !affordable && (
          <p className="shop-cart-warn" role="alert">Not enough gold.</p>
        )}
        <button
          type="button"
          className="btn-primary shop-cart-confirm"
          disabled={empty || !affordable}
          onClick={onConfirm}
        >
          Confirm purchase
        </button>
      </div>
    </div>
  );
};

export default ShopCart;
