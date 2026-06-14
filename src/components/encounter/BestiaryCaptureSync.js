import { useBestiaryCapture } from '../../hooks/useBestiaryCapture';

// Null-rendering: snapshots each enemy's full stat block into the `monster`
// collection on sighting (#332). Mounted once at app root alongside the other
// sync writers so it runs regardless of which page is open; GM-only writer
// (gated inside the hook).
const BestiaryCaptureSync = () => {
  useBestiaryCapture();
  return null;
};

export default BestiaryCaptureSync;
