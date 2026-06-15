import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImageReclaimModal from './ImageReclaimModal';

vi.mock('../../utils/gmApi', () => ({
  auditImages: vi.fn(),
  sweepImages: vi.fn(),
}));

// Stub the confirm step to a single button that fires onConfirm.
vi.mock('../shared/ConfirmDialog', () => ({
  default: ({ isOpen, onConfirm }) =>
    (isOpen ? <button type="button" onClick={onConfirm}>confirm-sweep</button> : null),
}));

import { auditImages, sweepImages } from '../../utils/gmApi';

const report = {
  unreferenced: [{ id: 'img_a.png', name: 'A', size: 1024 }],
  bytesWithoutCatalog: [{ id: 'tok_b.webp', size: 2048 }],
  catalogWithoutBytes: [{ id: 'img_c.png', name: 'C' }],
  referencedCount: 3,
  totalR2: 4,
  totalCatalog: 2,
  graceWindowHours: 24,
  scannedAt: 1,
};

const emptyReport = {
  unreferenced: [], bytesWithoutCatalog: [], catalogWithoutBytes: [],
  referencedCount: 5, totalR2: 5, totalCatalog: 5, graceWindowHours: 24, scannedAt: 1,
};

beforeEach(() => {
  auditImages.mockReset();
  sweepImages.mockReset();
});

test('does not scan while closed', () => {
  render(<ImageReclaimModal isOpen={false} onClose={vi.fn()} onDone={vi.fn()} />);
  expect(auditImages).not.toHaveBeenCalled();
});

test('on open, lists the three buckets with every orphan selected by default', async () => {
  auditImages.mockResolvedValue(report);
  render(<ImageReclaimModal isOpen onClose={vi.fn()} onDone={vi.fn()} />);

  expect(await screen.findByTestId('reclaim-bucket-unreferenced')).toBeInTheDocument();
  expect(screen.getByTestId('reclaim-bucket-bytesWithoutCatalog')).toBeInTheDocument();
  expect(screen.getByTestId('reclaim-bucket-catalogWithoutBytes')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Reclaim 3 selected/i })).toBeInTheDocument();
});

test('deselecting an item lowers the reclaim count', async () => {
  auditImages.mockResolvedValue(report);
  render(<ImageReclaimModal isOpen onClose={vi.fn()} onDone={vi.fn()} />);
  await screen.findByTestId('reclaim-bucket-unreferenced');

  fireEvent.click(screen.getByLabelText('select img_a.png'));
  expect(screen.getByRole('button', { name: /Reclaim 2 selected/i })).toBeInTheDocument();
});

test('confirming sweeps the selected ids and reports the result', async () => {
  auditImages.mockResolvedValueOnce(report).mockResolvedValueOnce(emptyReport);
  sweepImages.mockResolvedValue({
    reclaimed: [{ id: 'img_a.png' }, { id: 'tok_b.webp' }, { id: 'img_c.png' }],
    skipped: [],
  });
  const onDone = vi.fn();
  render(<ImageReclaimModal isOpen onClose={vi.fn()} onDone={onDone} />);
  await screen.findByTestId('reclaim-bucket-unreferenced');

  fireEvent.click(screen.getByRole('button', { name: /Reclaim 3 selected/i }));
  fireEvent.click(screen.getByText('confirm-sweep'));

  await waitFor(() =>
    expect(sweepImages).toHaveBeenCalledWith(
      expect.arrayContaining(['img_a.png', 'tok_b.webp', 'img_c.png'])
    )
  );
  expect(await screen.findByText(/Reclaimed 3 images/i)).toBeInTheDocument();
  expect(onDone).toHaveBeenCalled();
});

test('empty report shows a nothing-to-reclaim message and no reclaim button', async () => {
  auditImages.mockResolvedValue(emptyReport);
  render(<ImageReclaimModal isOpen onClose={vi.fn()} onDone={vi.fn()} />);

  expect(await screen.findByText(/No orphaned images found/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Reclaim .* selected/i })).not.toBeInTheDocument();
});

test('surfaces an audit error', async () => {
  auditImages.mockRejectedValue(new Error('boom'));
  render(<ImageReclaimModal isOpen onClose={vi.fn()} onDone={vi.fn()} />);
  expect(await screen.findByText('boom')).toBeInTheDocument();
});
