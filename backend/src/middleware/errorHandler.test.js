// Client mistakes in the request body must be 4xx, never a 500.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { errorHandler, notFoundHandler } = require('./errorHandler');
const AppError = require('../utils/AppError');

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.post('/echo', (req, res) => res.json({ ok: true }));
  app.get('/boom', () => {
    throw new Error('db exploded');
  });
  app.get('/app-error', () => {
    throw new AppError('Nope', 409, 'CONFLICT');
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function call(server, { method = 'POST', path = '/echo', body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({ port, method, path, headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function withServer(fn) {
  const server = makeApp().listen(0);
  try {
    await fn(server);
  } finally {
    server.close();
  }
}

test('malformed JSON is a 400 INVALID_JSON, not a 500', () =>
  withServer(async (s) => {
    const r = await call(s, { body: '{"a": ' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_JSON');
  }));

test('a body over the limit is a 413 PAYLOAD_TOO_LARGE', () =>
  withServer(async (s) => {
    const r = await call(s, { body: JSON.stringify({ x: 'a'.repeat(5000) }) });
    assert.equal(r.status, 413);
    assert.equal(r.json.error.code, 'PAYLOAD_TOO_LARGE');
  }));

test('a valid body still passes through', () =>
  withServer(async (s) => {
    const r = await call(s, { body: JSON.stringify({ a: 1 }) });
    assert.equal(r.status, 200);
  }));

test('real server faults are still 500 with a generic message', () =>
  withServer(async (s) => {
    const r = await call(s, { method: 'GET', path: '/boom' });
    assert.equal(r.status, 500);
    assert.equal(r.json.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(r.json.error.message, /db exploded/);
  }));

test('AppError keeps its own status and code', () =>
  withServer(async (s) => {
    const r = await call(s, { method: 'GET', path: '/app-error' });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'CONFLICT');
  }));
