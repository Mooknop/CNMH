/* ============================================================
   dnd.jsx — pointer-based drag & drop for the inventory grid.
   Ported from the design-handoff prototype (inv/dnd.jsx).
     - touch: long-press (320ms) to pick up, then drag; a quick
       move before that = scroll (we never hijack the scroll).
     - mouse: drag after a small move threshold.
   Scoped per provider so a drag started in one tree can only drop
   on zones owned by the same provider. Exposes: DndProvider,
   useDnd, useDraggable, DropZone.
   ============================================================ */
import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';

const DndCtx = createContext(null);
export const useDnd = () => useContext(DndCtx);

export function DndProvider({ renderGhost, children }) {
  const rootRef = useRef(null);
  const zones = useRef(new Map()); // id -> { accepts, onDrop, el }
  const [drag, setDrag] = useState(null); // { item, x, y, zone, valid }
  const dragRef = useRef(null);
  dragRef.current = drag;

  const register = useCallback((id, cfg) => {
    zones.current.set(id, cfg);
    return () => zones.current.delete(id);
  }, []);

  // find a drop zone owned by THIS provider under (x,y)
  const zoneAt = useCallback((x, y) => {
    const root = rootRef.current;
    if (!root) return null;
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (!root.contains(el)) continue;
      const dz = el.closest('[data-dz]');
      if (dz && root.contains(dz)) {
        const id = dz.getAttribute('data-dz');
        if (zones.current.has(id)) return { id, el: dz };
      }
    }
    return null;
  }, []);

  const begin = useCallback((item, x, y) => {
    setDrag({ item, x, y, zone: null, valid: false });
  }, []);

  const move = useCallback(
    (x, y) => {
      const d = dragRef.current;
      if (!d) return;
      const hit = zoneAt(x, y);
      let zone = null;
      let valid = false;
      if (hit) {
        const cfg = zones.current.get(hit.id);
        valid = cfg ? cfg.accepts(d.item) : false;
        zone = hit.id;
      }
      setDrag({ ...d, x, y, zone, valid });
      edgeScroll(x, y, rootRef.current);
    },
    [zoneAt]
  );

  const finish = useCallback(() => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || !d.zone || !d.valid) return false;
    const cfg = zones.current.get(d.zone);
    if (cfg) cfg.onDrop(d.item, d.zone);
    return true;
  }, []);

  const cancel = useCallback(() => setDrag(null), []);

  return (
    <DndCtx.Provider value={{ register, begin, move, finish, cancel, drag, zoneAt }}>
      <div ref={rootRef} className="dnd-root">
        {children}
      </div>
      {drag && (
        <div
          className={
            'drag-ghost' +
            (drag.valid ? ' is-valid' : drag.zone ? ' is-invalid' : '')
          }
          style={{ left: drag.x, top: drag.y }}
        >
          {renderGhost(drag.item)}
        </div>
      )}
    </DndCtx.Provider>
  );
}

// auto-scroll the nearest scrollable ancestor when near its edges
function edgeScroll(x, y, root) {
  if (!root) return;
  const els = document.elementsFromPoint(x, y);
  const sc = els.find((e) => root.contains(e) && e.matches('[data-scroll]'));
  if (!sc) return;
  const r = sc.getBoundingClientRect();
  const pad = 56;
  if (y < r.top + pad) sc.scrollTop -= Math.max(2, (r.top + pad - y) / 4);
  else if (y > r.bottom - pad) sc.scrollTop += Math.max(2, (y - (r.bottom - pad)) / 4);
}

// Hook for a draggable item. opts: { item, onTap, disabled }
export function useDraggable({ item, onTap, disabled }) {
  const dnd = useDnd();
  const st = useRef(null);

  const cleanup = useCallback(() => {
    const s = st.current;
    if (!s) return;
    clearTimeout(s.timer);
    window.removeEventListener('pointermove', s.onMove);
    window.removeEventListener('pointerup', s.onUp);
    window.removeEventListener('pointercancel', s.onUp);
    document.removeEventListener('touchmove', s.blockScroll, { passive: false });
    document.body.classList.remove('dnd-active');
    st.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e) => {
      if (disabled) return;
      if (e.button != null && e.button > 0) return;
      const isTouch = e.pointerType === 'touch';
      const s = {
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        isTouch,
        dragging: false,
        armed: !isTouch,
        timer: null,
      };
      st.current = s;

      s.blockScroll = (ev) => {
        if (s.dragging) ev.preventDefault();
      };

      s.startDrag = () => {
        s.dragging = true;
        document.body.classList.add('dnd-active');
        dnd.begin(item, s.x, s.y);
        if (isTouch && navigator.vibrate) navigator.vibrate(12);
      };

      s.onMove = (ev) => {
        s.x = ev.clientX;
        s.y = ev.clientY;
        const dx = s.x - s.x0;
        const dy = s.y - s.y0;
        const dist = Math.hypot(dx, dy);
        if (!s.dragging) {
          if (isTouch && !s.armed) {
            // moved before long-press armed → it's a scroll; bail out
            if (dist > 10) cleanup();
            return;
          }
          if (s.armed && dist > 6) s.startDrag();
          if (!s.dragging) return;
        }
        dnd.move(s.x, s.y);
      };

      s.onUp = () => {
        const wasDragging = s.dragging;
        const moved = Math.hypot(s.x - s.x0, s.y - s.y0);
        if (wasDragging) dnd.finish();
        else if (!moved || moved < 6) onTap && onTap(item);
        cleanup();
      };

      if (isTouch) {
        s.timer = setTimeout(() => {
          s.armed = true;
          s.startDrag();
        }, 320);
      }
      window.addEventListener('pointermove', s.onMove);
      window.addEventListener('pointerup', s.onUp);
      window.addEventListener('pointercancel', s.onUp);
      document.addEventListener('touchmove', s.blockScroll, { passive: false });
    },
    [item, onTap, disabled, dnd, cleanup]
  );

  // Keyboard activation for a11y: the pointer path can't be reached by keyboard,
  // so Enter / Space on the focused tile acts as a tap (opens the modal). Drag is
  // pointer-only by nature.
  const onKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (onTap) onTap(item);
      }
    },
    [disabled, onTap, item]
  );

  useEffect(() => cleanup, [cleanup]);
  return { onPointerDown, onKeyDown };
}

// Drop zone wrapper. accepts(item)->bool, onDrop(item, zoneId)
export function DropZone({
  id,
  accepts,
  onDrop,
  className = '',
  activeClass = 'dz-over',
  invalidClass = 'dz-bad',
  children,
  ...rest
}) {
  const dnd = useDnd();
  useEffect(() => dnd.register(id, { accepts, onDrop }), [id, accepts, onDrop, dnd]);
  const active = dnd.drag && dnd.drag.zone === id;
  const cls = [
    className,
    active ? (dnd.drag.valid ? activeClass : invalidClass) : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div data-dz={id} className={cls} {...rest}>
      {children}
    </div>
  );
}
