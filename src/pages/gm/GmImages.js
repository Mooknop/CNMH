import React, { useMemo, useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';
import { uploadImage, deleteImage } from '../../utils/gmApi';
import { resizeImageToBlob } from '../../utils/imageUpload';
import { existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import './gm.css';
import './GmImages.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const folderOf = (img) => (img.folder && String(img.folder).trim()) || 'Uncategorized';

const toForm = (img) => ({
  id: img.id,
  name: img.name || '',
  folder: img.folder || '',
  mimeType: img.mimeType || '',
  createdAt: img.createdAt,
});

const ImageForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [img, setImg] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [refList, setRefList] = useState(null); // blocked-delete references

  const set = (patch) => setImg((cur) => ({ ...cur, ...patch }));

  const save = async () => {
    if (!img.name.trim()) { setError('Name is required.'); return; }
    const id = img.id;
    if (!id) { setError('No image id.'); return; }
    const payload = { id, name: img.name.trim(), folder: img.folder.trim(), mimeType: img.mimeType, createdAt: img.createdAt };
    setBusy(true); setError(null);
    try {
      await saveDocument('image', id, payload);
      onSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setConfirm(null);
    setBusy(true); setError(null);
    try {
      await deleteImage(img.id);
      onSaved(false);
    } catch (err) {
      if (err.references && err.references.length > 0) {
        setRefList(err.references);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`image-form-${img.id || 'new'}`}>
      {img.id && (
        <div className="gm-image-preview">
          <img src={`/api/images/${img.id}`} alt={img.name} className="gm-image-thumb-lg" />
        </div>
      )}

      <div className="gm-row">
        <div className="form-group">
          <label>Name</label>
          <input aria-label="name" value={img.name} onChange={(ev) => set({ name: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>Folder</label>
          <input
            aria-label="folder"
            placeholder="portraits / loot / lore / …"
            value={img.folder}
            onChange={(ev) => set({ folder: ev.target.value })}
          />
        </div>
      </div>

      {!isNew && (
        <p className="gm-count">
          {img.mimeType} · uploaded {img.createdAt ? new Date(img.createdAt).toLocaleDateString() : '—'}
        </p>
      )}

      {error && <p className="gm-warn" role="alert">{error}</p>}

      {refList && (
        <div className="gm-warn" role="alert">
          <strong>Cannot delete — image is in use by:</strong>
          <ul>
            {refList.map((r) => (
              <li key={`${r.collection}-${r.id}`}>{r.name} ({r.collection})</li>
            ))}
          </ul>
          <button className="btn-secondary" onClick={() => setRefList(null)}>Dismiss</button>
        </div>
      )}

      {!isNew && !refList && (
        <div className="gm-actions">
          <button className="btn-primary" disabled={busy} onClick={save}>Save</button>
          <button className="btn-secondary" disabled={busy} onClick={() => setShowHistory(true)}>History</button>
          <button className="btn-danger" disabled={busy} onClick={() => setConfirm({ kind: 'delete' })}>Delete</button>
        </div>
      )}

      {!isNew && (
        <HistoryModal
          isOpen={showHistory}
          collection="image"
          id={img.id}
          name={img.name}
          onClose={() => setShowHistory(false)}
          onRestored={(doc) => {
            setShowHistory(false);
            if (doc) setImg(toForm(doc));
            setError(null);
            onRestored();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirm?.kind === 'delete'}
        title="Delete image"
        message={`Permanently delete "${img.name}" from R2 and the catalog. This cannot be undone.`}
        confirmLabel="Delete forever"
        requireType={img.name}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmImages = () => {
  const { images } = useContent();
  const catalog = useMemo(() => (Array.isArray(images) ? images : []), [images]);
  const existingIds = useMemo(() => existingIdSet(catalog), [catalog]);

  const [tab, setTab] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null); // id of selected entry
  const [flash, setFlash] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileRef = useRef(null);

  const tabs = useMemo(
    () => ['All', ...Array.from(new Set(catalog.map(folderOf))).sort()],
    [catalog]
  );
  const activeTab = tabs.includes(tab) ? tab : 'All';

  const inTab = useMemo(
    () => (activeTab === 'All' ? catalog : catalog.filter((img) => folderOf(img) === activeTab)),
    [catalog, activeTab]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inTab;
    return inTab.filter((img) =>
      [img.name, img.folder, img.id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [inTab, query]);

  const onSaved = () => {
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onRestored = () => setFlash('Restored.');

  const onFileChange = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Only JPEG, PNG, and WebP are allowed.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const blob = await resizeImageToBlob(file);
      const folder = activeTab === 'All' ? '' : activeTab;
      const result = await uploadImage(blob, { name: file.name, folder });
      setSelected(result.id);
      setFlash('Image uploaded.');
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const selectedEntry = catalog.find((img) => img.id === selected);

  return (
    <div className="gm-images">
      {flash && <p className="gm-ok" role="status">{flash}</p>}

      <nav className="gm-nav" aria-label="image folders">
        {tabs.map((t) => (
          <button
            key={t}
            className={`gm-nav-link ${t === activeTab ? 'active' : ''}`}
            aria-pressed={t === activeTab}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="gm-images-toolbar">
        <div className="form-group" style={{ flex: 1 }}>
          <input
            aria-label="filter"
            placeholder={`Filter ${inTab.length} image${inTab.length !== 1 ? 's' : ''}…`}
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
        </div>
        <button
          className="btn-primary"
          disabled={uploading}
          onClick={() => fileRef.current && fileRef.current.click()}
        >
          {uploading ? 'Uploading…' : '+ Upload image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          aria-label="upload-file"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
      </div>

      {uploadError && <p className="gm-warn" role="alert">{uploadError}</p>}

      <p className="gm-count">Showing {filtered.length} of {inTab.length}</p>

      <div className="gm-images-layout">
        <div className="gm-images-grid">
          {filtered.map((img) => (
            <button
              key={img.id}
              className={`gm-image-tile ${img.id === selected ? 'gm-image-tile--selected' : ''}`}
              onClick={() => setSelected(img.id === selected ? null : img.id)}
              data-testid={`image-tile-${img.id}`}
            >
              <img src={`/api/images/${img.id}`} alt={img.name} className="gm-image-thumb" />
              <span className="gm-image-name">{img.name}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="gm-hint">
              {catalog.length === 0
                ? 'No images yet — upload one to get started.'
                : 'No images match the current filter.'}
            </p>
          )}
        </div>

        {selectedEntry && (
          <div className="gm-images-detail">
            <ImageForm
              key={selectedEntry.id}
              initial={toForm(selectedEntry)}
              isNew={false}
              existingIds={existingIds}
              onSaved={onSaved}
              onRestored={onRestored}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default GmImages;
