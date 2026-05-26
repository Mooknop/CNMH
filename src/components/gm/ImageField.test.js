import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImageField from './ImageField';

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({ uploadImage: jest.fn() }));
jest.mock('../../utils/imageUpload', () => ({ resizeImageToBlob: jest.fn() }));

const { useContent } = require('../../contexts/ContentContext');
const { uploadImage } = require('../../utils/gmApi');
const { resizeImageToBlob } = require('../../utils/imageUpload');

const images = [
  { id: 'img_abc.jpg', name: 'Portrait', folder: 'portraits' },
  { id: 'img_xyz.jpg', name: 'Landscape', folder: 'misc' },
];

beforeEach(() => {
  useContent.mockReturnValue({ images });
  uploadImage.mockResolvedValue({ id: 'img_new.jpg' });
  resizeImageToBlob.mockResolvedValue(new Blob(['data'], { type: 'image/jpeg' }));
});
afterEach(() => jest.clearAllMocks());

describe('ImageField', () => {
  it('renders empty placeholder when no value', () => {
    render(<ImageField value="" onChange={jest.fn()} ariaLabel="test" />);
    expect(screen.getByLabelText('test-empty')).toBeInTheDocument();
  });

  it('renders preview image when value is set', () => {
    render(<ImageField value="img_abc.jpg" onChange={jest.fn()} ariaLabel="test" />);
    expect(screen.getByLabelText('test-preview')).toBeInTheDocument();
  });

  it('shows Remove button only when a value is set', () => {
    const { rerender } = render(<ImageField value="" onChange={jest.fn()} ariaLabel="test" />);
    expect(screen.queryByLabelText('test-remove')).toBeNull();
    rerender(<ImageField value="img_abc.jpg" onChange={jest.fn()} ariaLabel="test" />);
    expect(screen.getByLabelText('test-remove')).toBeInTheDocument();
  });

  it('Remove button calls onChange with empty string', () => {
    const onChange = jest.fn();
    render(<ImageField value="img_abc.jpg" onChange={onChange} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-remove'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('opens picker panel on "Choose from catalog" click', () => {
    render(<ImageField value="" onChange={jest.fn()} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    expect(screen.getByLabelText('test-picker')).toBeInTheDocument();
  });

  it('closes picker after clicking a tile', () => {
    const onChange = jest.fn();
    render(<ImageField value="" onChange={onChange} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    fireEvent.click(screen.getByTestId('image-field-pick-img_abc.jpg'));
    expect(onChange).toHaveBeenCalledWith('img_abc.jpg');
    expect(screen.queryByLabelText('test-picker')).toBeNull();
  });

  it('filters tiles by search query', () => {
    render(<ImageField value="" onChange={jest.fn()} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    fireEvent.change(screen.getByLabelText('test-search'), { target: { value: 'landscape' } });
    expect(screen.queryByTestId('image-field-pick-img_abc.jpg')).toBeNull();
    expect(screen.getByTestId('image-field-pick-img_xyz.jpg')).toBeInTheDocument();
  });

  it('shows empty-catalog hint when images array is empty', () => {
    useContent.mockReturnValue({ images: [] });
    render(<ImageField value="" onChange={jest.fn()} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    expect(screen.getByText(/no images yet/i)).toBeInTheDocument();
  });

  it('shows no-match hint when search matches nothing', () => {
    render(<ImageField value="" onChange={jest.fn()} ariaLabel="test" />);
    fireEvent.click(screen.getByLabelText('test-choose'));
    fireEvent.change(screen.getByLabelText('test-search'), { target: { value: 'zzz' } });
    expect(screen.getByText(/no images match/i)).toBeInTheDocument();
  });

  it('upload flow: resize → uploadImage → onChange with new id', async () => {
    const onChange = jest.fn();
    render(<ImageField value="" onChange={onChange} ariaLabel="test" />);
    const fileInput = screen.getByLabelText('test-file-input');
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('img_new.jpg'));
  });

  it('rejects SVG uploads with an error message', async () => {
    render(<ImageField value="" onChange={jest.fn()} ariaLabel="test" />);
    const fileInput = screen.getByLabelText('test-file-input');
    const file = new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('shows error when upload fails', async () => {
    uploadImage.mockRejectedValue(new Error('Network error'));
    const onChange = jest.fn();
    render(<ImageField value="" onChange={onChange} ariaLabel="test" />);
    const fileInput = screen.getByLabelText('test-file-input');
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });
});
