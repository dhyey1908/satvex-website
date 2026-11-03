// The CloudFront viewer-request function (backend/template.yaml) decides which
// URLs are the SPA and which are a real 404. If a route is added to App.jsx and
// not to that allowlist, visiting it directly would 404 in production - so this
// check runs the deployed function code against every route in App.jsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const read = (rel) => fs.readFileSync(path.join(here, rel), 'utf8').replace(/\r\n/g, '\n');

function loadHandler() {
  const template = read('../../../backend/template.yaml');
  const lines = template.split('\n');
  const start = lines.findIndex((l) => /^\s+FunctionCode: !Sub \|\s*$/.test(l));
  assert.ok(start >= 0, 'FunctionCode block not found in template.yaml');
  const indent = lines[start + 1].match(/^\s*/)[0].length;
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() !== '' && lines[i].match(/^\s*/)[0].length < indent) break;
    body.push(lines[i].slice(indent));
  }
  // eslint-disable-next-line no-new-func
  const code = body
    .join('\n')
    .replace('${HttpApi}', 'api123')
    .replace(/\$\{AWS::Region\}/g, 'ap-south-1')
    .replace('${FrontendCanonicalHost}', 'www.satvex.co.in')
    .replace('${PrerenderedProductSlugs}', 'claw-clip,second-product');
  return new Function(`${code}\nreturn handler;`)();
}

const run = (handler, uri, host = 'www.satvex.co.in') => handler({ request: { uri, headers: { host: { value: host } }, querystring: {} } }).uri;
const respond = (handler) => handler({ response: { statusCode: 200, headers: {} } }).headers;

// Every <Route path="..."> in App.jsx, nested paths joined to their parent.
function appRoutes() {
  const src = read('../App.jsx');
  const out = [];
  let parent = '';
  for (const m of src.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const p = m[1];
    if (p === '*') continue;
    if (p.startsWith('/')) {
      out.push(p);
      parent = p;
    } else {
      out.push(`${parent}/${p}`.replace(/\/+/g, '/'));
    }
  }
  return out.map((p) => p.replace(/:[A-Za-z]+/g, 'abc123'));
}

test('every route in App.jsx is served as the SPA (not a 404)', () => {
  const handler = loadHandler();
  const routes = appRoutes();
  assert.ok(routes.length > 20, `expected to find the app routes, got ${routes.length}`);
  // Home and shop are served their prerendered static page; every other route
  // (including a product that was not prerendered) is the generic SPA shell.
  const expected = (r) => (r === '/' ? '/_pre/home.html' : r === '/shop' ? '/_pre/shop.html' : '/index.html');
  for (const r of routes) {
    assert.equal(run(handler, r), expected(r), `${r} should be the SPA`);
    if (r.length > 1) assert.equal(run(handler, `${r}/`), expected(r), `${r}/ (trailing slash)`);
  }
});

test('prerendered products get their static page; unlisted product slugs still load the SPA', () => {
  const handler = loadHandler();
  assert.equal(run(handler, '/product/claw-clip'), '/_pre/product/claw-clip.html');
  assert.equal(run(handler, '/product/second-product/'), '/_pre/product/second-product.html');
  assert.equal(run(handler, '/product/brand-new-product'), '/index.html');
  assert.equal(run(handler, '/product/claw-clip/extra'), '/__not_found__');
});

test('the old /product/butterfly link 301s to the renamed product (one hop, query kept, any host)', () => {
  const handler = loadHandler();
  const go = (uri, host, querystring = {}) => handler({ request: { uri, headers: { host: { value: host } }, querystring } });
  for (const uri of ['/product/butterfly', '/product/butterfly/']) {
    const res = go(uri, 'www.satvex.co.in', { color: { value: 'pink' } });
    assert.equal(res.statusCode, 301, uri);
    assert.equal(res.headers.location.value, 'https://www.satvex.co.in/product/unbreakable-soft-matte-claw-clip?color=pink', uri);
  }
  // bare domain: straight to the canonical host AND the new slug, not two hops
  assert.equal(go('/product/butterfly', 'satvex.co.in').headers.location.value, 'https://www.satvex.co.in/product/unbreakable-soft-matte-claw-clip');
  // other product URLs are not redirected
  assert.equal(run(handler, '/product/butterfly-extra'), '/index.html');
});

test('the bare domain 301-redirects to the canonical host, keeping path and query', () => {
  const handler = loadHandler();
  const res = handler({ request: { uri: '/product/claw-clip', headers: { host: { value: 'satvex.co.in' } }, querystring: { utm: { value: 'x' }, a: { value: '' } } } });
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location.value, 'https://www.satvex.co.in/product/claw-clip?utm=x&a');
  // the canonical host itself, the CloudFront default domain and unknown hosts are never redirected
  for (const h of ['www.satvex.co.in', 'd111111abcdef8.cloudfront.net', 'other.example.com']) {
    assert.equal(run(handler, '/shop', h), '/_pre/shop.html', h);
  }
});

test('unknown paths are a real 404, not the SPA', () => {
  const handler = loadHandler();
  for (const r of ['/nope', '/shop/extra', '/product', '/product/a/b', '/admin/unknown', '/account/secret', '/wp-login', '/.git/config/x']) {
    assert.equal(run(handler, r), '/__not_found__', `${r} should be a 404`);
  }
});

test('real files pass through untouched', () => {
  const handler = loadHandler();
  for (const f of ['/assets/index-abc123.js', '/robots.txt', '/sitemap.xml', '/404.html', '/favicon.ico']) {
    assert.equal(run(handler, f), f);
  }
});

test('responses carry the security headers (CSP, HSTS, nosniff, frame deny, referrer)', () => {
  const h = respond(loadHandler());
  assert.match(h['strict-transport-security'].value, /max-age=31536000/);
  assert.equal(h['x-content-type-options'].value, 'nosniff');
  assert.equal(h['x-frame-options'].value, 'DENY');
  assert.equal(h['referrer-policy'].value, 'strict-origin-when-cross-origin');
  const csp = h['content-security-policy'].value;
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /connect-src 'self' https:\/\/api123\.execute-api\.ap-south-1\.amazonaws\.com/);
  assert.doesNotMatch(csp, /form-action/, 'form-action would break the PayU redirect chain');
});
