import React from 'react';
import ConfirmDialog from '../shared/ConfirmDialog';
import HistoryModal from './HistoryModal';

const article = (noun) => (/^[aeiou]/i.test(noun) ? 'An' : 'A');

// Companion to useGmEntryForm (#1312): the History modal + the delete and
// collision ConfirmDialogs every GM editor page wired by hand. Renders
// nothing visible until the form state opens one of them.
//
// `onRestored(doc)` receives the restored document so the page can reset its
// form state; closing the modal and clearing the error is handled here.
// `deleteMessage` overrides the stock warning when a page needs extra context
// (e.g. GmQuests points at History).
const GmEntryDialogs = ({
  form,
  collection,
  noun,
  id,
  name,
  isNew,
  onRestored,
  deleteMessage,
}) => (
  <>
    {!isNew && id != null && (
      <HistoryModal
        isOpen={form.showHistory}
        collection={collection}
        id={id}
        name={name}
        onClose={() => form.setShowHistory(false)}
        onRestored={(doc) => {
          form.setShowHistory(false);
          form.setError(null);
          onRestored?.(doc);
        }}
      />
    )}
    <ConfirmDialog
      isOpen={form.confirm?.kind === 'delete'}
      title={`Delete ${noun}`}
      message={deleteMessage || `Permanently delete the ${noun} "${name}". This cannot be undone.`}
      confirmLabel="Delete forever"
      requireType={name}
      onConfirm={() => form.remove(id)}
      onCancel={form.cancelConfirm}
    />
    <ConfirmDialog
      isOpen={form.confirm?.kind === 'collision'}
      title={`Overwrite existing ${noun}?`}
      message={`${article(noun)} ${noun} with id "${form.confirm?.id}" already exists. Saving will overwrite it.`}
      confirmLabel="Overwrite"
      onConfirm={form.confirmCollision}
      onCancel={form.cancelConfirm}
    />
  </>
);

export default GmEntryDialogs;
