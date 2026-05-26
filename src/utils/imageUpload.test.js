import { resizeImageToBlob } from './imageUpload';

// Minimal canvas/Image mock for jsdom
const mockBlob = new Blob(['jpeg'], { type: 'image/jpeg' });

beforeEach(() => {
  // Mock Image
  global.URL.createObjectURL = jest.fn(() => 'blob:fake');
  global.URL.revokeObjectURL = jest.fn();

  global.Image = class {
    constructor() {
      this.naturalWidth = 800;
      this.naturalHeight = 600;
    }
    set src(_) {
      // Trigger onload synchronously in the next microtask
      Promise.resolve().then(() => {
        if (this.onload) this.onload();
      });
    }
  };

  // Mock canvas
  const canvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => ({ drawImage: jest.fn() })),
    toBlob: jest.fn((cb) => cb(mockBlob)),
  };
  jest.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'canvas') return canvas;
    return document.createElement.wrappedMethod
      ? document.createElement.wrappedMethod(tag)
      : {};
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('resizeImageToBlob', () => {
  it('resolves to a Blob', async () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await resizeImageToBlob(file);
    expect(result).toBeInstanceOf(Blob);
  });

  it('scales down an image larger than maxEdge', async () => {
    // Image is 800x600; maxEdge=400 => scale=0.5 => 400x300
    global.Image = class {
      constructor() {
        this.naturalWidth = 800;
        this.naturalHeight = 600;
      }
      set src(_) {
        Promise.resolve().then(() => { if (this.onload) this.onload(); });
      }
    };
    let capturedCanvas;
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        capturedCanvas = { width: 0, height: 0, getContext: jest.fn(() => ({ drawImage: jest.fn() })), toBlob: jest.fn((cb) => cb(mockBlob)) };
        return capturedCanvas;
      }
      return {};
    });
    const file = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    await resizeImageToBlob(file, { maxEdge: 400 });
    expect(capturedCanvas.width).toBe(400);
    expect(capturedCanvas.height).toBe(300);
  });

  it('does not scale up images smaller than maxEdge', async () => {
    // Image is 200x150; maxEdge=1024 => scale=1 => 200x150
    global.Image = class {
      constructor() {
        this.naturalWidth = 200;
        this.naturalHeight = 150;
      }
      set src(_) {
        Promise.resolve().then(() => { if (this.onload) this.onload(); });
      }
    };
    let capturedCanvas;
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        capturedCanvas = { width: 0, height: 0, getContext: jest.fn(() => ({ drawImage: jest.fn() })), toBlob: jest.fn((cb) => cb(mockBlob)) };
        return capturedCanvas;
      }
      return {};
    });
    const file = new File(['x'], 'small.png', { type: 'image/png' });
    await resizeImageToBlob(file, { maxEdge: 1024 });
    expect(capturedCanvas.width).toBe(200);
    expect(capturedCanvas.height).toBe(150);
  });

  it('rejects when canvas.toBlob returns null', async () => {
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return { width: 0, height: 0, getContext: jest.fn(() => ({ drawImage: jest.fn() })), toBlob: jest.fn((cb) => cb(null)) };
      }
      return {};
    });
    const file = new File(['x'], 'bad.jpg', { type: 'image/jpeg' });
    await expect(resizeImageToBlob(file)).rejects.toThrow('Canvas toBlob returned null');
  });

  it('rejects when the image fails to load', async () => {
    global.Image = class {
      set src(_) {
        Promise.resolve().then(() => { if (this.onerror) this.onerror(); });
      }
    };
    const file = new File(['x'], 'corrupt.jpg', { type: 'image/jpeg' });
    await expect(resizeImageToBlob(file)).rejects.toThrow('Failed to load image');
  });
});
