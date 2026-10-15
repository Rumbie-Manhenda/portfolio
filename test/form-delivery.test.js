'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const delivery = require('../form-delivery');

const SERVICE = 'https://formsubmit.co/ajax/owner@example.com';

/**
 * A fetch stub that answers from a queue of canned replies.
 * A queued Error rejects, standing in for an unreachable host. The last reply
 * is reused if more calls arrive than were queued.
 *
 * @param {Array<{ status: number, body?: string } | Error>} responses
 */
function stubFetch(responses) {
  const calls = [];
  let index = 0;

  function fetchStub(url, init) {
    calls.push({ url: url, init: init || {} });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;

    if (next instanceof Error) return Promise.reject(next);

    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: function () {
        return Promise.resolve(next.body || '');
      },
    });
  }

  fetchStub.calls = calls;
  return fetchStub;
}

/** Settings with the form service enabled, unless a test overrides it. */
function settingsFor(fetchStub, overrides) {
  return Object.assign(
    {
      apiBase: '',
      serviceEndpoint: SERVICE,
      fetchImpl: fetchStub,
    },
    overrides
  );
}

test('resolveApiBase prefers a configured URL and trims its trailing slashes', () => {
  assert.equal(
    delivery.resolveApiBase('https://api.example.com/', 'https:'),
    'https://api.example.com'
  );
  assert.equal(
    delivery.resolveApiBase('  https://api.example.com///  ', 'https:'),
    'https://api.example.com'
  );
});

test('resolveApiBase falls back to the page origin, or localhost from disk', () => {
  assert.equal(delivery.resolveApiBase('', 'https:'), '');
  assert.equal(delivery.resolveApiBase(undefined, 'https:'), '');
  assert.equal(delivery.resolveApiBase('', 'file:'), 'http://localhost:3000');
});

test('buildServicePayload renames the recommendation fields and sets a subject', () => {
  const payload = delivery.buildServicePayload('/submit_rec', [
    ['name_rec', 'Jane Doe'],
    ['email_rec', 'jane@example.com'],
    ['message_rec', 'A pleasure to work with.'],
  ]);

  assert.equal(payload.name, 'Jane Doe');
  assert.equal(payload.email, 'jane@example.com');
  assert.equal(payload.message, 'A pleasure to work with.');
  assert.equal(payload.name_rec, undefined);
  assert.equal(payload.email_rec, undefined);
  assert.equal(payload.message_rec, undefined);
  assert.equal(payload._replyto, 'jane@example.com');
  assert.match(payload._subject, /Jane Doe/);
  assert.equal(payload._captcha, 'false');
});

test('buildServicePayload leaves the contact fields as they are', () => {
  const payload = delivery.buildServicePayload('/submit', [
    ['email', 'client@example.com'],
    ['message', 'Hello there.'],
  ]);

  assert.equal(payload.email, 'client@example.com');
  assert.equal(payload.message, 'Hello there.');
  assert.equal(payload._replyto, 'client@example.com');
  assert.match(payload._subject, /client@example\.com/);
});

test('isFallbackWarranted tells an undeliverable route from a real answer', () => {
  assert.equal(delivery.isFallbackWarranted(404), true);
  assert.equal(delivery.isFallbackWarranted(405), true);
  assert.equal(delivery.isFallbackWarranted(502), true);
  assert.equal(delivery.isFallbackWarranted(503), true);

  assert.equal(delivery.isFallbackWarranted(200), false);
  assert.equal(delivery.isFallbackWarranted(400), false);
  assert.equal(delivery.isFallbackWarranted(429), false);
  assert.equal(delivery.isFallbackWarranted(500), false);
});

