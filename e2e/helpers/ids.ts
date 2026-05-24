// Unique-per-call id in the same slug format editors produce.
export function testId(prefix: string): string {
  return `e2e-${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// Returns a title that round-trips back to id via standard slugification:
//   title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') === id
export function testTitle(prefix: string, id: string): string {
  const suffix = id.slice(`e2e-${prefix}-`.length);
  const cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  return `E2E ${cap} ${suffix}`;
}
