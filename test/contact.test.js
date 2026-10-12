'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createApp } = require('../server/app');

const ROOT = path.resolve(__dirname, '..'); // portfolio/

function baseConfig(overrides = {}) {
  return {
    root: ROOT,
    port: 0,
    smtp: {},
    mailFrom: 'portfolio@example.com',
    mailTo: 'owner@example.com',
    allowedOrigins: ['*'],
    rateLimitDisabled: true,
    smtpConfigured: false,
    ...overrides,
  };
}

function makeStubTransport() {
  const sent = [];
  return {
    sent,
    // eslint-disable-next-line no-unused-vars
    async sendMail(message) {
      sent.push(message);
      return { messageId: `stub-${sent.length}` };
    },
  };
}

/**
 * Start the app on an ephemeral port, run `fn(baseUrl, server)`, then close.
 */
async function withServer(transport, fn, overrides) {
  const app = createApp({ config: baseConfig(overrides), transport });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('contact form (multipart, as the browser sends it) reaches the mailer', async () => {
  const transport = makeStubTransport();

  await withServer(transport, async (base) => {
    const form = new FormData();
    form.set('email', 'client@example.com');
    form.set('message', 'I would like to work with you.');

    const res = await fetch(`${base}/submit`, { method: 'POST', body: form });
    const body = await res.text();

    assert.equal(res.status, 200);
    assert.match(body, /client@example\.com/);
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].to, 'owner@example.com');
    assert.equal(transport.sent[0].replyTo, 'client@example.com');
  });
});

test('contact form also works as a plain urlencoded post (no JavaScript)', async () => {
  const transport = makeStubTransport();

  await withServer(transport, async (base) => {
    const res = await fetch(`${base}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'plain@example.com', message: 'No JS here' }).toString(),
    });

    assert.equal(res.status, 200);
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].replyTo, 'plain@example.com');
  });
});

test('recommendation form reaches the mailer with name and email', async () => {
  const transport = makeStubTransport();

  await withServer(transport, async (base) => {
    const form = new FormData();
    form.set('name_rec', 'Jane Doe');
    form.set('email_rec', 'jane@example.com');
    form.set('message_rec', 'A pleasure to work with.');

    const res = await fetch(`${base}/submit_rec`, { method: 'POST', body: form });

    assert.equal(res.status, 200);
    assert.equal(transport.sent.length, 1);
    assert.match(transport.sent[0].subject, /Jane Doe/);
    assert.match(transport.sent[0].text, /jane@example\.com/);
  });
});

test('invalid input is rejected with 400 and nothing is sent', async () => {
  const transport = makeStubTransport();

  await withServer(transport, async (base) => {
    const form = new FormData();
    form.set('email', 'not-an-email');
    form.set('message', '');

    const res = await fetch(`${base}/submit`, { method: 'POST', body: form });

    assert.equal(res.status, 400);
    assert.equal(transport.sent.length, 0);
  });
});

test('an unconfigured server reports 503 instead of pretending to send', async () => {
  await withServer(null, async (base) => {
    const form = new FormData();
    form.set('email', 'client@example.com');
    form.set('message', 'Hello');

    const res = await fetch(`${base}/submit`, { method: 'POST', body: form });
    const body = await res.text();

    assert.equal(res.status, 503);
    assert.match(body, /owner@example\.com/);
  });
});

test('health endpoint reports whether email is configured', async () => {
  await withServer(makeStubTransport(), async (base) => {
    const res = await fetch(`${base}/health`);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.status, 'ok');
    assert.equal(json.emailConfigured, true);
  });
});

test('the static site is served at the root', async () => {
  await withServer(makeStubTransport(), async (base) => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /Patricia Manhenda/);
  });
});

test('secret and source files are never served', async () => {
  await withServer(makeStubTransport(), async (base) => {
    for (const blocked of ['/gitkey', '/gitkey.pub', '/package.json', '/server/index.js']) {
      const res = await fetch(`${base}${blocked}`);
      assert.equal(res.status, 404, `${blocked} should be blocked`);
    }
  });
});
