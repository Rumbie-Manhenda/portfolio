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

  const sender = delivery.createSender({
    api: 'https://api.example.com/',
    service: SERVICE,
    protocol: 'https:',
    fetchImpl: fetchStub,
  });

  const result = await sender.send('/submit_rec', [
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

  const sender = delivery.createSender({
    api: '',
    service: '',
    protocol: 'https:',
    fetchImpl: fetchStub,
  });

  await sender.send('/submit', [['email', 'a@b.com'], ['message', 'hi']]);

  assert.equal(fetchStub.calls[0].url, '/submit');
});

test('the API body is posted urlencoded, so no multipart read is needed', async () => {
  const fetchStub = stubFetch([{ status: 200, body: 'Thank you.' }]);

  await delivery.send(settingsFor(fetchStub), '/submit', [
    ['email', 'with space@example.com'],
    ['message', 'a & b = c'],
  ]);

  const sent = fetchStub.calls[0].init;
  assert.equal(sent.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(
    sent.body,
    'email=with%20space%40example.com&message=a%20%26%20b%20%3D%20c'
  );
});

test('isStaticHost spots file-only hosts and leaves real hosts alone', () => {
  assert.equal(delivery.isStaticHost('rumbie-manhenda.github.io'), true);
  assert.equal(delivery.isStaticHost('my-site.netlify.app'), true);
  assert.equal(delivery.isStaticHost('SOMETHING.Pages.dev'), true);

  assert.equal(delivery.isStaticHost('patriciamanhenda.com'), false);
  assert.equal(delivery.isStaticHost('localhost'), false);
  assert.equal(delivery.isStaticHost(''), false);
  assert.equal(delivery.isStaticHost(undefined), false);
});

test('serviceOrigin pulls the origin out of the endpoint, or gives up', () => {
  assert.equal(delivery.serviceOrigin(SERVICE), 'https://formsubmit.co');
  assert.equal(delivery.serviceOrigin(''), '');
  assert.equal(delivery.serviceOrigin('/ajax/nope'), '');
});

test('probeApi answers available, missing or unknown without throwing', async () => {
  assert.equal(
    await delivery.probeApi({
      apiBase: '',
      host: 'rumbie-manhenda.github.io',
      fetchImpl: stubFetch([{ status: 200, body: '{}' }]),
    }),
    'missing',
    'a known static host is answered without any request at all'
  );

  assert.equal(
    await delivery.probeApi({
      apiBase: 'https://api.example.com',
      host: 'api.example.com',
      fetchImpl: stubFetch([{ status: 200, body: '{"status":"ok"}' }]),
    }),
    'available'
  );

  assert.equal(
    await delivery.probeApi({
      apiBase: '',
      host: 'example.com',
      fetchImpl: stubFetch([{ status: 404, body: 'Not found' }]),
    }),
    'missing'
  );

  assert.equal(
    await delivery.probeApi({
      apiBase: '',
      host: 'example.com',
      fetchImpl: stubFetch([{ status: 500, body: 'boom' }]),
    }),
    'unknown'
  );

  assert.equal(
    await delivery.probeApi({
      apiBase: '',
      host: 'example.com',
      fetchImpl: stubFetch([new TypeError('Failed to fetch')]),
    }),
    'unknown'
  );
});

test('a probe that finds no API sends the next submission straight to the service', async () => {
  const fetchStub = stubFetch([
    { status: 404, body: 'Not found' }, // the /health probe
    { status: 200, body: JSON.stringify({ success: 'true' }) }, // the service
  ]);

  const sender = delivery.createSender({
    api: '',
    service: SERVICE,
    protocol: 'https:',
    host: 'example.com',
    fetchImpl: fetchStub,
  });

  assert.equal(await sender.warmUp(), 'missing');

  const result = await sender.send('/submit', [
    ['email', 'a@b.com'],
    ['message', 'hi'],
  ]);

  assert.equal(result.ok, true);
  // probe, then the service — the doomed POST to /submit never happens.
  assert.equal(fetchStub.calls.length, 2);
  assert.equal(fetchStub.calls[1].url, SERVICE);
});

test('an API that answers is remembered, so later submissions skip the probe', async () => {
  const fetchStub = stubFetch([
    { status: 200, body: '{"status":"ok"}' }, // the /health probe
    { status: 200, body: 'Thank you.' }, // the submission
  ]);

  const sender = delivery.createSender({
    api: 'https://api.example.com',
    service: SERVICE,
    protocol: 'https:',
    host: 'api.example.com',
    fetchImpl: fetchStub,
  });

  assert.equal(await sender.warmUp(), 'available');

  const result = await sender.send('/submit', [
    ['email', 'a@b.com'],
    ['message', 'hi'],
  ]);

  assert.equal(result.ok, true);
  assert.equal(fetchStub.calls.length, 2);
  assert.equal(fetchStub.calls[1].url, 'https://api.example.com/submit');
});

test('a 404 on the first submission teaches the route for the next one', async () => {
  const fetchStub = stubFetch([
    { status: 404, body: 'Not found' }, // first /submit — nothing there
    { status: 200, body: JSON.stringify({ success: 'true' }) }, // the service
    { status: 200, body: JSON.stringify({ success: 'true' }) }, // second: service only
  ]);

  const sender = delivery.createSender({
    api: '',
    service: SERVICE,
    protocol: 'https:',
    fetchImpl: fetchStub,
  });

  const first = await sender.send('/submit', [['email', 'a@b.com'], ['message', 'one']]);
  assert.equal(first.ok, true);
  assert.equal(fetchStub.calls.length, 2);

  const second = await sender.send('/submit', [['email', 'a@b.com'], ['message', 'two']]);
  assert.equal(second.ok, true);
  assert.equal(fetchStub.calls.length, 3, 'no third call to the missing API');
  assert.equal(fetchStub.calls[2].url, SERVICE);
});

test('a network failure leaves the route undecided, so the API is retried later', async () => {
  const fetchStub = stubFetch([
    new TypeError('Failed to fetch'), // the API is unreachable
    { status: 200, body: JSON.stringify({ success: 'true' }) }, // the service
    { status: 200, body: 'Thank you.' }, // the API comes back
  ]);

  const sender = delivery.createSender({
    api: '',
    service: SERVICE,
    protocol: 'https:',
    fetchImpl: fetchStub,
  });

  await sender.send('/submit', [['email', 'a@b.com'], ['message', 'one']]);
  assert.equal(sender.route.apiStatus, 'unknown');

  const result = await sender.send('/submit', [['email', 'a@b.com'], ['message', 'two']]);
  assert.equal(result.ok, true);
  assert.equal(result.body, 'Thank you.');
  assert.equal(fetchStub.calls[2].url, '/submit');
});

test('warmUp probes the API only once, however often it is called', async () => {
  const fetchStub = stubFetch([{ status: 404, body: 'Not found' }]);

  const sender = delivery.createSender({
    api: '',
    service: SERVICE,
    protocol: 'https:',
    host: 'example.com',
    fetchImpl: fetchStub,
  });

  await Promise.all([sender.warmUp(), sender.warmUp(), sender.warmUp()]);

  assert.equal(fetchStub.calls.length, 1);
  assert.equal(fetchStub.calls[0].url, '/health');
});

test('warmUp alone touches nobody outside the page origin', async () => {
  const fetchStub = stubFetch([{ status: 200, body: '{"status":"ok"}' }]);

  const sender = delivery.createSender({
    api: 'https://api.example.com',
    service: SERVICE,
    protocol: 'https:',
    host: 'api.example.com',
    fetchImpl: fetchStub,
  });

  await sender.warmUp();

  assert.equal(fetchStub.calls.length, 1);
  assert.equal(fetchStub.calls[0].url, 'https://api.example.com/health');
});

test('warmService does nothing outside the browser, and never throws', () => {
  const fetchStub = stubFetch([{ status: 200, body: JSON.stringify({ success: 'true' }) }]);

  const sender = delivery.createSender({
    api: '',
    service: SERVICE,
    protocol: 'https:',
    fetchImpl: fetchStub,
  });

  assert.doesNotThrow(() => {
    sender.warmService();
    sender.warmService();
  });
  assert.equal(fetchStub.calls.length, 0);
});
