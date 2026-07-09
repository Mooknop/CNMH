// Minimal route table + dispatcher for worker/index.js (#1318). No framework:
// a route is { method, path, gm?, handler }, matched in table order.
//
//   method:  'GET' | 'POST' | ... | '*' (any — the handler dispatches itself,
//            e.g. the CORS-preflighted bridge image endpoint)
//   path:    '/' -separated segments; ':name' captures one segment (decoded)
//            into params.name; a trailing '/*' matches the route with ZERO or
//            more extra segments, captured raw (undecoded) as params['*'].
//   gm:      true → requireGm runs before the handler; the identity is passed
//            as ctx.gm.
//   handler: ({ request, env, url, params, gm }) => Response | Promise<Response>
//
// Order matters: put specific routes before prefix catch-alls ('/api/gm/…'
// before '/api/gm/*').

// Returns { params } when the pattern matches the pathname, else null.
export function matchPath(pattern, pathname) {
  const patSegs = pattern.split('/').filter((s) => s !== '');
  const wildcard = patSegs[patSegs.length - 1] === '*';
  if (wildcard) patSegs.pop();

  const pathSegs = pathname.split('/').filter((s) => s !== '');
  if (wildcard ? pathSegs.length < patSegs.length : pathSegs.length !== patSegs.length) {
    return null;
  }

  const params = {};
  for (let i = 0; i < patSegs.length; i++) {
    const pat = patSegs[i];
    if (pat.startsWith(':')) {
      try {
        params[pat.slice(1)] = decodeURIComponent(pathSegs[i]);
      } catch {
        params[pat.slice(1)] = pathSegs[i];
      }
    } else if (pat !== pathSegs[i]) {
      return null;
    }
  }
  if (wildcard) params['*'] = pathSegs.slice(patSegs.length).join('/');
  return { params };
}

// First route whose method + path match, else null.
export function matchRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== '*' && route.method !== method) continue;
    const m = matchPath(route.path, pathname);
    if (m) return { route, params: m.params };
  }
  return null;
}

// Consistent JSON error envelope: { error: <message> }.
export const err = (status, message, headers) =>
  Response.json({ error: message }, { status, headers });
