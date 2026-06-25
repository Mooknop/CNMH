import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GmImages from './GmImages';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({
  saveDocument: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  auditImages: vi.fn(() => new Promise(() => {})), // never resolves; modal stays in "scanning"
  sweepImages: vi.fn(),
  listUnregisteredImages: vi.fn(() => Promise.resolve({ unregistered: [] })),
  adoptImages: vi.fn(),
}));
vi.mock('../../utils/imageUpload', () => ({ resizeImageToBlob: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { saveDocument, uploadImage, deleteImage, listUnregisteredImages, adoptImages } from '../../utils/gmApi';
import { resizeImageToBlob } from '../../utils/imageUpload';

const portrait = {
  id: 'img_abc.jpg',
  name: 'Pellias portrait',
  folder: 'portraits',
  mimeType: 'image/jpeg',
  createdAt: 1700000000000,
};
const item = {
  id: 'img_def.png',
  name: 'Sword of Doom',
  folder: 'items',
  mimeType: 'image/png',
  createdAt: 1700000001000,
};

const setContent = (images = [portrait, item]) =>
  useContent.mockReturnValue({ images });

// mockReset (vite.config.js) wipes factory impls before each test; GmImages
// fetches the unregistered listing on mount, so give it a resolving default.
beforeEach(() => listUnregisteredImages.mockResolvedValue({ unregistered: [] }));

afterEach(() => vi.restoreAllMocks());

describe('GmImages', () => {
  it('renders a tile for each image', () => {
    setContent();
    render(<GmImages />);
    expect(screen.getByTestId('image-tile-img_abc.jpg')).toBeInTheDocument();
    expect(screen.getByTestId('image-tile-img_def.png')).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
  });

  it('offers a Reclaim unused action that opens the GC modal', () => {
    setContent();
    render(<GmImages />);
    const btn = screen.getByRole('button', { name: /Reclaim unused/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByText(/Reclaim unused images/i)).toBeInTheDocument(); // modal title
  });

  it('filters by name', () => {
    setContent();
    render(<GmImages />);
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'pellias' } });
    expect(screen.getByTestId('image-tile-img_abc.jpg')).toBeInTheDocument();
    expect(screen.queryByTestId('image-tile-img_def.png')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
  });

  it('folder tabs filter images', () => {
    setContent();
    render(<GmImages />);
    fireEvent.click(screen.getByRole('button', { name: 'items' }));
    expect(screen.queryByTestId('image-tile-img_abc.jpg')).not.toBeInTheDocument();
    expect(screen.getByTestId('image-tile-img_def.png')).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 1/)).toBeInTheDocument();
  });

  it('selecting a tile shows the detail editor', () => {
    setContent();
    render(<GmImages />);
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    expect(screen.getByTestId('image-form-img_abc.jpg')).toBeInTheDocument();
    expect(screen.getByLabelText('name')).toHaveValue('Pellias portrait');
  });

  it('deselects a tile on second click', () => {
    setContent();
    render(<GmImages />);
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    expect(screen.getByTestId('image-form-img_abc.jpg')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    expect(screen.queryByTestId('image-form-img_abc.jpg')).not.toBeInTheDocument();
  });

  it('saves a name/folder change', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmImages />);
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    const form = screen.getByTestId('image-form-img_abc.jpg');
    fireEvent.change(form.querySelector('[aria-label="name"]'), { target: { value: 'Pellias updated' } });
    fireEvent.click(form.querySelector('.btn-primary'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledWith(
      'image',
      'img_abc.jpg',
      expect.objectContaining({ name: 'Pellias updated', folder: 'portraits' })
    ));
    expect(await screen.findByRole('status')).toHaveTextContent(/Saved/);
  });

  it('requires name to save', async () => {
    setContent();
    render(<GmImages />);
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    const form = screen.getByTestId('image-form-img_abc.jpg');
    fireEvent.change(form.querySelector('[aria-label="name"]'), { target: { value: '' } });
    fireEvent.click(form.querySelector('.btn-primary'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/required/i);
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('deletes successfully after typed confirm', async () => {
    setContent();
    deleteImage.mockResolvedValue({ ok: true });
    render(<GmImages />);
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    const form = screen.getByTestId('image-form-img_abc.jpg');
    fireEvent.click(form.querySelector('.btn-danger'));
    // ConfirmDialog requires typing the name
    const input = screen.getByLabelText('confirm-input');
    fireEvent.change(input, { target: { value: 'Pellias portrait' } });
    fireEvent.click(screen.getByRole('button', { name: /delete forever/i }));
    await waitFor(() => expect(deleteImage).toHaveBeenCalledWith('img_abc.jpg'));
  });

  it('shows reference list when delete is blocked (409)', async () => {
    setContent();
    const err = new Error('Image is in use');
    err.references = [{ collection: 'character', id: 'pellias', name: 'Pellias' }];
    deleteImage.mockRejectedValue(err);
    render(<GmImages />);
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    const form = screen.getByTestId('image-form-img_abc.jpg');
    fireEvent.click(form.querySelector('.btn-danger'));
    const input = screen.getByLabelText('confirm-input');
    fireEvent.change(input, { target: { value: 'Pellias portrait' } });
    fireEvent.click(screen.getByRole('button', { name: /delete forever/i }));
    expect(await screen.findByText(/cannot delete/i)).toBeInTheDocument();
    expect(screen.getByText('Pellias (character)')).toBeInTheDocument();
  });

  it('uploads a file, resizes it, and shows the new tile', async () => {
    setContent([portrait]);
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    resizeImageToBlob.mockResolvedValue(blob);
    uploadImage.mockResolvedValue({ id: 'img_new.jpg', name: 'photo.jpg', folder: '', mimeType: 'image/jpeg', createdAt: Date.now() });
    // Also update the catalog after upload (ContentContext will live-update in prod;
    // in test we just verify uploadImage was called with the blob)
    render(<GmImages />);
    const fileInput = screen.getByLabelText('upload-file');
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(resizeImageToBlob).toHaveBeenCalledWith(file));
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(blob, expect.objectContaining({ name: 'photo.jpg' })));
    expect(await screen.findByRole('status')).toHaveTextContent(/uploaded/i);
  });

  it('rejects non-image file types at the client', async () => {
    setContent();
    render(<GmImages />);
    const fileInput = screen.getByLabelText('upload-file');
    const file = new File(['<svg/>'], 'evil.svg', { type: 'image/svg+xml' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/jpeg.*png.*webp/i);
    expect(resizeImageToBlob).not.toHaveBeenCalled();
  });

  it('shows error when save fails', async () => {
    setContent();
    saveDocument.mockRejectedValue(new Error('Network error'));
    render(<GmImages />);
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    const form = screen.getByTestId('image-form-img_abc.jpg');
    fireEvent.click(form.querySelector('.btn-primary'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i);
  });

  it('shows generic error when delete fails without references', async () => {
    setContent();
    deleteImage.mockRejectedValue(new Error('Server error'));
    render(<GmImages />);
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    const form = screen.getByTestId('image-form-img_abc.jpg');
    fireEvent.click(form.querySelector('.btn-danger'));
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Pellias portrait' } });
    fireEvent.click(screen.getByRole('button', { name: /delete forever/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/server error/i);
  });

  it('dismiss button clears the reference block list', async () => {
    setContent();
    const err = new Error('Image is in use');
    err.references = [{ collection: 'character', id: 'pellias', name: 'Pellias' }];
    deleteImage.mockRejectedValue(err);
    render(<GmImages />);
    fireEvent.click(screen.getByTestId('image-tile-img_abc.jpg'));
    const form = screen.getByTestId('image-form-img_abc.jpg');
    fireEvent.click(form.querySelector('.btn-danger'));
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Pellias portrait' } });
    fireEvent.click(screen.getByRole('button', { name: /delete forever/i }));
    expect(await screen.findByText(/cannot delete/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/cannot delete/i)).not.toBeInTheDocument();
  });

  it('shows upload error when resize fails', async () => {
    setContent();
    resizeImageToBlob.mockRejectedValue(new Error('Canvas error'));
    render(<GmImages />);
    const fileInput = screen.getByLabelText('upload-file');
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/canvas error/i);
  });

  it('shows empty-catalog hint when no images', () => {
    setContent([]);
    render(<GmImages />);
    expect(screen.getByText(/no images yet/i)).toBeInTheDocument();
  });

  it('shows no-match hint when filter matches nothing', () => {
    setContent([portrait]);
    render(<GmImages />);
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'zzznomatch' } });
    expect(screen.getByText(/no images match/i)).toBeInTheDocument();
  });

  describe('stranded R2 images (#757)', () => {
    const stranded = { id: 'tok_orphan.webp', size: 2048, uploaded: 1700000000000 };

    it('surfaces stranded R2 objects as flagged tiles in the grid', async () => {
      setContent([portrait]);
      listUnregisteredImages.mockResolvedValue({ unregistered: [stranded] });
      render(<GmImages />);
      const tile = await screen.findByTestId('unregistered-tile-tok_orphan.webp');
      expect(tile.querySelector('.gm-image-badge')).toHaveTextContent('Unregistered');
      expect(screen.getByText(/1 unregistered/)).toBeInTheDocument();
    });

    it('adopts a single image and flashes', async () => {
      setContent([portrait]);
      listUnregisteredImages.mockResolvedValue({ unregistered: [stranded] });
      adoptImages.mockResolvedValue({ adopted: [{ id: stranded.id }], skipped: [] });
      render(<GmImages />);
      const tile = await screen.findByTestId('unregistered-tile-tok_orphan.webp');
      fireEvent.click(tile.querySelector('.gm-image-adopt'));
      await waitFor(() => expect(adoptImages).toHaveBeenCalledWith(['tok_orphan.webp']));
      expect(await screen.findByRole('status')).toHaveTextContent(/Adopted 1 image/);
      // optimistically removed from the unregistered list
      expect(screen.queryByTestId('unregistered-tile-tok_orphan.webp')).not.toBeInTheDocument();
    });

    it('"Adopt all" adopts every stranded id', async () => {
      const stranded2 = { id: 'img_lost.png', size: 1, uploaded: 1 };
      setContent([portrait]);
      listUnregisteredImages.mockResolvedValue({ unregistered: [stranded, stranded2] });
      adoptImages.mockResolvedValue({ adopted: [{ id: stranded.id }, { id: stranded2.id }], skipped: [] });
      render(<GmImages />);
      const btn = await screen.findByRole('button', { name: /Adopt all \(2\)/ });
      fireEvent.click(btn);
      await waitFor(() => expect(adoptImages).toHaveBeenCalledWith(['tok_orphan.webp', 'img_lost.png']));
      expect(await screen.findByRole('status')).toHaveTextContent(/Adopted 2 images/);
    });

    it('the Unregistered tab shows only stranded tiles', async () => {
      setContent([portrait]);
      listUnregisteredImages.mockResolvedValue({ unregistered: [stranded] });
      render(<GmImages />);
      fireEvent.click(await screen.findByRole('button', { name: 'Unregistered' }));
      expect(screen.getByTestId('unregistered-tile-tok_orphan.webp')).toBeInTheDocument();
      expect(screen.queryByTestId('image-tile-img_abc.jpg')).not.toBeInTheDocument();
    });

    it('shows an adopt error when the call fails', async () => {
      setContent([portrait]);
      listUnregisteredImages.mockResolvedValue({ unregistered: [stranded] });
      adoptImages.mockRejectedValue(new Error('Adopt failed'));
      render(<GmImages />);
      const tile = await screen.findByTestId('unregistered-tile-tok_orphan.webp');
      fireEvent.click(tile.querySelector('.gm-image-adopt'));
      expect(await screen.findByRole('alert')).toHaveTextContent(/adopt failed/i);
    });

    it('no Adopt all button when there are no stranded images', async () => {
      setContent([portrait]);
      render(<GmImages />);
      // listing resolves to [] (default); give the effect a tick
      await waitFor(() => expect(listUnregisteredImages).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: /Adopt all/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Unregistered' })).not.toBeInTheDocument();
    });
  });
});