test('with no service configured the submission goes to the API alone', async () => {
  const fetchStub = stubFetch([{ status: 200, body: 'Thank you — sent.' }]);

  const result = await delivery.send(settingsFor(fetchStub, { serviceEndpoint: '' }), '/submit', [
    ['email', 'a@b.com'],
    ['message', 'hi'],
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.body, 'Thank you — sent.');
  assert.equal(fetchStub.calls.length, 1);
  assert.equal(fetchStub.calls[0].url, '/submit');
});

test('a working API is never second-guessed', async () => {
  const fetchStub = stubFetch([{ status: 200, body: 'Thank you.' }]);

  const result = await delivery.send(settingsFor(fetchStub), '/submit', [
    ['email', 'a@b.com'],
    ['message', 'hi'],
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.body, 'Thank you.');
  assert.equal(fetchStub.calls.length, 1);
});

test('a 404 from the API re-sends the submission to the service', async () => {
  const fetchStub = stubFetch([
    { status: 404, body: 'Not found' },
    { status: 200, body: JSON.stringify({ success: 'true' }) },
  ]);

  const result = await delivery.send(settingsFor(fetchStub), '/submit', [
    ['email', 'a@b.com'],
    ['message', 'hi'],
  ]);

  assert.equal(result.ok, true);
  assert.equal(fetchStub.calls.length, 2);
  assert.equal(fetchStub.calls[1].url, SERVICE);
  assert.equal(fetchStub.calls[1].init.method, 'POST');
  assert.equal(fetchStub.calls[1].init.headers['Content-Type'], 'application/json');

  const sent = JSON.parse(fetchStub.calls[1].init.body);
  assert.equal(sent.email, 'a@b.com');
  assert.equal(sent.message, 'hi');
});

test('an unreachable API re-sends the submission to the service', async () => {
  const fetchStub = stubFetch([
    new TypeError('Failed to fetch'),
    { status: 200, body: JSON.stringify({ success: 'true' }) },
  ]);

  const result = await delivery.send(settingsFor(fetchStub), '/submit', [
    ['email', 'a@b.com'],
    ['message', 'hi'],
  ]);

  assert.equal(result.ok, true);
  assert.equal(fetchStub.calls.length, 2);
  assert.equal(fetchStub.calls[1].url, SERVICE);
});

test('a 400 from the API is a real answer and is not retried', async () => {
  const fetchStub = stubFetch([{ status: 400, body: 'Please write a short message.' }]);

  const result = await delivery.send(settingsFor(fetchStub), '/submit', [
    ['email', 'a@b.com'],
    ['message', ''],
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.body, 'Please write a short message.');
  assert.equal(fetchStub.calls.length, 1);
});

test('a service that answers success:false becomes a clean failure', async () => {
  const fetchStub = stubFetch([
    { status: 404, body: 'Not found' },
    {
      status: 200,
      body: JSON.stringify({ success: 'false', message: 'Please confirm your email address.' }),
    },
  ]);

  const result = await delivery.send(settingsFor(fetchStub), '/submit', [
    ['email', 'a@b.com'],
    ['message', 'hi'],
  ]);

  assert.equal(result.ok, false);
  assert.match(result.body, /email me directly/i);
});

test('createSender resolves the API base once and posts to the right path', async () => {
  const fetchStub = stubFetch([
    { status: 404, body: 'Not found' },
    { status: 200, body: JSON.stringify({ success: 'true' }) },
  ]);

  const send = delivery.createSender({
    api: 'https://api.example.com/',
    service: SERVICE,
    protocol: 'https:',
    fetchImpl: fetchStub,
  });

  const result = await send('/submit_rec', [
    ['name_rec', 'Jane Doe'],
    ['email_rec', 'jane@example.com'],
    ['message_rec', 'Thorough and quick.'],
  ]);

  assert.equal(result.ok, true);
  assert.equal(fetchStub.calls[0].url, 'https://api.example.com/submit_rec');

  const sent = JSON.parse(fetchStub.calls[1].init.body);
  assert.equal(sent.name, 'Jane Doe');
  assert.equal(sent._replyto, 'jane@example.com');
  assert.match(sent._subject, /Jane Doe/);
  assert.equal(sent.message, 'Thorough and quick.');
});

test('createSender posts to the page origin when no API is configured', async () => {
  const fetchStub = stubFetch([{ status: 200, body: 'Thank you.' }]);

  const send = delivery.createSender({
    api: '',
    service: '',
    protocol: 'https:',
    fetchImpl: fetchStub,
  });

  await send('/submit', [['email', 'a@b.com'], ['message', 'hi']]);

  assert.equal(fetchStub.calls[0].url, '/submit');
});
