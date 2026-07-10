import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImageField from './ImageField';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ uploadImage: vi.fn() }));
vi.mock('../../utils/imageUpload', () => ({ resizeImageToBlob: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { uploadImage } from '../../utils/gmApi';
import { resizeImageToBlob } from '../../utils/imageUpload';

const images = [
  { id: 'img_abc.jpg', name: 'Portrait', folder: 'portraits' },
  { id: 'img_xyz.jpg', name: 'Landscape', folder: 'misc' },
];

beforeEach(() => {
  useContent.mockReturnValue({ images });
  uploadImage.mockResolvedValue({ id: 'img_new.jpg' });
  resizeImageToBlob.mockResolvedValue(new Blob(['data'], { type: 'image/jpeg' }));
});
afterEach(() => vi.clearAllMocks());

describe('ImageField', () => {
  it('renders empty placeholder when no value', () => {
    render(<ImageField value="" onChange={vi.fn()} ariaLabel="test" />);
    expect(screen.getByLabelText('test-empty')).toBeInTheDocument();
  });

  it('renders preview image when value is set', () => {
    render(<ImageField value="img_abc.jpg" onChange={vi.fn()} ariaLabel="test" />);
    expect(screen.getByLabelText('test-preview')).toBeInTheDocument();
  });

  it('shows Remove button only when a value is set', () => {
    const { rerender } = render(<ImageField value="" onChange={vi.fn()} ariaLabel="test" />);
    expect(screen.queryByLabelText('test-remove')).toBeNull();
    rerender(<ImageField value="img_abc.jpg" onChange={vi.fn()} ariaLabel="test" />);
    expect(screen.getByLabelText('test-remove')).toBeInTheDocument();
  });

  it('Remove button calls onChange with empty string', () => {
    const onChange = vi.fn();
    render(<ImageField value="img_abc.jpg" onChange={onChange} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-remove'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('opens picker panel on "Choose from catalog" click', () => {
    render(<ImageField value="" onChange={vi.fn()} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    expect(screen.getByLabelText('test-picker')).toBeInTheDocument();
  });

  it('closes picker after clicking a tile', () => {
    const onChange = vi.fn();
    render(<ImageField value="" onChange={onChange} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    fireEvent.click(screen.getByTestId('image-field-pick-img_abc.jpg'));
    expect(onChange).toHaveBeenCalledWith('img_abc.jpg');
    expect(screen.queryByLabelText('test-picker')).toBeNull();
  });

  it('filters tiles by search query', () => {
    render(<ImageField value="" onChange={vi.fn()} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    fireEvent.change(screen.getByLabelText('test-search'), { target: { value: 'landscape' } });
    expect(screen.queryByTestId('image-field-pick-img_abc.jpg')).toBeNull();
    expect(screen.getByTestId('image-field-pick-img_xyz.jpg')).toBeInTheDocument();
  });

  it('shows empty-catalog hint when images array is empty', () => {
    useContent.mockReturnValue({ images: [] });
    render(<ImageField value="" onChange={vi.fn()} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    expect(screen.getByText(/no images yet/i)).toBeInTheDocument();
  });

  it('shows no-match hint when search matches nothing', () => {
    render(<ImageField value="" onChange={vi.fn()} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    fireEvent.change(screen.getByLabelText('test-search'), { target: { value: 'zzz' } });
    expect(screen.getByText(/no images match/i)).toBeInTheDocument();
  });

  it('upload flow: resize → uploadImage → onChange with new id', async () => {
    const onChange = vi.fn();
    render(<ImageField value="" onChange={onChange} ariaLabel="test" />);
    const fileInput = screen.getByLabelText('test-file-input');
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('img_new.jpg'));
  });

  it('rejects SVG uploads with an error message', async () => {
    render(<ImageField value="" onChange={vi.fn()} ariaLabel="test" />);
    const fileInput = screen.getByLabelText('test-file-input');
    const file = new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('shows error when upload fails', async () => {
    uploadImage.mockRejectedValue(new Error('Network error'));
    const onChange = vi.fn();
    render(<ImageField value="" onChange={onChange} ariaLabel="test" />);
    const fileInput = screen.getByLabelText('test-file-input');
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  describe('focal point', () => {
    it('applies object-position from position prop to the preview image', () => {
      const { container } = render(
        <ImageField value="img_abc.jpg" onChange={vi.fn()} position={{ x: 30, y: 70 }} onPositionChange={vi.fn()} ariaLabel="test" />
      );
      // The focal point rides the --focal-x/--focal-y bridge on the wrap;
      // ImageField.css maps it to object-position (jsdom doesn't apply stylesheets).
      const wrap = container.querySelector('.image-field-preview-wrap');
      expect(wrap).toHaveStyle({ '--focal-x': '30%', '--focal-y': '70%' });
    });

    it('shows focal dot when onPositionChange is provided', () => {
      const { container } = render(
        <ImageField value="img_abc.jpg" onChange={vi.fn()} position={{ x: 50, y: 50 }} onPositionChange={vi.fn()} ariaLabel="test" />
      );
      expect(container.querySelector('.image-field-focal-dot')).not.toBeNull();
    });

    it('does not show focal dot without onPositionChange', () => {
      const { container } = render(
        <ImageField value="img_abc.jpg" onChange={vi.fn()} ariaLabel="test" />
      );
      expect(container.querySelector('.image-field-focal-dot')).toBeNull();
    });

    it('calls onPositionChange with calculated x/y when preview area is clicked', () => {
      const onPositionChange = vi.fn();
      const { container } = render(
        <ImageField value="img_abc.jpg" onChange={vi.fn()} position={{ x: 50, y: 50 }} onPositionChange={onPositionChange} ariaLabel="test" />
      );
      const wrap = container.querySelector('.image-field-preview-wrap');
      // Mock getBoundingClientRect to a 100×100 box at origin
      vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 });
      fireEvent.click(wrap, { clientX: 25, clientY: 75 });
      expect(onPositionChange).toHaveBeenCalledWith({ x: 25, y: 75 });
    });

    it('clamps focal point to 0–100', () => {
      const onPositionChange = vi.fn();
      const { container } = render(
        <ImageField value="img_abc.jpg" onChange={vi.fn()} position={{ x: 50, y: 50 }} onPositionChange={onPositionChange} ariaLabel="test" />
      );
      const wrap = container.querySelector('.image-field-preview-wrap');
      vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 });
      fireEvent.click(wrap, { clientX: -10, clientY: 150 });
      expect(onPositionChange).toHaveBeenCalledWith({ x: 0, y: 100 });
    });
  });
});
