'use strict';

/* validate — input checking and cleanup for the two public forms.
 *
 * Everything a visitor types is untrusted. This module trims it, strips
 * control characters, enforces length limits and returns a plain result the
 * route can act on. Bodies are delivered as plain text (never HTML), so no
 * markup escaping is required here.
 */

const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_NAME_LENGTH = 120;

// A deliberately simple check: one "@", text either side, and a dotted domain.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Coerce any submitted value into a safe string.
 * Non-strings become '', control characters (except tab/newline) are removed
 * and surrounding whitespace is trimmed.
 *
 * @param {unknown} value
 * @returns {string}
 */
function clean(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/** @param {string} email */
function isValidEmail(email) {
  return EMAIL_PATTERN.test(email) && email.length <= MAX_EMAIL_LENGTH;
}

/**
 * Validate the "say hello" contact form (fields: email, message).
 *
 * @param {Record<string, unknown>} body
 * @returns {{ ok: boolean, errors: string[], value: { email: string, message: string } }}
 */
function validateContact(body) {
  const source = body || {};
  const email = clean(source.email);
  const message = clean(source.message);
  const errors = [];

  if (email === '') {
    errors.push('Please enter your email address so I can reply.');
  } else if (!isValidEmail(email)) {
    errors.push('That email address does not look right — please check it.');
  }

  if (message === '') {
    errors.push('Please write a short message.');
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.push(`Your message is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
  }

  return { ok: errors.length === 0, errors, value: { email, message } };
}

/**
 * Validate the recommendation form
 * (fields: name_rec, email_rec, message_rec).
 *
 * @param {Record<string, unknown>} body
 * @returns {{ ok: boolean, errors: string[], value: { name: string, email: string, message: string } }}
 */
function validateRecommendation(body) {
  const source = body || {};
  const name = clean(source.name_rec);
  const email = clean(source.email_rec);
  const message = clean(source.message_rec);
  const errors = [];

  if (name === '') {
    errors.push('Please add your name.');
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.push(`Your name is too long (max ${MAX_NAME_LENGTH} characters).`);
  }

  if (email === '') {
    errors.push('Please add your email address.');
  } else if (!isValidEmail(email)) {
    errors.push('That email address does not look right — please check it.');
  }

  if (message === '') {
    errors.push('Please write your recommendation.');
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.push(`Your recommendation is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
  }

  return { ok: errors.length === 0, errors, value: { name, email, message } };
}

module.exports = {
  clean,
  isValidEmail,
  validateContact,
  validateRecommendation,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
};
