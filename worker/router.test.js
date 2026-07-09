import { describe, test, expect } from 'vitest';
import { matchPath, matchRoute, err } from './router.js';

describe('matchPath', () => {
  test('literal segments match exactly', () => {
    expect(matchPath('/api/content', '/api/content')).toEqual({ params: {} });
    expect(matchPath('/api/content', '/api/contents')).toBeNull();
    expect(matchPath('/api/content', '/api/content/extra')).toBeNull();
  });

  test(':name captures one decoded segment', () => {
    expect(matchPath('/api/gm/images/:id/delete', '/api/gm/images/img_a%20b.png/delete'))
      .toEqual({ params: { id: 'img_a b.png' } });
    expect(matchPath('/api/gm/images/:id/delete', '/api/gm/images/delete')).toBeNull();
  });

  test('trailing /* matches zero or more extra segments, captured raw', () => {
    expect(matchPath('/session/:campaignId/*', '/session/camp')).toEqual({
      params: { campaignId: 'camp', '*': '' },
    });
    expect(matchPath('/session/:campaignId/*', '/session/camp/extra/deep')).toEqual({
      params: { campaignId: 'camp', '*': 'extra/deep' },
    });
    expect(matchPath('/session/:campaignId/*', '/session')).toBeNull();
    expect(matchPath('/api/images/*', '/api/images/tok_abc.png')).toEqual({
      params: { '*': 'tok_abc.png' },
    });
  });

  test('a malformed percent-encoding falls back to the raw segment', () => {
    expect(matchPath('/x/:v', '/x/%E0%A4%A')).toEqual({ params: { v: '%E0%A4%A' } });
  });
});

describe('matchRoute', () => {
  const routes = [
    { method: 'POST', path: '/api/gm/images', name: 'upload' },
    { method: '*', path: '/api/gm/*', name: 'catchall' },
    { method: 'GET', path: '/api/images/*', name: 'serve' },
  ];

  test('matches in table order — specific before catch-all', () => {
    expect(matchRoute(routes, 'POST', '/api/gm/images').route.name).toBe('upload');
    expect(matchRoute(routes, 'GET', '/api/gm/images').route.name).toBe('catchall');
    expect(matchRoute(routes, 'PUT', '/api/gm/item/x').route.name).toBe('catchall');
  });

  test('method must match unless the route declares *', () => {
    expect(matchRoute(routes, 'POST', '/api/images/x')).toBeNull();
    expect(matchRoute(routes, 'GET', '/api/images/x').route.name).toBe('serve');
  });

  test('no route → null', () => {
    expect(matchRoute(routes, 'GET', '/totally/else')).toBeNull();
  });
});

describe('err', () => {
  test('wraps the message in the JSON envelope with the status', async () => {
    const res = err(413, 'File too large');
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'File too large' });
  });
});
