import React, { useMemo, useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { uploadImage } from '../../utils/gmApi';
import { resizeImageToBlob } from '../../utils/imageUpload';
import './ImageField.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const folderOf = (img) => (img.folder && String(img.folder).trim()) || 'Uncategorized';

const ImageField = ({ value, onChange, ariaLabel = 'image' }) => {
  const { images } = useContent();
  const catalog = Array.isArray(images) ? images : [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [pickerTab, setPickerTab] = useState('All');
  const [query, setQuery] = useState('');
  const fileRef = useRef(null);

  const current = catalog.find((img) => img.id === value) || null;

  const pickerTabs = useMemo(
    () => ['All', ...Array.from(new Set(catalog.map(folderOf))).sort()],
    [catalog]
  );
  const activeTab = pickerTabs.includes(pickerTab) ? pickerTab : 'All';
  const inTab = activeTab === 'All' ? catalog : catalog.filter((img) => folderOf(img) === activeTab);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inTab;
    return inTab.filter((img) =>
      [img.name, img.folder, img.id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [inTab, query]);

  const pickImage = (id) => {
    onChange(id);
    setPickerOpen(false);
    setQuery('');
  };

  const onFileChange = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, and WebP are allowed.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const blob = await resizeImageToBlob(file);
      const result = await uploadImage(blob, { name: file.name, folder: '' });
      onChange(result.id);
      setPickerOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="image-field" data-testid={`image-field-${ariaLabel}`}>
      <div className="image-field-row">
        {value && current ? (
          <img
            src={`/api/images/${value}`}
            alt={current.name}
            className="image-field-preview"
            aria-label={`${ariaLabel}-preview`}
          />
        ) : (
          <div className="image-field-empty" aria-label={`${ariaLabel}-empty`}>No image</div>
        )}
        <div className="image-field-controls">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setPickerOpen((o) => !o); setQuery(''); }}
            aria-label={`${ariaLabel}-choose`}
          >
            {pickerOpen ? 'Close picker' : 'Choose from catalog…'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={uploading}
            onClick={() => fileRef.current && fileRef.current.click()}
            aria-label={`${ariaLabel}-upload`}
          >
            {uploading ? 'Uploading…' : 'Upload new…'}
          </button>
          {value && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onChange('')}
              aria-label={`${ariaLabel}-remove`}
            >
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            aria-label={`${ariaLabel}-file-input`}
            style={{ display: 'none' }}
            onChange={onFileChange}
          />
        </div>
      </div>

      {error && <p className="gm-warn image-field-error" role="alert">{error}</p>}

      {pickerOpen && (
        <div className="image-field-picker" aria-label={`${ariaLabel}-picker`}>
          <nav className="gm-nav image-field-tabs">
            {pickerTabs.map((t) => (
              <button
                key={t}
                type="button"
                className={`gm-nav-link ${t === activeTab ? 'active' : ''}`}
                aria-pressed={t === activeTab}
                onClick={() => setPickerTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          <input
            aria-label={`${ariaLabel}-search`}
            placeholder="Search images…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="image-field-search"
          />
          {filtered.length === 0 ? (
            <p className="gm-hint">
              {catalog.length === 0
                ? 'No images yet — use "Upload new…" to add one.'
                : 'No images match.'}
            </p>
          ) : (
            <div className="image-field-grid">
              {filtered.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  className={`image-field-tile ${img.id === value ? 'image-field-tile--selected' : ''}`}
                  onClick={() => pickImage(img.id)}
                  aria-label={`${ariaLabel}-pick-${img.id}`}
                  data-testid={`image-field-pick-${img.id}`}
                >
                  <img src={`/api/images/${img.id}`} alt={img.name} className="image-field-thumb" />
                  <span className="image-field-tile-name">{img.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageField;
