import React, { useState, useEffect, useRef } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { useCharacter } from '../../hooks/useCharacter';
import { useSessionLog } from '../../hooks/useSessionLog';
import { flattenInventory } from '../../utils/InventoryUtils';
import { itemUidOf } from '../../utils/affix';
import {
  isAugmentation, augmentationFits, augmentationOf, hasAugmentation, applyAugmentation,
} from '../../utils/augmentations';
import { applyGearEntry } from '../../utils/gmRunes';
import './CraftingProjects.css';
import { APP, syncKey } from '../../sync/keys';

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const AUGMENT_HOURS = 8; // one flat crafting day — no Craft check (#1202 U2)

// "Augment Gear" (#1202 U2) — the Crafting-Projects sibling for fitting an
// augmentation to owned gear over a single flat 8-hour crafting day (no check).
//
// Projects live in cnmh_craftprojects_<charId> tagged `kind:'augment'`, so the
// DowntimeAllocator's Crafting hour-bank accrues their hours with NO allocator
// change (an augment project is just another in-progress craft target). On the
// banked day the augmentation applies to the character's `acquired` overlay — the
// same fresh-uid runed-copy write GM Manage Gear and the shop work-order use — then
// the project drops. Requires trained in Crafting (the Crafting-activity gate).
const AugmentGearProjects = ({ character }) => {
  const charId = character?.id || 'unknown';
  const [craftProjects, setCraftProjects] = useSyncedState(syncKey(APP.CRAFTPROJECTS, charId), null);
  const [acquired, setAcquired] = useSyncedState(syncKey(APP.ACQUIRED, charId), []);
  const [removed, setRemoved] = useSyncedState(syncKey(APP.REMOVED, charId), []);
  const [gold, setGold] = useSyncedState(syncKey(APP.GOLD, charId), 0);
  const { items } = useContent();
  const { appendEvent } = useSessionLog();
  const charData = useCharacter(character);
  const appliedRef = useRef(new Set());

  const [adding, setAdding] = useState(false);
  const [hostUid, setHostUid] = useState('');
  const [augRef, setAugRef] = useState('');
  const [choice, setChoice] = useState('');

  const flatInventory = flattenInventory(charData?.inventory || []);
  const byUid = new Map(flatInventory.map((it) => [itemUidOf(it), it]));
  const augProjects = (craftProjects?.projects || []).filter((p) => p.kind === 'augment');
  const isTrainedCrafting = (charData?.skillProficiencies?.crafting || 0) >= 1;
  const augDocs = (items || []).filter(isAugmentation);
  // Owned weapon/armor/shield at least one augmentation fits (occupied hosts stay —
  // a swap replaces + destroys the old, warned below).
  const hosts = flatInventory.filter((it) => augDocs.some((a) => augmentationFits(it, a)));

  const host = byUid.get(hostUid) || null;
  const augOptions = host ? augDocs.filter((a) => augmentationFits(host, a)) : [];
  const selectedAug = augOptions.find((a) => String(a.id) === augRef) || null;
  const augChoices = selectedAug && Array.isArray(selectedAug.choices) ? selectedAug.choices : [];
  const price = Number(selectedAug?.price) || 0;
  const goldGp = Number(gold) || 0;
  const canStart = !!host && !!selectedAug && price <= goldGp && (!augChoices.length || !!choice);

  // Apply any augment project whose banked hours have met the flat day, writing the
  // augmentation onto the acquired overlay (chaining across multiple), then drop the
  // projects. Guarded against a double-fire like Crafting/Training completion.
  const completeSig = augProjects
    .filter((p) => (p.hours || 0) >= (p.threshold || AUGMENT_HOURS))
    .map((p) => p.id).join(',');
  useEffect(() => {
    const done = augProjects.filter(
      (p) => (p.hours || 0) >= (p.threshold || AUGMENT_HOURS) && !appliedRef.current.has(p.id),
    );
    if (!done.length) return;
    let nextAcq = Array.isArray(acquired) ? acquired : [];
    let nextRem = Array.isArray(removed) ? removed : [];
    const appliedIds = new Set();
    done.forEach((p) => {
      const hostItem = byUid.get(p.hostUid);
      const augDoc = augDocs.find((a) => String(a.id) === String(p.augRef));
      // Host re-uid'd (re-runed) or doc gone since start — leave the project for the
      // player to abandon rather than mis-applying.
      if (!hostItem || !augDoc) return;
      const entry = applyAugmentation(hostItem, augDoc, p.choice ? { choice: p.choice } : {});
      if (!entry) return;
      const res = applyGearEntry(nextAcq, nextRem, p.hostUid, entry);
      nextAcq = res.acquired;
      nextRem = res.removed;
      appliedIds.add(p.id);
      appliedRef.current.add(p.id);
      appendEvent({ type: 'action', text: `${character?.name || 'Someone'} fitted ${augDoc.name} to ${hostItem.name} (crafting)` });
    });
    if (!appliedIds.size) return;
    setAcquired(nextAcq);
    setRemoved(nextRem);
    setCraftProjects((prev) => ({ projects: (prev?.projects || []).filter((p) => !appliedIds.has(p.id)) }));
  // completeSig is the stable signature of the finished set; overlays are re-read
  // fresh inside and the synced setters are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completeSig]);

  // Trained gate + self-gating: no panel without an in-progress project or a host
  // something can be fitted to.
  if (!isTrainedCrafting || (augProjects.length === 0 && hosts.length === 0)) return null;

  const cancelAdding = () => { setAdding(false); setHostUid(''); setAugRef(''); setChoice(''); };

  const startProject = () => {
    if (!canStart) return;
    if (price > 0) setGold((g) => (Number(g) || 0) - price);
    setCraftProjects((prev) => ({
      projects: [...(prev?.projects || []), {
        id: makeId(),
        kind: 'augment',
        hostUid,
        hostName: host.name,
        augRef,
        augName: selectedAug.name,
        ...(augChoices.length && choice ? { choice } : {}),
        name: `Augment: ${host.name} — ${selectedAug.name}`,
        hours: 0,
        threshold: AUGMENT_HOURS,
        price,
        status: 'in-progress',
      }],
    }));
    cancelAdding();
  };

  const abandonProject = (id) =>
    setCraftProjects((prev) => ({ projects: (prev?.projects || []).filter((p) => p.id !== id) }));

  return (
    <div className="cp-wrap">
      <div className="cp-header">
        <span className="cp-title">Augment Gear</span>
        {!adding && hosts.length > 0 && (
          <button className="cp-new-btn" onClick={() => setAdding(true)}>+ New</button>
        )}
      </div>

      {augProjects.length > 0 && (
        <ul className="cp-list" aria-label="Augmentation projects">
          {augProjects.map((p) => {
            const threshold = p.threshold || AUGMENT_HOURS;
            const ready = (p.hours || 0) >= threshold;
            return (
              <li
                key={p.id}
                className={`cp-project${ready ? ' cp-project--ready' : ''}`}
                data-testid={`ag-project-${p.id}`}
              >
                <div className="cp-project-header">
                  <span className="cp-project-name">{p.name}</span>
                  <button
                    className="cp-abandon-btn"
                    onClick={() => abandonProject(p.id)}
                    aria-label={`Abandon ${p.name}`}
                  >
                    Abandon
                  </button>
                </div>
                {ready ? (
                  <div className="cp-completed" role="status">
                    <span className="cp-completed-badge">✓ Fitted</span>
                    <span className="cp-project-meta">Applied to {p.hostName}</span>
                  </div>
                ) : (
                  <>
                    <div className="cp-progress-row">
                      <div className="cp-progress-track">
                        <div
                          className="cp-progress-fill"
                          style={{ '--cp-fill': `${Math.min(100, ((p.hours || 0) / threshold) * 100)}%` }}
                        />
                      </div>
                      <span className="cp-progress-label">{p.hours || 0}h / {threshold}h</span>
                    </div>
                    <span className="cp-project-meta">A flat crafting day — no check</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!adding && augProjects.length === 0 && (
        <p className="cp-empty">No gear being augmented.</p>
      )}

      {adding && (
        <div className="cp-add-panel">
          <label className="cp-form-label">
            Gear
            <select
              className="cp-form-select"
              value={hostUid}
              onChange={(e) => { setHostUid(e.target.value); setAugRef(''); setChoice(''); }}
              aria-label="Augment host"
            >
              <option value="">— select gear —</option>
              {hosts.map((h) => (
                <option key={itemUidOf(h)} value={itemUidOf(h)}>{h.name}</option>
              ))}
            </select>
          </label>

          {host && (
            <label className="cp-form-label">
              Augmentation
              <select
                className="cp-form-select"
                value={augRef}
                onChange={(e) => { setAugRef(e.target.value); setChoice(''); }}
                aria-label="Augmentation"
              >
                <option value="">— select augmentation —</option>
                {augOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.price != null ? ` (${a.price} gp)` : ''}</option>
                ))}
              </select>
            </label>
          )}

          {augChoices.length > 0 && (
            <label className="cp-form-label">
              Choice
              <select
                className="cp-form-select"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                aria-label="Augmentation choice"
              >
                <option value="">— pick one —</option>
                {augChoices.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}

          {host && hasAugmentation(host) && selectedAug && (
            <p className="cp-project-meta">
              Replaces {augmentationOf(host)?.name || 'the current augmentation'} — the old one is destroyed.
            </p>
          )}

          {selectedAug && (
            <span className="cp-cost-note">
              {price} gp up front
              {price > goldGp && <span className="cp-cost-warn"> — over your {goldGp} gp</span>}
            </span>
          )}

          <div className="cp-add-footer">
            <button className="cp-confirm-btn" disabled={!canStart} onClick={startProject}>
              Start (1 day)
            </button>
            <button className="cp-cancel-btn" onClick={cancelAdding}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AugmentGearProjects;
