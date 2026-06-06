import { useEffect, useState } from 'react';

// Probes GET /api/gm/whoami. Cloudflare Access enforces GM identity at the
// edge and the Worker re-verifies it; this hook is UX only — it decides
// whether to show the GM link / GM pages. It is NOT a security boundary.

export const useGmAuth = () => {
  const [state, setState] = useState({ loading: true, isGm: false, email: null });

  useEffect(() => {
    let cancelled = false;
    if (typeof fetch !== 'function') {
      setState({ loading: false, isGm: false, email: null });
      return undefined;
    }
    fetch('/api/gm/whoami', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        if (body && body.email) setState({ loading: false, isGm: true, email: body.email });
        else setState({ loading: false, isGm: false, email: null });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, isGm: false, email: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};

export default useGmAuth;
