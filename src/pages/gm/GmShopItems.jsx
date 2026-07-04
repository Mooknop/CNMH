import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';
import { shopHostKind, isShopExcluded } from '../../utils/shopUtils';
import './gm.css';

// Shop Items panel (#1105). An audit + management view for what shops can
// generatively offer: every catalog item that classifies as base gear for the
// runesmithing host pool (#1044), plus any already-excluded item. A per-item
// toggle writes the `noShop` "never sell" flag straight to the item doc (the
// same PUT GmItems uses), so unique / racial / story gear — Izzy's Gourd Head,
// a quest McGuffin — never shows up for sale. The flag round-trips through the
// content DO; a later snapshotContent pull captures it back into the seed.

const KIND_LABEL = { weapon: 'Weapon', armor: 'Armor', accessory: 'Accessory', shield: 'Shield', ring: 'Ring' };
const KIND_ORDER = ['weapon', 'armor', 'accessory', 'shield', 'ring'];

const GmShopItems = () => {
  const { items, refresh } = useContent();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [excludedOnly, setExcludedOnly] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  // The shop-host candidates (weapon/armor/accessory/shield/ring) plus any item
  // already flagged noShop — so an excluded item that no longer classifies as a
  // host can still be un-excluded here. Sorted by kind, then name.
  const hosts = useMemo(() => {
    const rows = (Array.isArray(items) ? items : [])
      .map((item) => ({ item, kind: shopHostKind(item) }))
      .filter(({ item, kind }) => kind || isShopExcluded(item));
    return rows.sort((a, b) => {
      const ka = KIND_ORDER.indexOf(a.kind);
      const kb = KIND_ORDER.indexOf(b.kind);
      if (ka !== kb) return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb);
      return String(a.item.name || a.item.id).toLowerCase().localeCompare(String(b.item.name || b.item.id).toLowerCase());
    });
  }, [items]);

  const excludedCount = useMemo(() => hosts.filter(({ item }) => isShopExcluded(item)).length, [hosts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return hosts.filter(({ item, kind }) => {
      if (kindFilter !== 'all' && kind !== kindFilter) return false;
      if (excludedOnly && !isShopExcluded(item)) return false;
      if (q && ![item.name, item.id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [hosts, search, kindFilter, excludedOnly]);

  const toggle = async (item) => {
    const next = !isShopExcluded(item);
    setSavingId(item.id);
    setError(null);
    try {
      // Round-trip the authored doc with the flag flipped. Clearing omits the
      // key entirely rather than leaving `noShop:false` on every item.
      const { noShop, ...rest } = item;
      await saveDocument('item', item.id, next ? { ...rest, noShop: true } : { ...rest });
      await refresh();
    } catch (e) {
      setError(`Couldn't update "${item.name || item.id}": ${e.message}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="gm-shop-items gm-panel">
      <div className="gm-panel-head">
        <div>
          <h2 className="gm-shop-pane-title">Shop Items</h2>
          <p className="gm-shop-setup-sub">
            Every catalog item a shop can offer as base gear for runesmithing. Exclude unique, racial, or
            story items so they never appear for sale.
          </p>
        </div>
        <span className="gm-count">{excludedCount} excluded</span>
      </div>

      <div className="gm-shop-items-controls">
        <input
          type="search"
          className="gm-rooms-search"
          placeholder="Search items…"
          aria-label="Search shop items"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="gm-shop-items-chips" role="group" aria-label="Filter by kind">
          {['all', ...KIND_ORDER].map((k) => (
            <button
              key={k}
              type="button"
              className={`gm-pill${kindFilter === k ? ' is-on' : ''}`}
              aria-pressed={kindFilter === k}
              onClick={() => setKindFilter(k)}
            >
              {k === 'all' ? 'All' : KIND_LABEL[k]}
            </button>
          ))}
          <button
            type="button"
            className={`gm-pill${excludedOnly ? ' is-on' : ''}`}
            aria-pressed={excludedOnly}
            onClick={() => setExcludedOnly((v) => !v)}
          >
            Excluded only
          </button>
        </div>
      </div>

      {error && <p className="gm-shop-items-error" role="alert">{error}</p>}

      <div className="gm-panel-body">
        {filtered.length === 0 ? (
          <p className="gm-shop-items-empty">No matching items.</p>
        ) : (
          <ul className="gm-shop-items-list">
            {filtered.map(({ item, kind }) => {
              const excluded = isShopExcluded(item);
              const saving = savingId === item.id;
              return (
                <li key={item.id} className={`gm-shop-items-row${excluded ? ' is-excluded' : ''}`}>
                  <div className="gm-shop-items-main">
                    <span className="gm-shop-items-name">{item.name || item.id}</span>
                    <span className={`gm-shop-items-kind${kind ? '' : ' gm-shop-items-kind--none'}`}>
                      {kind ? KIND_LABEL[kind] : 'not a host'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`btn-small ${excluded ? 'btn-secondary' : 'btn-danger'} gm-shop-items-toggle`}
                    disabled={saving}
                    aria-pressed={excluded}
                    onClick={() => toggle(item)}
                  >
                    {saving ? 'Saving…' : excluded ? 'Excluded — offer again' : 'Offered — exclude'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default GmShopItems;
