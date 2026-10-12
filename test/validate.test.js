'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clean,
  isValidEmail,
  validateContact,
  validateRecommendation,
  MAX_MESSAGE_LENGTH,
} = require('../server/validate');

test('clean trims whitespace and strips control characters', () => {
  assert.equal(clean('  hello  '), 'hello');
  assert.equal(clean('a\u0000b\u0007c'), 'abc');
  assert.equal(clean(null), '');
  assert.equal(clean(42), '');
});

test('isValidEmail accepts normal addresses and rejects broken ones', () => {
  assert.equal(isValidEmail('client@example.com'), true);
  assert.equal(isValidEmail('a.b+c@sub.domain.co.uk'), true);
  assert.equal(isValidEmail('no-at-sign'), false);
  assert.equal(isValidEmail('missing@domain'), false);
  assert.equal(isValidEmail('spaces in@example.com'), false);
});

test('validateContact accepts a complete submission', () => {
  const result = validateContact({ email: 'client@example.com', message: 'Hello there' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { email: 'client@example.com', message: 'Hello there' });
});

test('validateContact reports missing fields', () => {
  const result = validateContact({ email: '', message: '' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});

test('validateContact rejects an invalid email and an over-long message', () => {
  const result = validateContact({
    email: 'nope',
    message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1),
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});

test('validateRecommendation accepts a complete submission', () => {
  const result = validateRecommendation({
    name_rec: 'Jane Doe',
    email_rec: 'jane@example.com',
    message_rec: 'Great to work with.',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    name: 'Jane Doe',
    email: 'jane@example.com',
    message: 'Great to work with.',
  });
});

test('validateRecommendation requires a name', () => {
  const result = validateRecommendation({
    name_rec: '   ',
    email_rec: 'jane@example.com',
    message_rec: 'Good.',
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /name/i);
});
