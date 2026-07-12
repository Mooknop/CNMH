import React, { useState, useEffect, useRef } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { getLevelBasedDc } from '../../utils/InventoryUtils';
import { craftCostCp, halfCostCp, dailyReductionCp, critFailLossCp } from '../../utils/craftingOutcome';
import { cpToGp } from '../../utils/earnIncome';
import { buildCraftingResult } from '../../utils/earnIncomeResults';
import { computeSaveDegree } from '../../utils/saveDegree';
import { periodState } from '../../utils/downtimeUtils';
import { catalogItemName } from '../../utils/spellItems';
import { isAugmentation, augmentationFits } from '../../utils/augmentations';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import './CraftingProjects.css';
import { APP, syncKey, globalKey } from '../../sync/keys';

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// Craft-time augmentation inclusion (#1202 U2): when the item being crafted is an
// augmentable host (weapon/armor/shield), the crafter can bake in an augmentation
// from the start — its price folds into the project cost and the granted item
// arrives with the binding. Renders nothing for a non-host item / no augmentations.
const CraftAugmentField = ({ hostItem, augDocs, augRef, onAug, augChoice, onChoice }) => {
  const options = hostItem ? (augDocs || []).filter((a) => augmentationFits(hostItem, a)) : [];
  if (!options.length) return null;
  const sel = options.find((a) => String(a.id) === augRef) || null;
  const choices = sel && Array.isArray(sel.choices) ? sel.choices : [];
  return (
    <>
      <label className="cp-form-label">
        Augmentation
        <select
          className="cp-form-select"
          value={augRef}
          onChange={(e) => { onAug(e.target.value); onChoice(''); }}
          aria-label="Craft augmentation"
        >
          <option value="">— none —</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>{a.name}{a.price != null ? ` (+${a.price} gp)` : ''}</option>
          ))}
        </select>
      </label>
      {choices.length > 0 && (
        <label className="cp-form-label">
          Choice
          <select
            className="cp-form-select"
            value={augChoice}
            onChange={(e) => onChoice(e.target.value)}
            aria-label="Craft augmentation choice"
          >
            <option value="">— pick one —</option>
            {choices.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
    </>
  );
};

const CraftingProjects = ({ character }) => {
  const charId = character?.id || 'unknown';
  const [craftProjects, setCraftProjects] = useSyncedState(syncKey(APP.CRAFTPROJECTS, charId), null);
  const [gold, setGold] = useSyncedState(syncKey(APP.GOLD, charId), 0);
  const [, setResults] = useSyncedState(globalKey(APP.DOWNTIMERESULTS), null);
  const [block] = useSyncedState(globalKey(APP.DOWNTIMEBLOCK), null);
  const [downtime] = useSyncedState(syncKey(APP.DOWNTIME, charId), null);
  const { items, spells } = useContent();

  // Follow-the-Expert (downtime): a Crafting pairing this period grants +2
  // circumstance to the Craft check. Kept in the period-scoped downtime `paired`
  // map (not the cross-mode followexpert key) so the bonus can't leak into
  // exploration. Cleared automatically when the period or pairing ends.
  const craftCircumstance = periodState(downtime, block?.startedAt).paired?.Crafting ? 2 : 0;
  const submittedRef = useRef(new Set());

  const [adding, setAdding] = useState(false); // false | 'recipe' | 'catalog'
  const [recipeIdx, setRecipeIdx] = useState(null);
  const [recipeLevel, setRecipeLevel] = useState('');
  const [catalogRef, setCatalogRef] = useState('');
  const [catalogLevel, setCatalogLevel] = useState('');
  const [augRef, setAugRef] = useState(''); // craft-time augmentation to bake in (#1202 U2)
  const [augChoice, setAugChoice] = useState('');
  const [checkInputs, setCheckInputs] = useState({}); // { [projectId]: { d20, total } }

  // `kind:'augment'` projects share this synced key (so the allocator's Crafting
  // bank accrues their hours) but are a lightweight no-check flow owned by the
  // AugmentGearProjects sibling — exclude them from this panel entirely (#1202 U2).
  const projects = (craftProjects?.projects || []).filter((p) => p.kind !== 'augment');

  // When a project reaches 'completed' (via Complete-now or working the cost to
  // zero), submit it to the GM review queue as a pending crafting result and
  // drop it from the player's list. submittedRef guards a double-fire (e.g.
  // Strict Mode) before the removal lands.
  const completedSig = projects.filter(p => p.status === 'completed').map(p => p.id).join(',');
  useEffect(() => {
    const completed = (craftProjects?.projects || []).filter(
      p => p.status === 'completed' && p.kind !== 'augment' && !submittedRef.current.has(p.id),
    );
    if (completed.length === 0) return;
    completed.forEach(p => submittedRef.current.add(p.id));
    setResults(prev => ({
      entries: [
        ...(prev?.entries || []),
        ...completed.map(p => buildCraftingResult({
          charId,
          charName: character?.name,
          ref: p.ref,
          level: p.level,
          itemName: p.name,
          degree: p.craftDegree,
          paidCp: p.costCp,
          augmentation: p.augmentation || null,
          augmentationName: p.augmentationName || null,
        })),
      ],
    }));
    setCraftProjects(prev => ({
      projects: (prev?.projects || []).filter(p => p.status !== 'completed'),
    }));
  // completedSig is the stable signature of the completed set; craftProjects is
  // re-read fresh inside and the synced setters are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedSig]);

  const knownRecipes = (character?.crafting || []).filter(r => r.name);
  // Scroll/wand catalog entries author no `name` (#812 — it's derived from the
  // spell), so resolve a display name for each before sorting/listing or they'd
  // render as blank rows (and the sort would throw on undefined).
  // Augmentations are never standalone-craftable (#1202 U2) — they're offered only
  // as a bake-in on an eligible host below, so keep them out of the craftable list.
  const catalogItems = (items || [])
    .filter((it) => !isAugmentation(it))
    .map((it) => ({ ...it, displayName: catalogItemName(it, spells) }))
    .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
  const selectedCatalogItem = catalogItems.find(i => i.id === catalogRef);
  const variants = selectedCatalogItem?.variants || [];

  const cancelAdding = () => {
    setAdding(false);
    setRecipeIdx(null);
    setRecipeLevel('');
    setCatalogRef('');
    setCatalogLevel('');
    setAugRef('');
    setAugChoice('');
  };

  const augDocs = (items || []).filter(isAugmentation);

  const craftRank = character?.skills?.crafting?.proficiency || 0;

  const startProject = (ref, level, name, source, price, augmentation = null) => {
    // A baked-in augmentation folds its Price into the project's material cost
    // (#1202 U2) — craftCostCp is linear in Price, so the effective price carries it.
    const augPrice = augmentation ? (Number(augmentation.price) || 0) : 0;
    const effPrice = (Number(price) || 0) + augPrice;
    const costCp = craftCostCp(effPrice);
    const paidCp = halfCostCp(effPrice);
    const remainingCp = costCp - paidCp;
    // Half the materials cost is paid up front from the crafter's personal gold.
    if (paidCp > 0) setGold(g => (Number(g) || 0) - cpToGp(paidCp));
    setCraftProjects(prev => ({
      projects: [...(prev?.projects || []), {
        id: makeId(),
        ref,
        level: level ?? null,
        name,
        source,
        threshold: source === 'recipe' ? 8 : 16,
        hours: 0,
        price: price ?? null,
        costCp,
        paidCp,
        remainingCp,
        craftRank,
        status: 'in-progress',
        ...(augmentation ? {
          augmentation: { ref: augmentation.ref, ...(augmentation.choice ? { choice: augmentation.choice } : {}) },
          augmentationName: augmentation.name,
        } : {}),
      }],
    }));
    cancelAdding();
  };

  const abandonProject = (id) => {
    setCraftProjects(prev => ({
      projects: (prev?.projects || []).filter(p => p.id !== id),
    }));
  };

  const updateProject = (id, patch) =>
    setCraftProjects(prev => ({
      projects: (prev?.projects || []).map(p => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const spendGoldCp = (cp) => {
    if (cp > 0) setGold(g => (Number(g) || 0) - cpToGp(cp));
  };

  // Threshold met → resolve the Craft check vs the item DC; park the project on
  // its degree so the player can decide how to finish.
  const makeCraftCheck = (p) => {
    const ci = checkInputs[p.id] || {};
    const d20 = parseInt(ci.d20, 10);
    const total = parseInt(ci.total, 10);
    if (!(d20 >= 1 && d20 <= 20) || !Number.isFinite(total)) return;
    // Add the Follow-the-Expert circumstance bonus (if any) to the entered total.
    const effectiveTotal = total + craftCircumstance;
    const degree = computeSaveDegree({ d20, total: effectiveTotal, dc: getLevelBasedDc(p.level) });
    updateProject(p.id, { status: 'awaiting-decision', craftD20: d20, craftTotal: effectiveTotal, craftDegree: degree });
  };

  // Finish now: pay the remaining materials cost and mark completed (item grant +
  // GM confirm land in Slice E; until then a completed card shows the outcome).
  const completeNow = (p) => {
    spendGoldCp(p.remainingCp || 0);
    updateProject(p.id, { remainingCp: 0, status: 'completed' });
  };

  // Keep working: each committed crafting day will whittle the remaining cost
  // (handled in DowntimeAllocator via dailyReductionCp).
  const continueReducing = (p) => updateProject(p.id, { status: 'reducing' });

  // Failed check: no progress toward finishing — re-bank the setup time and try
  // again (reset hours, clear the prior check).
  const keepWorking = (p) =>
    updateProject(p.id, { status: 'in-progress', hours: 0, craftDegree: null, craftD20: null, craftTotal: null });

  // Critical failure: ruin a slice of materials and scrap the project.
  const discardRuined = (p) => {
    spendGoldCp(critFailLossCp(p.price));
    abandonProject(p.id);
  };

  const setCheck = (id, field, value) =>
    setCheckInputs(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));

  const selectedRecipe = recipeIdx !== null ? knownRecipes[recipeIdx] : null;
  const recipeVariants = selectedRecipe?.variants || [];
  const canStartFromRecipe = recipeIdx !== null && (recipeVariants.length === 0 || !!recipeLevel);
  const canStartFromCatalog = !!catalogRef && (variants.length === 0 || !!catalogLevel);

  // Resolve the chosen item's Price (decimal gp) for the up-front half-cost.
  // Variants carry their own price; fall back to the base item when none.
  const priceFor = (base, variantList, levelStr) => {
    if (variantList.length > 0) {
      const v = levelStr ? variantList.find(x => x.level === parseInt(levelStr, 10)) : null;
      return v?.price ?? null;
    }
    return base?.price ?? null;
  };
  const recipePrice = selectedRecipe ? priceFor(selectedRecipe, recipeVariants, recipeLevel) : null;
  const catalogPrice = selectedCatalogItem ? priceFor(selectedCatalogItem, variants, catalogLevel) : null;

  // Craft-time augmentation (#1202 U2): the catalog item being crafted is the
  // augmentation host (a recipe resolves to the same catalog item by ref/id).
  const recipeHost = selectedRecipe
    ? catalogItems.find(i => String(i.id) === String(selectedRecipe.ref || selectedRecipe.id)) || null
    : null;
  const activeHost = adding === 'recipe' ? recipeHost : adding === 'catalog' ? selectedCatalogItem : null;
  // Only count the augmentation when it actually FITS the active host — a stale
  // pick left over from another host/tab folds nothing and grants nothing.
  const selectedAug = augRef && activeHost
    ? augDocs.find(a => String(a.id) === augRef && augmentationFits(activeHost, a)) || null
    : null;
  const augPrice = selectedAug ? (Number(selectedAug.price) || 0) : 0;
  // Fold the augmentation Price into the up-front preview / affordability; a
  // choice-bearing augmentation isn't ready until its choice is picked.
  const augReady = !selectedAug || !Array.isArray(selectedAug.choices) || !selectedAug.choices.length || !!augChoice;
  const withAug = (base) => (selectedAug ? (Number(base) || 0) + augPrice : base);
  const augArg = () => (selectedAug && augReady
    ? { ref: selectedAug.id, choice: augChoice || undefined, name: selectedAug.name, price: augPrice }
    : null);
  const augName = () => (selectedAug && augReady ? ` + ${selectedAug.name}` : '');

  const goldGp = Number(gold) || 0;
  // The crafter must have the up-front half-cost on hand to start (#593).
  const canAffordUpfront = (price) => cpToGp(halfCostCp(price)) <= goldGp;

  // Up-front cost preview (half the Price). Over-budget is a hard block — the
  // Start button disables — so the note marks the reason (#593).
  const upfrontNote = (price) => {
    if (price == null) return null;
    const upfront = cpToGp(halfCostCp(price));
    return (
      <span className="cp-cost-note">
        Up-front: {upfront} gp <span className="cp-cost-sub">(½ of {price} gp)</span>
        {upfront > goldGp && (
          <span className="cp-cost-warn"> — over your {goldGp} gp</span>
        )}
      </span>
    );
  };

  return (
    <div className="cp-wrap">
      <div className="cp-header">
        <span className="cp-title">Crafting Projects</span>
        {!adding && (
          <button className="cp-new-btn" onClick={() => setAdding('recipe')}>+ New</button>
        )}
      </div>

      {projects.length > 0 && (
        <ul className="cp-list" aria-label="Crafting projects">
          {projects.map(p => {
            const status = p.status || 'in-progress';
            const atThreshold = p.hours >= p.threshold;
            const ci = checkInputs[p.id] || {};
            const d20Num = parseInt(ci.d20, 10);
            const totalNum = parseInt(ci.total, 10);
            const checkValid = d20Num >= 1 && d20Num <= 20 && Number.isFinite(totalNum);
            const remainingGp = cpToGp(p.remainingCp || 0);
            const perDayGp = cpToGp(dailyReductionCp({ itemLevel: p.level, craftingRank: p.craftRank, degree: p.craftDegree }));
            // Can't pay off the remainder right now → Complete-now is blocked;
            // Continue (work it off) stays open (#593).
            const canAffordRemaining = remainingGp <= (Number(gold) || 0);
            const isCheckStage = status === 'in-progress' && atThreshold;
            return (
              <li
                key={p.id}
                className={`cp-project${(isCheckStage || status === 'awaiting-decision') ? ' cp-project--ready' : ''}`}
                data-testid={`cp-project-${p.id}`}
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

                {status === 'completed' ? (
                  <div className="cp-completed" role="status">
                    <span className="cp-completed-badge">✓ Completed</span>
                    <span className="cp-project-meta">{DEGREE_LABELS[p.craftDegree] || 'Done'} — awaiting GM grant</span>
                  </div>
                ) : isCheckStage ? (
                  <div className="cp-ready">
                    <span className="cp-ready-badge">Setup done — make your Craft check (DC {getLevelBasedDc(p.level)})</span>
                    {craftCircumstance > 0 && (
                      <span className="cp-ready-bonus">✦ +{craftCircumstance} circumstance (Follow the Expert) added automatically — enter your raw total</span>
                    )}
                    <div className="cp-ready-row">
                      <label className="cp-ready-label">
                        d20
                        <input
                          type="number"
                          className="cp-ready-input"
                          min={1}
                          max={20}
                          value={ci.d20 ?? ''}
                          onChange={e => setCheck(p.id, 'd20', e.target.value)}
                          aria-label={`d20 die for ${p.name}`}
                          placeholder="—"
                        />
                      </label>
                      <label className="cp-ready-label">
                        total
                        <input
                          type="number"
                          className="cp-ready-input"
                          value={ci.total ?? ''}
                          onChange={e => setCheck(p.id, 'total', e.target.value)}
                          aria-label={`check total for ${p.name}`}
                          placeholder="—"
                        />
                      </label>
                      <button
                        className="cp-complete-btn"
                        disabled={!checkValid}
                        onClick={() => makeCraftCheck(p)}
                        aria-label={`Resolve Craft check for ${p.name}`}
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ) : status === 'awaiting-decision' ? (
                  <div className="cp-decision">
                    <span className={`cp-degree cp-degree--${p.craftDegree}`}>{DEGREE_LABELS[p.craftDegree]}</span>
                    {(p.craftDegree === 'success' || p.craftDegree === 'criticalSuccess') && (
                      <>
                        <span className="cp-project-meta">
                          {remainingGp} gp to finish now, or work it off ({perDayGp} gp/day).
                          {!canAffordRemaining && <span className="cp-cost-warn"> Can&rsquo;t afford to finish — keep working.</span>}
                        </span>
                        <div className="cp-decision-actions">
                          <button
                            className="cp-complete-btn"
                            disabled={!canAffordRemaining}
                            onClick={() => completeNow(p)}
                            aria-label={`Complete ${p.name} now`}
                          >
                            Complete now ({remainingGp} gp)
                          </button>
                          <button className="cp-continue-btn" onClick={() => continueReducing(p)} aria-label={`Continue ${p.name}`}>
                            Continue ({perDayGp} gp/day)
                          </button>
                        </div>
                      </>
                    )}
                    {p.craftDegree === 'failure' && (
                      <>
                        <span className="cp-project-meta">No progress — re-bank the setup time and try again.</span>
                        <div className="cp-decision-actions">
                          <button className="cp-continue-btn" onClick={() => keepWorking(p)} aria-label={`Keep working ${p.name}`}>
                            Keep working
                          </button>
                        </div>
                      </>
                    )}
                    {p.craftDegree === 'criticalFailure' && (
                      <>
                        <span className="cp-project-meta">Materials ruined — lose {cpToGp(critFailLossCp(p.price))} gp.</span>
                        <div className="cp-decision-actions">
                          <button className="cp-abandon-btn" onClick={() => discardRuined(p)} aria-label={`Discard ${p.name}`}>
                            Discard (−{cpToGp(critFailLossCp(p.price))} gp)
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : status === 'reducing' ? (
                  <div className="cp-decision">
                    <span className="cp-project-meta">
                      Working off the cost — {remainingGp} gp left, −{perDayGp} gp per crafting day committed.
                    </span>
                    <div className="cp-decision-actions">
                      <button
                        className="cp-complete-btn"
                        disabled={!canAffordRemaining}
                        onClick={() => completeNow(p)}
                        aria-label={`Finish ${p.name} now`}
                      >
                        Pay {remainingGp} gp &amp; finish
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="cp-progress-row">
                      <div className="cp-progress-track">
                        <div
                          className="cp-progress-fill"
                          style={{ '--cp-fill': `${Math.min(100, (p.hours / p.threshold) * 100)}%` }}
                        />
                      </div>
                      <span className="cp-progress-label">{p.hours}h / {p.threshold}h</span>
                    </div>
                    {p.level != null && (
                      <span className="cp-project-meta">
                        Level {p.level} · DC {getLevelBasedDc(p.level)} · {p.source === 'recipe' ? '8h (recipe)' : '16h (item)'}
                        {p.remainingCp != null && p.remainingCp > 0 && (
                          <> · {cpToGp(p.remainingCp)} gp left</>
                        )}
                      </span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!adding && projects.length === 0 && (
        <p className="cp-empty">No active projects.</p>
      )}

      {adding && (
        <div className="cp-add-panel">
          <div className="cp-add-tabs">
            <button
              className={`cp-add-tab${adding === 'recipe' ? ' cp-add-tab--active' : ''}`}
              onClick={() => { setAdding('recipe'); setRecipeIdx(null); setAugRef(''); setAugChoice(''); }}
            >
              From Recipe ({knownRecipes.length})
            </button>
            <button
              className={`cp-add-tab${adding === 'catalog' ? ' cp-add-tab--active' : ''}`}
              onClick={() => { setAdding('catalog'); setCatalogRef(''); setCatalogLevel(''); setAugRef(''); setAugChoice(''); }}
            >
              From Catalog
            </button>
          </div>

          {adding === 'recipe' && (
            <>
              {knownRecipes.length === 0 ? (
                <p className="cp-empty">No known recipes.</p>
              ) : (
                <ul className="cp-recipe-list" aria-label="Known recipes">
                  {knownRecipes.map((r, i) => (
                    <li key={i}>
                      <button
                        className={`cp-recipe-btn${recipeIdx === i ? ' cp-recipe-btn--selected' : ''}`}
                        onClick={() => { setRecipeIdx(recipeIdx === i ? null : i); setRecipeLevel(''); setAugRef(''); setAugChoice(''); }}
                        data-testid={`cp-recipe-${i}`}
                      >
                        <span className="cp-recipe-name">{r.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {recipeVariants.length > 0 && (
                <label className="cp-form-label">
                  Grade
                  <select
                    className="cp-form-select"
                    value={recipeLevel}
                    onChange={e => setRecipeLevel(e.target.value)}
                    aria-label="Recipe grade"
                  >
                    <option value="">— select grade —</option>
                    {recipeVariants.map(v => (
                      <option key={v.level} value={String(v.level)}>
                        {v.label} (Level {v.level})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {recipeIdx !== null && (
                <CraftAugmentField
                  hostItem={recipeHost} augDocs={augDocs}
                  augRef={augRef} onAug={setAugRef} augChoice={augChoice} onChoice={setAugChoice}
                />
              )}
              {canStartFromRecipe && upfrontNote(withAug(recipePrice))}
              <div className="cp-add-footer">
                <button
                  className="cp-confirm-btn"
                  disabled={!canStartFromRecipe || !augReady || !canAffordUpfront(withAug(recipePrice))}
                  onClick={() => {
                    const r = knownRecipes[recipeIdx];
                    const lvl = recipeLevel ? parseInt(recipeLevel, 10) : null;
                    const v = lvl != null ? recipeVariants.find(x => x.level === lvl) : null;
                    const name = `${v ? `${r.name} (${v.label})` : r.name}${augName()}`;
                    startProject(r.ref || r.id, lvl, name, 'recipe', recipePrice, augArg());
                  }}
                >
                  Start project
                </button>
                <button className="cp-cancel-btn" onClick={cancelAdding}>Cancel</button>
              </div>
            </>
          )}

          {adding === 'catalog' && (
            <>
              <div className="cp-catalog-form">
                <label className="cp-form-label">
                  Item
                  <select
                    className="cp-form-select"
                    value={catalogRef}
                    onChange={e => { setCatalogRef(e.target.value); setCatalogLevel(''); setAugRef(''); setAugChoice(''); }}
                    aria-label="Catalog item"
                  >
                    <option value="">— select item —</option>
                    {catalogItems.map(i => (
                      <option key={i.id} value={i.id}>{i.displayName}</option>
                    ))}
                  </select>
                </label>
                {variants.length > 0 && (
                  <label className="cp-form-label">
                    Grade
                    <select
                      className="cp-form-select"
                      value={catalogLevel}
                      onChange={e => setCatalogLevel(e.target.value)}
                      aria-label="Item grade"
                    >
                      <option value="">— select grade —</option>
                      {variants.map(v => (
                        <option key={v.level} value={String(v.level)}>
                          {v.label} (Level {v.level})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {selectedCatalogItem && (
                <CraftAugmentField
                  hostItem={selectedCatalogItem} augDocs={augDocs}
                  augRef={augRef} onAug={setAugRef} augChoice={augChoice} onChoice={setAugChoice}
                />
              )}
              {canStartFromCatalog && upfrontNote(withAug(catalogPrice))}
              <div className="cp-add-footer">
                <button
                  className="cp-confirm-btn"
                  disabled={!canStartFromCatalog || !augReady || !canAffordUpfront(withAug(catalogPrice))}
                  onClick={() => {
                    const lvl = catalogLevel ? parseInt(catalogLevel, 10) : null;
                    const v = lvl != null ? variants.find(x => x.level === lvl) : null;
                    const baseName = v ? `${selectedCatalogItem.displayName} (${v.label})` : selectedCatalogItem.displayName;
                    startProject(selectedCatalogItem.id, lvl, `${baseName}${augName()}`, 'catalog-item', catalogPrice, augArg());
                  }}
                >
                  Start project
                </button>
                <button className="cp-cancel-btn" onClick={cancelAdding}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CraftingProjects;
