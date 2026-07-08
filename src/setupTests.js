// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Network guard: no unit test may open a real connection. happy-dom's default
// origin is http://localhost:3000 and its `fetch`/`WebSocket` hit the actual
// network, so an unmocked render of anything that probes the server (e.g.
// useGmAuth's /api/gm/whoami — App.test mounts 28 of them) dials a real TCP
// socket. The refusals surface as unhandled `AggregateError: ECONNREFUSED`
// noise after the run summary, and vitest occasionally pins one on a test
// file and exits 1. Stubbing both here keeps every suite offline; the app
// already treats network failure as "fall back to bundled content", and
// suites that assert on fetch/WebSocket behavior install their own mocks,
// which override these defaults. Plain functions (not vi.fn) on purpose —
// mockReset:true must not wipe them between tests.
globalThis.fetch = () =>
  Promise.reject(new TypeError('fetch failed (network disabled in unit tests)'));

class OfflineWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = OfflineWebSocket.CONNECTING; // never opens
  }
  send() {}
  close() { this.readyState = OfflineWebSocket.CLOSED; }
  addEventListener() {}
  removeEventListener() {}
}
OfflineWebSocket.CONNECTING = 0;
OfflineWebSocket.OPEN = 1;
OfflineWebSocket.CLOSING = 2;
OfflineWebSocket.CLOSED = 3;
globalThis.WebSocket = OfflineWebSocket;

// React Router v7 requires TextEncoder/TextDecoder globals in jsdom
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}
