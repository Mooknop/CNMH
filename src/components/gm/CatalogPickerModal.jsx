import React from 'react';
import Modal from '../shared/Modal';
import CatalogPicker from './CatalogPicker';

/**
 * Modal wrapper around the shared <CatalogPicker> body — used where the picker
 * floats over the page (GmCharacters inventory, EntryListEditor). GM Shops
 * renders <CatalogPicker> inline instead, so the picker isn't trapped under the
 * shell header by a backdrop-filtered .gm-card. Stacks above the item-edit modal
 * via Modal's highZ.
 *
 * Props:
 *   isOpen      – visibility
 *   onClose     – close without selecting
 *   catalog     – array of catalog item docs
 *   onSelect    – called with the array of chosen catalog items on submit
 *   title       – optional header text
 *   multiSelect – allow several items to be checked and added at once
 */
const CatalogPickerModal = ({ isOpen, onClose, catalog, onSelect, title, multiSelect = false }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={title || (multiSelect ? 'Add items from the catalog' : 'Choose a catalog item')}
    maxWidth="760px"
    highZ
  >
    <CatalogPicker
      catalog={catalog}
      multiSelect={multiSelect}
      onSelect={(items) => {
        onSelect(items);
        onClose();
      }}
      onCancel={onClose}
    />
  </Modal>
);

export default CatalogPickerModal;
