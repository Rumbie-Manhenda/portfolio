'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const nodemailer = require('nodemailer');
const mailer = require('../server/mailer');

const CONFIG = { mailFrom: 'portfolio@example.com', mailTo: 'owner@example.com' };

/**
 * nodemailer's JSON transport writes addresses in its normalised form: either
 * a plain string or a list of `{ address, name }` objects, depending on the
 * version. Read back just the addresses, so these assertions describe the
 * message we compose rather than the transport's serialisation format.
 *
 * @param {string | Array<{ address: string }>} value
 * @returns {string[]}
 */
function addresses(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry) => (typeof entry === 'string' ? entry : entry.address));
}

test('createTransport returns null when SMTP settings are incomplete', () => {
  assert.equal(mailer.createTransport({ host: '', user: '', pass: '' }), null);
  assert.equal(mailer.createTransport({ host: 'smtp.gmail.com', user: 'a', pass: '' }), null);
  assert.equal(mailer.createTransport(null), null);
});

test('createTransport builds a transporter when settings are complete', () => {
  const transport = mailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: 'me@gmail.com',
    pass: 'app-password',
  });
  assert.ok(transport);
  transport.close();
});

test('createTransport pools connections so a send does not re-authenticate', () => {
  const transport = mailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: 'me@gmail.com',
    pass: 'app-password',
  });

  assert.equal(transport.options.pool, true);
  assert.ok(transport.options.maxConnections >= 1);
  assert.ok(transport.options.maxMessages >= 1);

  transport.close();
});

test('contactMessage addresses the owner and replies to the visitor', async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const message = mailer.contactMessage(CONFIG, {
    email: 'client@example.com',
    message: 'I would like to work with you.',
  });

  const info = await mailer.send(transport, message);
  const sent = JSON.parse(info.message);

  assert.deepEqual(addresses(sent.to), ['owner@example.com']);
  assert.deepEqual(addresses(sent.from), ['portfolio@example.com']);
  assert.deepEqual(addresses(sent.replyTo), ['client@example.com']);
  assert.match(sent.subject, /client@example\.com/);
  assert.match(sent.text, /I would like to work with you\./);
});

test('recommendationMessage includes the author name and email', async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const message = mailer.recommendationMessage(CONFIG, {
    name: 'Jane Doe',
    email: 'jane@example.com',
    message: 'A pleasure to work with.',
  });

  const info = await mailer.send(transport, message);
  const sent = JSON.parse(info.message);

  assert.deepEqual(addresses(sent.to), ['owner@example.com']);
  assert.deepEqual(addresses(sent.replyTo), ['jane@example.com']);
  assert.match(sent.subject, /Jane Doe/);
  assert.match(sent.text, /jane@example\.com/);
  assert.match(sent.text, /A pleasure to work with\./);
});

test('previewUrl returns null for a non-test transport', () => {
  assert.equal(mailer.previewUrl({}), null);
});
