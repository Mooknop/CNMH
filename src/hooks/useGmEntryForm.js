import { useState } from 'react';
import { saveDocument, deleteDocument } from '../utils/gmApi';

// Shared GM detail-form engine (#1312). Owns the state quartet + the
// save/delete/collision/history flow that was copy-pasted across ~10 GM
// editor pages. The page keeps what is genuinely its own: form state, the
// toForm/fromForm codecs, id derivation, and the JSX.
//
//   const form = useGmEntryForm({ collection: 'trait', isNew, existingIds, onSaved });
//   const save = () => {
//     let body;
//     try { body = fromForm(t); } catch (err) { form.setError(err.message); return; }
//     const id = t.id || slugify(body.name);
//     form.save(id, { ...body, id });
//   };
//   ...
//   <button disabled={form.busy} onClick={save}>Save</button>
//   <GmEntryDialogs form={form} collection="trait" noun="trait" id={t.id} name={t.name}
//                   isNew={isNew} onRestored={(doc) => setT(toForm(doc))} />
//
// `confirm` is null | { kind: 'delete' } | { kind: 'collision', id, payload } —
// the exact shape the pages used, so GmEntryDialogs (or bespoke dialogs) can
// key off it.
export function useGmEntryForm({ collection, isNew, existingIds, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument(collection, id, payload);
      onSaved(isNew, id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Save with the new-entry collision guard: creating over an existing id asks
  // for an explicit overwrite instead of silently clobbering.
  const save = async (id, payload) => {
    if (isNew && existingIds && existingIds.has(id)) {
      setConfirm({ kind: 'collision', id, payload });
      return;
    }
    await submit(id, payload);
  };

  const remove = async (id) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await deleteDocument(collection, id);
      onSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    setError,
    confirm,
    showHistory,
    setShowHistory,
    save,
    submit,
    remove,
    requestDelete: () => setConfirm({ kind: 'delete' }),
    cancelConfirm: () => setConfirm(null),
    confirmCollision: () => submit(confirm.id, confirm.payload),
  };
}

export default useGmEntryForm;
