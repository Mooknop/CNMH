import React from 'react';
import Modal from '../shared/Modal';
import TraitsField from '../shared/TraitsField';

// Catalog summary line for a reference entry — same content the old inline
// RefRow showed, kept so the GM can confirm what the ref resolves to.
const RefSummary = ({ sel, refId }) =>
  sel ? (
    <p className="gm-count">
      {sel.name} · price {sel.price != null ? sel.price : 0} · Bulk{' '}
      {sel.weight != null ? sel.weight : 0}
      {Array.isArray(sel.traits) && sel.traits.length ? ` · ${sel.traits.join(', ')}` : ''}
      {sel.scroll ? ' · scroll' : ''}
      {sel.wand ? ' · wand' : ''}
      {sel.container ? ' · container' : ''}
    </p>
  ) : (
    <p className="gm-warn">
      Unknown catalog item “{refId || '(none)'}”. Use “Change catalog item”.
    </p>
  );

// One compact container-content row: name · qty · invested · red ✕, with a
// small "Change" link that repoints it through the shared picker. Depth is 1
// (a container's contents are never themselves expanded here).
const ContentRow = ({ tag, item, catalogList, onPatch, onRepoint, onRemove }) => {
  const sel = catalogList.find((c) => String(c.id) === String(item.ref));
  return (
    <div className="gm-inv-row gm-inv-content" data-testid={tag}>
      <span className="gm-inv-label">
        {sel ? sel.name : `${item.ref || '(none)'} (not in catalog)`}
      </span>
      <input
        aria-label={`${tag}-quantity`}
        type="number"
        className="gm-inv-qty"
        value={item.quantity}
        onChange={(e) => onPatch({ quantity: e.target.value })}
      />
      <label className="gm-inv-inv">
        <input
          type="checkbox"
          aria-label={`${tag}-invested`}
          checked={item.invested}
          onChange={(e) => onPatch({ invested: e.target.checked })}
        />{' '}
        inv
      </label>
      <button type="button" className="btn-small btn-secondary" onClick={onRepoint}>
        Change
      </button>
      <button
        type="button"
        className="gm-inv-x"
        aria-label={`remove ${tag}`}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
};

/**
 * Edits a single inventory entry's per-character fields. Opened by clicking an
 * inventory row. A reference entry exposes quantity / invested, a "Change
 * catalog item" button (re-points via the shared picker) and, for a container,
 * its contents as compact rows plus "Add item to container". A legacy inline
 * entry keeps the bespoke name/price/qty/weight/traits/description/JSON fields
 * so it still round-trips losslessly.
 *
 * All state lives in the parent form (lifted); this is a controlled view.
 */
const ItemEditModal = ({
  isOpen,
  onClose,
  item,
  tag,
  catalogList,
  onPatch,
  onRepoint,
  onAddToContainer,
  onContentPatch,
  onContentRepoint,
  onContentRemove,
}) => {
  if (!isOpen || !item) return null;

  const isRef = !!item.__ref;
  const sel = isRef
    ? catalogList.find((c) => String(c.id) === String(item.ref))
    : null;
  const title = isRef
    ? (sel && sel.name) || item.ref || 'Edit item'
    : item.name || 'Edit item';
  // Show the contents editor for anything that resolves to a container —
  // either the catalog item is one, or the entry already carries one (mirrors
  // the old RefRow rule so a freshly-picked container can be packed pre-save).
  const showContents =
    isRef &&
    (!!(sel && sel.container) ||
      item.isContainer ||
      (item.contents && item.contents.length > 0));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit — ${title}`} maxWidth="640px" highZ>
      {isRef ? (
        <>
          <RefSummary sel={sel} refId={item.ref} />
          <div className="gm-row">
            <div className="form-group">
              <label>quantity</label>
              <input
                aria-label={`${tag}-quantity`}
                type="number"
                value={item.quantity}
                onChange={(e) => onPatch({ quantity: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  aria-label={`${tag}-invested`}
                  checked={item.invested}
                  onChange={(e) => onPatch({ invested: e.target.checked })}
                />{' '}
                invested
              </label>
            </div>
            <div className="form-group gm-inv-change">
              <button
                type="button"
                className="btn-small btn-secondary"
                onClick={onRepoint}
              >
                Change catalog item
              </button>
            </div>
          </div>

          {showContents && (
            <div className="gm-card" data-testid={`${tag}-contents`}>
              <p className="gm-count">Container contents</p>
              {(item.contents || []).map((c, j) =>
                c.__ref ? (
                  <ContentRow
                    key={j}
                    tag={`${tag}-c-${j}`}
                    item={c}
                    catalogList={catalogList}
                    onPatch={(p) => onContentPatch(j, p)}
                    onRepoint={() => onContentRepoint(j)}
                    onRemove={() => onContentRemove(j)}
                  />
                ) : (
                  <div className="gm-inv-row" data-testid={`${tag}-c-${j}`} key={j}>
                    <span className="gm-inv-label gm-warn">
                      Legacy inline item — edit it at the top level.
                    </span>
                    <button
                      type="button"
                      className="gm-inv-x"
                      aria-label={`remove ${tag}-c-${j}`}
                      onClick={() => onContentRemove(j)}
                    >
                      ✕
                    </button>
                  </div>
                )
              )}
              <button
                type="button"
                className="btn-small btn-secondary"
                onClick={onAddToContainer}
              >
                Add item to container
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="gm-warn" data-testid={`${tag}-legacy`}>
            Legacy inline item — not in the catalog. Define it in GM → Items and
            re-add it as a reference when you can.
          </p>
          <div className="gm-row">
            <div className="form-group">
              <label>name</label>
              <input
                aria-label={`${tag}-name`}
                value={item.name}
                onChange={(e) => onPatch({ name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>price</label>
              <input
                aria-label={`${tag}-price`}
                type="number"
                value={item.price}
                onChange={(e) => onPatch({ price: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>quantity</label>
              <input
                aria-label={`${tag}-quantity`}
                type="number"
                value={item.quantity}
                onChange={(e) => onPatch({ quantity: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>weight</label>
              <input
                aria-label={`${tag}-weight`}
                type="number"
                value={item.weight}
                onChange={(e) => onPatch({ weight: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label>traits</label>
            <TraitsField
              ariaLabel={`${tag}-traits`}
              value={item.traits}
              onChange={(v) => onPatch({ traits: v })}
            />
          </div>
          <div className="form-group">
            <label>description</label>
            <textarea
              aria-label={`${tag}-description`}
              rows={2}
              value={item.description}
              onChange={(e) => onPatch({ description: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>extra fields — shield, strikes, bonus, potency, invested… (raw JSON)</label>
            <textarea
              aria-label={`${tag}-json`}
              className="gm-json"
              rows={5}
              value={item.restJson}
              onChange={(e) => onPatch({ restJson: e.target.value })}
            />
          </div>
        </>
      )}

      <div className="gm-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
};

export default ItemEditModal;
