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
  const code = body.join('\n').replace('${HttpApi}', 'api123').replace(/\$\{AWS::Region\}/g, 'ap-south-1');
  return new Function(`${code}\nreturn handler;`)();
}

const run = (handler, uri) => handler({ request: { uri } }).uri;
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
  for (const r of routes) {
    assert.equal(run(handler, r), '/index.html', `${r} should be the SPA`);
    if (r.length > 1) assert.equal(run(handler, `${r}/`), '/index.html', `${r}/ (trailing slash)`);
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
